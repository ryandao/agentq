import { NextRequest, NextResponse } from "next/server";

import { withErrorLogging } from "@/src/server/api-handler";
import type { AgentDetailResponse } from "@/src/server/contracts";
import { getAgent, getAgentRecentRuns } from "@/src/server/store";
import {
    getAgentDependencyGraph,
    getAgentDurationStats,
    getAgentErrorPatterns,
    getAgentHourlyStats,
    getAgentRunStatusCounts,
    getAgentTokenStatsByModel,
} from "@/src/server/analytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_LOOKBACK_MS = 24 * 60 * 60 * 1000;

export const GET = withErrorLogging(
    "agents/:agentName",
    async (request: NextRequest, context?: { params: Record<string, string> }) => {
        const agentName = decodeURIComponent(context?.params?.agentName ?? "");
        if (!agentName) {
            return NextResponse.json({ error: "Agent name is required" }, { status: 400 });
        }

        const agent = await getAgent(agentName);
        if (!agent) {
            return NextResponse.json({ error: `Agent "${agentName}" not found` }, { status: 404 });
        }

        const url = new URL(request.url);
        const now = new Date();
        const from = url.searchParams.get("from")
            ? new Date(url.searchParams.get("from")!)
            : new Date(now.getTime() - DEFAULT_LOOKBACK_MS);
        const to = url.searchParams.get("to")
            ? new Date(url.searchParams.get("to")!)
            : now;

        const [runStats, durationStats, tokenStats, hourly, recentRuns, errorPatterns, allEdges] =
            await Promise.all([
                getAgentRunStatusCounts(agentName, from, to),
                getAgentDurationStats(agentName, from, to),
                getAgentTokenStatsByModel(agentName, from, to),
                getAgentHourlyStats(agentName, from, to),
                getAgentRecentRuns(agentName, 20),
                getAgentErrorPatterns(agentName, from, to),
                getAgentDependencyGraph(from, to),
            ]);

        const focusedEdges = allEdges.filter(
            (e) => e.source === agentName || e.target === agentName,
        );

        const response: AgentDetailResponse = {
            agent,
            run_stats: runStats,
            duration_stats: durationStats,
            token_stats: tokenStats,
            hourly,
            recent_runs: recentRuns,
            error_patterns: errorPatterns,
            dependency_graph: { edges: focusedEdges },
        };

        return NextResponse.json(response);
    },
);
