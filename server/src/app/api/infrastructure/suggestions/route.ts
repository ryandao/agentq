import { NextResponse } from "next/server";

import { withErrorLogging } from "@/src/server/api-handler";
import { generateInfraSuggestions } from "@/src/server/suggestions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withErrorLogging(
    "infrastructure/suggestions",
    async (request) => {
        const hoursParam = request.nextUrl.searchParams.get("hours");
        let lookbackHours = 24;
        if (hoursParam) {
            const parsed = Number.parseInt(hoursParam, 10);
            if (Number.isFinite(parsed) && parsed > 0) {
                lookbackHours = Math.min(parsed, 720);
            }
        }

        const result = await generateInfraSuggestions(lookbackHours);
        return NextResponse.json(result);
    },
);
