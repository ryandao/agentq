import { NextResponse } from "next/server";

import { withErrorLogging } from "@/src/server/api-handler";
import { SearchParserError } from "@/src/server/search";
import { searchRunsByNaturalLanguage } from "@/src/server/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withErrorLogging("runs/search", async (request) => {
    const body = (await request.json()) as { query?: string; timezone?: string };
    const query = typeof body.query === "string" ? body.query.trim() : "";
    const timezone = typeof body.timezone === "string" ? body.timezone : undefined;

    if (!query) {
        return NextResponse.json(
            { error: "Missing or empty 'query' field" },
            { status: 400 },
        );
    }

    try {
        const result = await searchRunsByNaturalLanguage(query, timezone);
        return NextResponse.json(result);
    } catch (error) {
        if (error instanceof SearchParserError) {
            return NextResponse.json(
                { error: error.message },
                { status: error.statusCode },
            );
        }
        throw error;
    }
});
