import { NextResponse } from "next/server";

import { withErrorLogging } from "@/src/server/api-handler";
import type { SessionsListResponse } from "@/src/server/contracts";
import { listSessions } from "@/src/server/store";
import type { SessionFilters } from "@/src/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withErrorLogging("sessions", async (request) => {
    const params = request.nextUrl.searchParams;

    const limitValue = Number.parseInt(params.get("limit") || "100", 10);
    const limit = Number.isFinite(limitValue)
        ? Math.max(1, Math.min(limitValue, 500))
        : 100;

    const filters: SessionFilters = {};
    const status = params.get("status");
    if (status) filters.status = status;
    const userId = params.get("user_id");
    if (userId) filters.userId = userId;
    const search = params.get("search");
    if (search) filters.search = search;
    const from = params.get("from");
    if (from) filters.from = from;
    const to = params.get("to");
    if (to) filters.to = to;

    const sessions = await listSessions(limit, filters);
    const result: SessionsListResponse = { sessions };
    return NextResponse.json(result);
});
