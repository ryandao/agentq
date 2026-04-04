import { NextResponse } from "next/server";

import { withErrorLogging } from "@/src/server/api-handler";
import { getObservedRunDetail } from "@/src/server/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withErrorLogging("runs/:runId", async (_request, context) => {
    const runId = context!.params.runId;
    const detail = await getObservedRunDetail(runId);
    if (!detail) {
        return NextResponse.json(
            { error: "Run not found" },
            { status: 404 },
        );
    }

    return NextResponse.json(detail);
});
