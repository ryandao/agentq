import { getGeminiClient, GEMINI_MODEL } from "@/src/lib/gemini";

function previewToText(preview: unknown): string {
    if (preview === null || preview === undefined) return "";
    if (typeof preview === "string") return preview;
    try {
        return JSON.stringify(preview);
    } catch {
        return String(preview);
    }
}

export async function generateSessionTitle(
    taskName: string | null | undefined,
    inputPreview: unknown,
): Promise<string | null> {
    const client = getGeminiClient();
    if (!client) return null;

    const inputText = previewToText(inputPreview);
    const prompt = [
        "Generate a concise 5-10 word title summarizing this agent task.",
        taskName ? `Task: ${taskName}` : null,
        inputText ? `Input: ${inputText.slice(0, 2000)}` : null,
        "Return ONLY the title text, no quotes or punctuation wrapping.",
    ]
        .filter(Boolean)
        .join("\n");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);

    try {
        const response = await client.models.generateContent({
            model: GEMINI_MODEL,
            contents: prompt,
            config: {
                abortSignal: controller.signal,
            },
        });

        const text = response.text?.trim();
        if (!text) return null;
        return text.replace(/^["']|["']$/g, "").slice(0, 200);
    } catch (error) {
        console.warn("[session-title] Failed to generate title:", error);
        return null;
    } finally {
        clearTimeout(timeout);
    }
}

export interface RunSnapshot {
    task_name: string | null;
    status: string;
    input_preview: unknown;
    output_preview: unknown;
    error: string | null;
}

export async function generateSessionSummary(
    runs: RunSnapshot[],
): Promise<string | null> {
    const client = getGeminiClient();
    if (!client) return null;
    if (runs.length === 0) return null;

    const runDescriptions = runs.map((r, i) => {
        const parts = [`Step ${i + 1}`];
        if (r.task_name) parts[0] += ` (${r.task_name})`;
        parts.push(`Status: ${r.status}`);
        const input = previewToText(r.input_preview);
        if (input) parts.push(`Input: ${input.slice(0, 500)}`);
        const output = previewToText(r.output_preview);
        if (output) parts.push(`Output: ${output.slice(0, 500)}`);
        if (r.error) parts.push(`Error: ${r.error.slice(0, 300)}`);
        return parts.join("\n  ");
    });

    const prompt = [
        "Write a concise natural language summary (2-4 sentences) of the following agent session.",
        "Describe what the user asked, what the agent did, and the outcome.",
        "Write in past tense. Do not use bullet points or markdown formatting.",
        "",
        ...runDescriptions,
    ].join("\n");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

    try {
        const response = await client.models.generateContent({
            model: GEMINI_MODEL,
            contents: prompt.slice(0, 8000),
            config: {
                abortSignal: controller.signal,
            },
        });

        const text = response.text?.trim();
        if (!text) return null;
        return text.slice(0, 2000);
    } catch (error) {
        console.warn("[session-title] Failed to generate summary:", error);
        return null;
    } finally {
        clearTimeout(timeout);
    }
}
