import { z } from "zod/v4";

import { getGeminiClient, GEMINI_MODEL } from "@/src/lib/gemini";
import type { RunSearchFilters } from "./contracts";

const RunSearchFiltersSchema = z.object({
    status: z
        .array(z.enum(["PENDING", "RUNNING", "SUCCESS", "FAILURE", "ABORTED"]))
        .optional()
        .describe("Filter by run status. Only include if the query mentions success, failure, errors, running, pending, etc."),
    agent_name: z
        .string()
        .optional()
        .describe("Partial agent / task name to match (case-insensitive). Only include if the query mentions a specific agent or task name."),
    date_from: z
        .string()
        .optional()
        .describe("ISO 8601 date-time string for the start of the time range."),
    date_to: z
        .string()
        .optional()
        .describe("ISO 8601 date-time string for the end of the time range."),
    min_tokens: z
        .number()
        .optional()
        .describe("Minimum total token count. Interpret shorthand like '50k' as 50000."),
    max_tokens: z
        .number()
        .optional()
        .describe("Maximum total token count."),
    min_duration_ms: z
        .number()
        .optional()
        .describe("Minimum run duration in milliseconds. Convert from human units: '5 minutes' = 300000, '30 seconds' = 30000."),
    max_duration_ms: z
        .number()
        .optional()
        .describe("Maximum run duration in milliseconds."),
    text: z
        .string()
        .optional()
        .describe("Free-text substring to match against task name, error message, or worker name. Use only for terms that don't fit other fields."),
});

const filtersJsonSchema = z.toJSONSchema(RunSearchFiltersSchema);

function getLocalDate(timezone?: string): string {
    try {
        if (timezone) {
            return new Date().toLocaleDateString("en-CA", { timeZone: timezone });
        }
    } catch {
        // Invalid timezone, fall through to UTC
    }
    return new Date().toISOString().slice(0, 10);
}

function getIsoOffset(timezone?: string): string {
    try {
        if (timezone) {
            const now = new Date();
            const utcStr = now.toLocaleString("en-US", { timeZone: "UTC" });
            const tzStr = now.toLocaleString("en-US", { timeZone: timezone });
            const diffMs = new Date(tzStr).getTime() - new Date(utcStr).getTime();
            const totalMinutes = Math.round(diffMs / 60_000);
            const sign = totalMinutes >= 0 ? "+" : "-";
            const absMin = Math.abs(totalMinutes);
            const h = String(Math.floor(absMin / 60)).padStart(2, "0");
            const m = String(absMin % 60).padStart(2, "0");
            return `${sign}${h}:${m}`;
        }
    } catch {
        // Fall through
    }
    return "+00:00";
}

function buildSystemPrompt(timezone?: string): string {
    const today = getLocalDate(timezone);
    const offset = getIsoOffset(timezone);
    const tzLabel = timezone ? `${timezone} (${offset})` : "UTC";

    return `You are a search query parser for an agent observability platform. Convert natural language queries about "runs" into structured JSON filters.

Today's date is ${today} in the user's timezone: ${tzLabel}.

Rules:
- Only populate fields that the query explicitly or implicitly references. Omit fields that are not relevant.
- Valid statuses: PENDING, RUNNING, SUCCESS, FAILURE, ABORTED.
- "failed" / "errors" / "broken" → status: ["FAILURE"]
- "successful" / "passed" / "completed" → status: ["SUCCESS"]
- "running" / "in progress" / "active" → status: ["RUNNING"]
- For dates: always output full ISO 8601 date-time strings with the user's timezone offset. "today" means ${today}T00:00:00${offset} to ${today}T23:59:59${offset}. "yesterday" means the day before in the same timezone. "on 3/20" means March 20 of the current year in the user's timezone.
- For tokens: "50k" = 50000, "100k" = 100000.
- For duration: "slow" → min_duration_ms: 60000, "fast" → max_duration_ms: 10000, "longer than 5 minutes" → min_duration_ms: 300000, "under 30 seconds" → max_duration_ms: 30000.
- If the query is just an agent/task name (e.g. "PlannerAgent"), set agent_name only.
- Use the text field as a last resort for terms that don't fit structured fields.`;
}

export class SearchParserError extends Error {
    constructor(
        message: string,
        public readonly statusCode: number,
    ) {
        super(message);
        this.name = "SearchParserError";
    }
}

export async function parseSearchQuery(
    query: string,
    timezone?: string,
): Promise<RunSearchFilters> {
    const client = getGeminiClient();
    if (!client) {
        throw new SearchParserError(
            "Search service not configured – GEMINI_API_KEY is missing",
            502,
        );
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    try {
        const response = await client.models.generateContent({
            model: GEMINI_MODEL,
            contents: query,
            config: {
                systemInstruction: buildSystemPrompt(timezone),
                responseMimeType: "application/json",
                responseJsonSchema: filtersJsonSchema,
                abortSignal: controller.signal,
            },
        });

        const text = response.text;
        if (!text) {
            throw new SearchParserError(
                "Could not interpret search query – empty response from model",
                422,
            );
        }

        const parsed = JSON.parse(text);
        const result = RunSearchFiltersSchema.safeParse(parsed);
        if (!result.success) {
            console.error(
                "[search] Zod validation failed for Gemini response:",
                text,
                result.error.issues,
            );
            throw new SearchParserError(
                "Could not interpret search query – try rephrasing or use manual filters",
                422,
            );
        }

        return result.data as RunSearchFilters;
    } catch (error) {
        if (error instanceof SearchParserError) throw error;

        if (error instanceof DOMException && error.name === "AbortError") {
            throw new SearchParserError(
                "Search parsing timed out – please try manual filters",
                502,
            );
        }

        console.error("[search] Gemini API error:", error);
        throw new SearchParserError(
            "Search parsing temporarily unavailable – please try manual filters",
            502,
        );
    } finally {
        clearTimeout(timeout);
    }
}
