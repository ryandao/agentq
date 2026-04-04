import { NextResponse } from "next/server";

import { withErrorLogging } from "@/src/server/api-handler";
import { getRunsPage } from "@/src/server/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withErrorLogging("runs", async (request) => {
    const params = request.nextUrl.searchParams;

    const page = Math.max(1, Number.parseInt(params.get("page") || "1", 10) || 1);
    const pageSize = Math.min(
        200,
        Math.max(1, Number.parseInt(params.get("pageSize") || "25", 10) || 25),
    );

    const statusRaw = params.get("status");
    const status = statusRaw
        ? statusRaw.split(",").map((s) => s.trim().toUpperCase())
        : undefined;

    const result = await getRunsPage({
        page,
        pageSize,
        from: params.get("from") || undefined,
        to: params.get("to") || undefined,
        status: status?.length ? status : undefined,
        agentName: params.get("agent_name") || undefined,
        text: params.get("text") || undefined,
    });

    return NextResponse.json(result);
});
