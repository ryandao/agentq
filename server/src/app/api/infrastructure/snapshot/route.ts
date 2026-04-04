import { NextResponse } from "next/server";

import { withErrorLogging } from "@/src/server/api-handler";
import { getQueueSnapshot } from "@/src/server/queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withErrorLogging("infrastructure/snapshot", async () => {
    const snapshot = await getQueueSnapshot();
    return NextResponse.json(snapshot);
});
