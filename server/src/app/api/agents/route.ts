import { NextRequest, NextResponse } from "next/server";

import { withErrorLogging } from "@/src/server/api-handler";
import type { AgentsListResponse } from "@/src/server/contracts";
import { listAgents } from "@/src/server/store";
import {
    getAgentDependencyGraph,
    getAgentRunStats,
} from "@/src/server/analytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_LOOKBACK_MS = 24 * 60 * 60 * 1000;

export const GET = withErrorLogging("agents", async (request: NextRequest) => {
    const url = new URL(request.url);
    const now = new Date();
    const from = url.searchParams.get("from")
        ? new Date(url.searchParams.get("from")!)
        : new Date(now.getTime() - DEFAULT_LOOKBACK_MS);
    const to = url.searchParams.get("to")
        ? new Date(url.searchParams.get("to")!)
        : now;

    const [agents, agentRunStats, depEdges] = await Promise.all([
        listAgents(),
        getAgentRunStats(from, to),
        getAgentDependencyGraph(from, to),
    ]);

    const response: AgentsListResponse = {
        agents,
        agent_run_stats: agentRunStats,
        dependency_graph: { edges: depEdges },
    };

    return NextResponse.json(response);
});
