"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
    FeatherLoader,
} from "@subframe/core";
import { Badge } from "@/src/ui/components/Badge";
import type { AgentDependencyEdge, AgentRunStats, AgentSummary } from "@/src/client/api";
import { useAgentsData } from "@/src/client/lib/hooks";
import { compactNumber, formatDurationMs } from "@/src/client/lib/format";
import { getHealthBadge } from "@/src/client/lib/helpers";
import { EmptyState } from "@/src/client/components/shared";

const GRAPH_HEIGHT = 520;

const GROUP_COLORS = {
    agent: {
        background: "#1e3a5f",
        border: "#60a5fa",
        highlight: { background: "#1e4a7f", border: "#93c5fd" },
        hover: { background: "#1e4a7f", border: "#93c5fd" },
    },
    tool: {
        background: "#14532d",
        border: "#4ade80",
        highlight: { background: "#1a6b3a", border: "#86efac" },
        hover: { background: "#1a6b3a", border: "#86efac" },
    },
    llm: {
        background: "#3b0764",
        border: "#c084fc",
        highlight: { background: "#4c0d83", border: "#d8b4fe" },
        hover: { background: "#4c0d83", border: "#d8b4fe" },
    },
};

const FONT_COLORS: Record<string, string> = {
    agent: "#dbeafe",
    tool: "#dcfce7",
    llm: "#f3e8ff",
};

function AgentDependencyGraphView({
    edges,
    agents,
    statsMap,
    focusAgent,
}: {
    edges: AgentDependencyEdge[];
    agents: AgentSummary[];
    statsMap: Map<string, AgentRunStats>;
    focusAgent?: string;
}) {
    const router = useRouter();
    const routerRef = useRef(router);
    routerRef.current = router;
    const containerRef = useRef<HTMLDivElement>(null);
    const networkRef = useRef<any>(null);
    const [showTools, setShowTools] = useState(false);
    const [showLlms, setShowLlms] = useState(false);

    const filteredEdges = useMemo(() => {
        let result = edges;
        if (!showTools) result = result.filter((e) => e.target_type !== "tool");
        if (!showLlms) result = result.filter((e) => e.target_type !== "llm");
        if (focusAgent) result = result.filter((e) => e.source === focusAgent || e.target === focusAgent);
        return result;
    }, [edges, showTools, showLlms, focusAgent]);

    const agentNames = useMemo(() => new Set(agents.map((a) => a.name)), [agents]);

    const dataRef = useRef({ agents, filteredEdges, agentNames, statsMap });
    dataRef.current = { agents, filteredEdges, agentNames, statsMap };

    const fingerprint = useMemo(() => {
        const nodeParts: string[] = [];
        const seen = new Set<string>();
        for (const a of agents) {
            const health = getHealthBadge(statsMap.get(a.name));
            const hc = health?.variant === "error" ? "e" : health?.variant === "warning" ? "w" : health?.variant === "success" ? "s" : "";
            nodeParts.push(`${a.name}:agent:${hc}`);
            seen.add(a.name);
        }
        for (const e of filteredEdges) {
            if (!seen.has(e.source)) { nodeParts.push(`${e.source}:agent:`); seen.add(e.source); }
            if (!seen.has(e.target)) {
                const type = agentNames.has(e.target) ? "agent" : e.target_type;
                nodeParts.push(`${e.target}:${type}:`);
                seen.add(e.target);
            }
        }
        const edgeParts = filteredEdges.map((e) => `${e.source}>${e.target}:${e.call_count}`);
        return nodeParts.sort().join(",") + "|" + edgeParts.sort().join(",");
    }, [agents, filteredEdges, agentNames, statsMap]);

    useEffect(() => {
        const container = containerRef.current;
        if (!container || fingerprint === "|") return;

        let cancelled = false;

        (async () => {
            const vis = await import("vis-network/standalone");
            if (cancelled) return;

            if (networkRef.current) {
                networkRef.current.destroy();
                networkRef.current = null;
            }

            const { agents: ag, filteredEdges: fe, agentNames: an, statsMap: sm } = dataRef.current;

            const nodeMap = new Map<string, any>();
            for (const a of ag) {
                const health = getHealthBadge(sm.get(a.name));
                const healthColor = health?.variant === "error" ? "#ef4444" : health?.variant === "warning" ? "#f59e0b" : health?.variant === "success" ? "#22c55e" : undefined;
                const colors = GROUP_COLORS.agent;
                nodeMap.set(a.name, {
                    id: a.name,
                    label: a.name,
                    group: "agent",
                    color: healthColor
                        ? { ...colors, border: healthColor, highlight: { ...colors.highlight, border: healthColor }, hover: { ...colors.hover, border: healthColor } }
                        : colors,
                    font: { color: FONT_COLORS.agent, size: 12, face: "Inter, system-ui, sans-serif", bold: { color: FONT_COLORS.agent } },
                });
            }
            for (const e of fe) {
                if (!nodeMap.has(e.source)) {
                    nodeMap.set(e.source, {
                        id: e.source, label: e.source, group: "agent",
                        color: GROUP_COLORS.agent,
                        font: { color: FONT_COLORS.agent, size: 12, face: "Inter, system-ui, sans-serif" },
                    });
                }
                if (!nodeMap.has(e.target)) {
                    const type = an.has(e.target) ? "agent" : e.target_type;
                    const colors = GROUP_COLORS[type as keyof typeof GROUP_COLORS] ?? GROUP_COLORS.agent;
                    nodeMap.set(e.target, {
                        id: e.target, label: e.target, group: type,
                        color: colors,
                        font: { color: FONT_COLORS[type] ?? FONT_COLORS.agent, size: type === "agent" ? 12 : 10, face: "Inter, system-ui, sans-serif" },
                    });
                }
            }

            const visEdges = fe
                .filter((e) => nodeMap.has(e.source) && nodeMap.has(e.target))
                .map((e, i) => ({
                    id: `e${i}`,
                    from: e.source,
                    to: e.target,
                    label: `${e.call_count}x`,
                    width: 1 + (e.call_count / Math.max(...fe.map((x) => x.call_count), 1)) * 2,
                }));

            const network = new vis.Network(
                container,
                { nodes: Array.from(nodeMap.values()), edges: visEdges },
                {
                    physics: {
                        solver: "barnesHut",
                        barnesHut: {
                            gravitationalConstant: -1000,
                            centralGravity: 1.2,
                            springLength: 150,
                            springConstant: 0.04,
                            avoidOverlap: 0.6,
                            damping: 0.09,
                        },
                        stabilization: { enabled: true, iterations: 300, fit: true },
                    },
                    nodes: {
                        shape: "box",
                        margin: { top: 6, bottom: 6, left: 10, right: 10 },
                        borderWidth: 2,
                        borderWidthSelected: 3,
                    },
                    edges: {
                        arrows: { to: { enabled: true, scaleFactor: 0.5 } },
                        color: { color: "#475569", highlight: "#60a5fa", hover: "#60a5fa", opacity: 0.8 },
                        smooth: { enabled: true, type: "continuous", roundness: 0.2 },
                        font: { size: 9, color: "#64748b", strokeWidth: 0, align: "middle" },
                    },
                    interaction: {
                        hover: true,
                        tooltipDelay: 200,
                        zoomView: true,
                        dragView: true,
                        dragNodes: true,
                    },
                },
            );

            networkRef.current = network;

            network.once("stabilizationIterationsDone", () => {
                network.setOptions({ physics: false });
                network.fit({ animation: { duration: 400, easingFunction: "easeInOutQuad" } });
            });

            network.on("click", (params: any) => {
                if (params.nodes?.length > 0) {
                    const nodeId = params.nodes[0];
                    const node = nodeMap.get(nodeId);
                    if (node?.group === "agent") {
                        routerRef.current.push(`/agents/${encodeURIComponent(nodeId)}`);
                    }
                }
            });

            network.on("hoverNode", () => {
                container.style.cursor = "pointer";
            });
            network.on("blurNode", () => {
                container.style.cursor = "default";
            });
        })();

        return () => {
            cancelled = true;
            if (networkRef.current) {
                networkRef.current.destroy();
                networkRef.current = null;
            }
        };
    }, [fingerprint]);

    const hasNodes = agents.length > 0 || filteredEdges.length > 0;
    if (!hasNodes) return null;

    return (
        <div className="flex w-full flex-col gap-3">
            <div className="flex items-center gap-4">
                <span className="text-body-bold font-body-bold text-default-font">Agent Graph</span>
                <label className="flex items-center gap-1.5 text-caption font-caption text-subtext-color cursor-pointer">
                    <input type="checkbox" checked={showTools} onChange={(e) => setShowTools(e.target.checked)} className="rounded" />
                    Tools
                </label>
                <label className="flex items-center gap-1.5 text-caption font-caption text-subtext-color cursor-pointer">
                    <input type="checkbox" checked={showLlms} onChange={(e) => setShowLlms(e.target.checked)} className="rounded" />
                    LLMs
                </label>
            </div>
            <div
                ref={containerRef}
                className="w-full overflow-hidden rounded-lg border border-solid border-neutral-border shadow-sm"
                style={{ height: GRAPH_HEIGHT, background: "#0f172a" }}
            />
        </div>
    );
}

export { AgentDependencyGraphView };

export function AgentsPageView() {
    const { data, loading } = useAgentsData();
    const agents = data?.agents ?? [];
    const depGraph = data?.dependency_graph;

    const statsMap = useMemo(() => {
        const m = new Map<string, AgentRunStats>();
        for (const s of data?.agent_run_stats ?? []) m.set(s.agent_name, s);
        return m;
    }, [data?.agent_run_stats]);

    return (
        <div className="flex w-full flex-col gap-6">
            {!loading && agents.length > 0 ? (
                <AgentDependencyGraphView edges={depGraph?.edges ?? []} agents={agents} statsMap={statsMap} />
            ) : null}

            <div className="flex w-full flex-col gap-3">
                {loading ? (
                    <div className="flex w-full items-center justify-center py-12">
                        <FeatherLoader className="animate-spin text-neutral-400" />
                    </div>
                ) : agents.length === 0 ? (
                    <EmptyState title="No agents registered" description="Register agents using the Python SDK to see them here." />
                ) : (
                    <div className="flex w-full flex-col gap-3">
                        {agents.map((agentItem) => {
                            const stats = statsMap.get(agentItem.name);
                            const health = getHealthBadge(stats);
                            return (
                                <Link
                                    key={agentItem.name}
                                    href={`/agents/${encodeURIComponent(agentItem.name)}`}
                                    className="flex w-full flex-col rounded-md border border-solid border-neutral-border bg-default-background p-4 shadow-sm hover:border-brand-200 transition-colors"
                                >
                                    <div className="flex w-full items-center gap-3">
                                        <span className="text-body-bold font-body-bold text-default-font">
                                            {agentItem.name}
                                        </span>
                                        {agentItem.version ? (
                                            <Badge variant="neutral">v{agentItem.version}</Badge>
                                        ) : null}
                                        <Badge variant={health.variant}>{health.label}</Badge>
                                        <span className="grow" />
                                        {stats ? (
                                            <div className="flex items-center gap-4 text-caption font-caption text-subtext-color">
                                                <span>{compactNumber(stats.total_runs)} runs</span>
                                                <span>{stats.total_runs > 0 ? ((stats.success_count / stats.total_runs) * 100).toFixed(1) : 0}%</span>
                                                <span>{formatDurationMs(stats.avg_duration_ms)}</span>
                                                <span>{compactNumber(stats.total_tokens)} tokens</span>
                                            </div>
                                        ) : (
                                            <Badge variant="neutral">{agentItem.total_spans ?? 0} spans</Badge>
                                        )}
                                    </div>
                                    {agentItem.description ? (
                                        <span className="mt-1 text-caption font-caption text-subtext-color">
                                            {agentItem.description}
                                        </span>
                                    ) : null}
                                    <div className="mt-1 flex items-center gap-3 text-caption font-caption text-subtext-color">
                                        <span>Registered {new Date(agentItem.registered_at).toLocaleString()}</span>
                                        {agentItem.metadata && Object.keys(agentItem.metadata).length > 0 ? (
                                            <span className="flex items-center gap-1">
                                                {Object.entries(agentItem.metadata).slice(0, 3).map(([k, v]) => (
                                                    <Badge key={k} variant="neutral">{k}: {String(v)}</Badge>
                                                ))}
                                            </span>
                                        ) : null}
                                    </div>
                                </Link>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
