import { NextResponse } from "next/server";

import { withErrorLogging } from "@/src/server/api-handler";
import { getRunChartStats } from "@/src/server/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withErrorLogging("runs/stats", async (request) => {
    const from = request.nextUrl.searchParams.get("from");
    const to = request.nextUrl.searchParams.get("to");

    if (!from || !to) {
        return NextResponse.json(
            { error: "Both 'from' and 'to' query params are required" },
            { status: 400 },
        );
    }

    const result = await getRunChartStats(from, to);
    return NextResponse.json(result);
});
