"use client";

import { ReactNode, useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
    FeatherActivity,
    FeatherAlertCircle,
    FeatherCheck,
    FeatherChevronLeft,
    FeatherChevronRight,
    FeatherClock,
    FeatherClipboardCopy,
    FeatherHash,
    FeatherLayers,
    FeatherLoader,
    FeatherServer,
    FeatherZap,
} from "@subframe/core";
import { Badge } from "@/src/ui/components/Badge";
import type { ObservedEvent, StepNode, TokenSummary, WaterfallEntry } from "@/src/client/api";
import { useObservedRunDetail } from "@/src/client/lib/hooks";
import { formatDate, durationLabel, previewToString, compactNumber } from "@/src/client/lib/format";
import { getStatusVariant, getHealthBadge } from "@/src/client/lib/helpers";
import type { ChatMessage, RunDetailTab } from "@/src/client/lib/types";
import {
    ErrorBanner,
    EmptyState,
    StatCard,
    SectionCard,
    LoadingPanel,
    CollapsiblePre,
    CopyablePre,
    getStatusIcon,
} from "@/src/client/components/shared";

const RUN_TYPE_BAR_COLORS: Record<string, string> = {
    agent: "bg-brand-500",
    llm: "bg-blue-500",
    tool: "bg-amber-500",
};

function StepsTab({
    steps,
    selectedSpanId,
    onSelectSpan,
}: {
    steps: StepNode[];
    selectedSpanId: string | null;
    onSelectSpan: (id: string | null) => void;
}) {
    const selected = useMemo(() => {
        function find(nodes: StepNode[]): StepNode | null {
            for (const node of nodes) {
                if (node.span.span_id === selectedSpanId) return node;
                const child = find(node.children);
                if (child) return child;
            }
            return null;
        }
        return selectedSpanId ? find(steps) : null;
    }, [steps, selectedSpanId]);

    const [leftPct, setLeftPct] = useState(60);
    const dragging = useRef(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const onMouseDown = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        dragging.current = true;

        const onMouseMove = (ev: MouseEvent) => {
            if (!dragging.current || !containerRef.current) return;
            const rect = containerRef.current.getBoundingClientRect();
            const pct = ((ev.clientX - rect.left) / rect.width) * 100;
            setLeftPct(Math.min(80, Math.max(30, pct)));
        };

        const onMouseUp = () => {
            dragging.current = false;
            document.removeEventListener("mousemove", onMouseMove);
            document.removeEventListener("mouseup", onMouseUp);
            document.body.style.cursor = "";
            document.body.style.userSelect = "";
        };

        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
        document.addEventListener("mousemove", onMouseMove);
        document.addEventListener("mouseup", onMouseUp);
    }, []);

    return (
        <div ref={containerRef} className="flex w-full" style={{ height: "70vh" }}>
            <div className="flex flex-col gap-1 overflow-y-auto pr-2" style={{ width: `${leftPct}%` }}>
                {steps.length === 0 ? (
                    <EmptyState title="No steps captured yet" description="Steps will appear once the run emits trace data." />
                ) : (
                    steps.map((node) => (
                        <StepListNode
                            key={node.span.span_id}
                            node={node}
                            depth={0}
                            selectedSpanId={selectedSpanId}
                            onSelect={onSelectSpan}
                        />
                    ))
                )}
            </div>
            <div
                className="flex-none flex items-stretch cursor-col-resize group px-1"
                onMouseDown={onMouseDown}
            >
                <div className="w-px bg-neutral-border group-hover:w-[3px] group-hover:bg-brand-600 transition-all rounded-full" />
            </div>
            <div className="flex flex-col gap-4 overflow-y-auto pl-2" style={{ width: `${100 - leftPct}%` }}>
                {selected ? (
                    <StepDetailPanel node={selected} />
                ) : (
                    <div className="flex h-full items-center justify-center">
                        <span className="text-caption font-caption text-subtext-color">
                            Select a step to view details
                        </span>
                    </div>
                )}
            </div>
        </div>
    );
}

function StepListNode({
    node,
    depth,
    selectedSpanId,
    onSelect,
}: {
    node: StepNode;
    depth: number;
    selectedSpanId: string | null;
    onSelect: (id: string | null) => void;
}) {
    const isSelected = node.span.span_id === selectedSpanId;
    const [expanded, setExpanded] = useState(depth < 2);
    const hasChildren = node.children.length > 0;

    return (
        <div className="flex flex-col" style={{ paddingLeft: depth > 0 ? 16 : 0 }}>
            <div
                className={`flex w-full items-center gap-2 rounded-md px-3 py-2 cursor-pointer transition-colors ${isSelected ? "bg-brand-50 border border-solid border-brand-200" : "hover:bg-neutral-100 border border-solid border-transparent"}`}
                onClick={() => onSelect(isSelected ? null : node.span.span_id)}
            >
                {hasChildren ? (
                    <button
                        className="flex-none p-0.5"
                        onClick={(e) => {
                            e.stopPropagation();
                            setExpanded(!expanded);
                        }}
                    >
                        <FeatherChevronRight
                            className={`h-3 w-3 text-subtext-color transition-transform ${expanded ? "rotate-90" : ""}`}
                        />
                    </button>
                ) : (
                    <div className="w-4 flex-none" />
                )}
                <div className={`h-2 w-2 flex-none rounded-full ${node.span.status === "SUCCESS" ? "bg-success-500" : node.span.status === "FAILURE" ? "bg-error-500" : "bg-warning-500"}`} />
                <Badge variant="neutral">{node.span.run_type}</Badge>
                <span className="min-w-0 grow text-body font-body text-default-font truncate">
                    {node.span.name}
                </span>
                <span className="text-caption font-caption text-subtext-color whitespace-nowrap flex-none">
                    {durationLabel(node.span.started_at, node.span.finished_at)}
                </span>
            </div>
            {expanded && hasChildren ? (
                <div className="flex flex-col gap-0.5">
                    {node.children.map((child) => (
                        <StepListNode
                            key={child.span.span_id}
                            node={child}
                            depth={depth + 1}
                            selectedSpanId={selectedSpanId}
                            onSelect={onSelect}
                        />
                    ))}
                </div>
            ) : null}
        </div>
    );
}

function extractMessages(data: Record<string, unknown> | null | undefined): {
    system: string | null;
    messages: ChatMessage[];
} | null {
    if (!data) return null;

    if (Array.isArray(data)) {
        const systemMsg = data.find((m: ChatMessage) => m.role === "system");
        const rest = data.filter((m: ChatMessage) => m.role !== "system");
        return {
            system: systemMsg ? String(systemMsg.content ?? "") : null,
            messages: rest,
        };
    }

    if ("messages" in data && Array.isArray(data.messages)) {
        return {
            system: data.system ? String(data.system) : null,
            messages: data.messages as ChatMessage[],
        };
    }

    if ("contents" in data) {
        let contents: ChatMessage[];
        if (Array.isArray(data.contents)) {
            contents = data.contents as ChatMessage[];
        } else if (typeof data.contents === "string") {
            contents = [{ role: "user", content: data.contents }];
        } else {
            contents = [];
        }
        return {
            system: data.system_instruction ? String(data.system_instruction) : null,
            messages: contents,
        };
    }

    return null;
}

const ROLE_LABEL_COLOR: Record<string, string> = {
    system: "text-brand-600",
    user: "text-brand-600",
    assistant: "text-success-700",
    tool: "text-warning-700",
};

function estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
}

function splitPromptTokens(
    promptTokens: number | undefined,
    systemChars: number,
    messagesChars: number,
): { systemTokens: number; messagesTokens: number } {
    if (!promptTokens) {
        return { systemTokens: estimateTokens("x".repeat(systemChars)), messagesTokens: estimateTokens("x".repeat(messagesChars)) };
    }
    const totalChars = systemChars + messagesChars;
    if (totalChars === 0) return { systemTokens: 0, messagesTokens: 0 };
    const systemTokens = Math.round((systemChars / totalChars) * promptTokens);
    return { systemTokens, messagesTokens: promptTokens - systemTokens };
}

function TokenLabel({ tokens, estimated }: { tokens: number; estimated: boolean }) {
    return (
        <span className="text-caption font-caption text-subtext-color ml-1">
            ({estimated ? "~" : ""}{tokens.toLocaleString()} tokens)
        </span>
    );
}

function SystemPromptBlock({ content, tokens, estimated }: { content: string; tokens: number; estimated: boolean }) {
    const [expanded, setExpanded] = useState(false);

    return (
        <div className="flex flex-col gap-1">
            <button
                className="flex items-center gap-1 text-caption-bold font-caption-bold text-subtext-color hover:text-default-font self-start"
                onClick={() => setExpanded(!expanded)}
            >
                <FeatherChevronRight className={`h-3 w-3 transition-transform ${expanded ? "rotate-90" : ""}`} />
                System Prompt
                <TokenLabel tokens={tokens} estimated={estimated} />
            </button>
            {expanded ? (
                <CopyablePre content={content} />
            ) : null}
        </div>
    );
}

function MessagesBlock({ messages, tokens, estimated }: { messages: ChatMessage[]; tokens: number; estimated: boolean }) {
    const [expanded, setExpanded] = useState(false);

    return (
        <div className="flex flex-col gap-1">
            <button
                className="flex items-center gap-1 text-caption-bold font-caption-bold text-subtext-color hover:text-default-font self-start"
                onClick={() => setExpanded(!expanded)}
            >
                <FeatherChevronRight className={`h-3 w-3 transition-transform ${expanded ? "rotate-90" : ""}`} />
                Messages
                <TokenLabel tokens={tokens} estimated={estimated} />
            </button>
            {expanded ? (
                <div className="flex flex-col gap-2 max-h-[600px] overflow-y-auto">
                    {messages.map((msg, i) => (
                        <MessageBubble key={i} role={String(msg.role ?? "unknown")} content={msg.content} />
                    ))}
                </div>
            ) : null}
        </div>
    );
}

function MessageBubble({ role, content }: { role: string; content: unknown }) {
    const labelColor = ROLE_LABEL_COLOR[role] ?? "text-subtext-color";
    const text = typeof content === "string" ? content : JSON.stringify(content, null, 2);

    return (
        <div className="flex flex-col gap-1">
            <span className={`text-[11px] font-bold uppercase tracking-wide ${labelColor}`}>{role}</span>
            <CopyablePre content={text ?? ""} maxH="max-h-[300px]" />
        </div>
    );
}

function CollapsibleDataSection({
    label,
    data,
    variant = "neutral",
    tokenCount,
}: {
    label: string;
    data?: Record<string, unknown> | null;
    variant?: "neutral" | "brand" | "warning";
    tokenCount?: number;
}) {
    const [expanded, setExpanded] = useState(false);
    if (!data || Object.keys(data).length === 0) return null;

    const colorMap = {
        neutral: "text-subtext-color",
        brand: "text-brand-700",
        warning: "text-warning-700",
    };

    return (
        <div className="flex flex-col gap-1">
            <button
                className={`flex items-center gap-1 text-caption-bold font-caption-bold ${colorMap[variant]} hover:underline`}
                onClick={() => setExpanded(!expanded)}
            >
                <FeatherChevronRight className={`h-3 w-3 transition-transform ${expanded ? "rotate-90" : ""}`} />
                {label}
                {tokenCount != null ? (
                    <span className="text-caption font-caption text-subtext-color ml-1">
                        ({tokenCount.toLocaleString()} tokens)
                    </span>
                ) : null}
            </button>
            {expanded ? (
                <CopyablePre content={JSON.stringify(data, null, 2)} className="text-[11px]" />
            ) : null}
        </div>
    );
}

function LlmInputSection({ data, promptTokens }: { data?: Record<string, unknown> | null; promptTokens?: number }) {
    const [showRaw, setShowRaw] = useState(false);

    if (!data || Object.keys(data).length === 0) return null;

    const parsed = extractMessages(data);

    if (!parsed || (parsed.messages.length === 0 && !parsed.system)) {
        return <CollapsibleDataSection label="LLM Input" data={data} variant="brand" />;
    }

    const { system, messages } = parsed;
    const messagesText = messages.map((m) => (typeof m.content === "string" ? m.content : JSON.stringify(m.content))).join("");
    const { systemTokens, messagesTokens } = splitPromptTokens(promptTokens, system?.length ?? 0, messagesText.length);

    return (
        <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
                <span className="text-caption-bold font-caption-bold text-brand-700">LLM Input</span>
                <button
                    className="text-[10px] text-subtext-color hover:text-default-font hover:underline"
                    onClick={() => setShowRaw(!showRaw)}
                >
                    {showRaw ? "formatted" : "raw json"}
                </button>
            </div>

            {showRaw ? (
                <CopyablePre content={JSON.stringify(data, null, 2)} className="text-[11px]" />
            ) : (
                <div className="flex flex-col gap-3">
                    {system ? <SystemPromptBlock content={system} tokens={systemTokens} estimated={!promptTokens} /> : null}
                    {messages.length > 0 ? (
                        <MessagesBlock messages={messages} tokens={messagesTokens} estimated={!promptTokens} />
                    ) : null}
                </div>
            )}
        </div>
    );
}

function StepDetailPanel({ node }: { node: StepNode }) {
    const { span, events } = node;
    const meta = span.metadata as Record<string, unknown> | null;
    const usage = meta?.usage as Record<string, number> | undefined;
    const model = (meta?.model as string) || null;

    const llmInputs = events.filter((e) => e.type === "llm_input");
    const llmOutputs = events.filter((e) => e.type === "llm_output");
    const toolInputs = events.filter((e) => e.type === "tool_input");
    const toolOutputs = events.filter((e) => e.type === "tool_output");

    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant={getStatusVariant(span.status)} icon={getStatusIcon(span.status)}>
                        {span.status}
                    </Badge>
                    <Badge variant="neutral">{span.run_type}</Badge>
                    {span.agent_name ? <Badge variant="brand">{span.agent_name}</Badge> : null}
                    {model ? <Badge variant="neutral">{model}</Badge> : null}
                </div>
                <span className="text-body-bold font-body-bold text-default-font">{span.name}</span>
                <span className="text-caption font-caption text-subtext-color">
                    {durationLabel(span.started_at, span.finished_at)}
                    {span.started_at ? ` \u00B7 started ${formatDate(span.started_at)}` : ""}
                </span>
            </div>

            {usage ? (
                <div className="flex flex-col gap-1.5 rounded-md border border-solid border-neutral-border bg-neutral-100 px-3 py-2.5">
                    <span className="text-[11px] font-bold uppercase tracking-wide text-subtext-color">Token Usage</span>
                    <div className="flex items-center gap-4">
                        <div className="flex flex-col items-center gap-0.5">
                            <span className="text-caption font-caption text-subtext-color">Prompt</span>
                            <span className="font-monospace-body text-[13px] text-default-font">{(usage.prompt_tokens ?? 0).toLocaleString()}</span>
                        </div>
                        <div className="h-6 w-px bg-neutral-200" />
                        <div className="flex flex-col items-center gap-0.5">
                            <span className="text-caption font-caption text-subtext-color">Completion</span>
                            <span className="font-monospace-body text-[13px] text-default-font">{(usage.completion_tokens ?? 0).toLocaleString()}</span>
                        </div>
                        <div className="h-6 w-px bg-neutral-200" />
                        <div className="flex flex-col items-center gap-0.5">
                            <span className="text-caption font-caption text-subtext-color">Total</span>
                            <span className="font-monospace-body text-[13px] font-bold text-default-font">{(usage.total_tokens ?? 0).toLocaleString()}</span>
                        </div>
                    </div>
                </div>
            ) : null}

            {span.error ? (
                <div className="flex flex-col gap-1">
                    <span className="text-caption-bold font-caption-bold text-error-700">Error</span>
                    <pre className="overflow-x-auto rounded-md bg-error-50 p-3 text-[12px] leading-5 text-error-800 whitespace-pre-wrap">
                        {span.error}
                    </pre>
                </div>
            ) : null}

            {llmInputs.map((ev) => (
                <LlmInputSection key={ev.id} data={ev.data} promptTokens={usage?.prompt_tokens} />
            ))}
            {llmOutputs.map((ev) => (
                <CollapsibleDataSection key={ev.id} label="LLM Output" data={ev.data} variant="brand" tokenCount={usage?.completion_tokens} />
            ))}
            {toolInputs.map((ev) => (
                <CollapsibleDataSection key={ev.id} label="Tool Input" data={ev.data} variant="warning" />
            ))}
            {toolOutputs.map((ev) => (
                <CollapsibleDataSection key={ev.id} label="Tool Output" data={ev.data} variant="warning" />
            ))}

            {llmInputs.length === 0 && toolInputs.length === 0 && previewToString(span.input_preview) ? (
                <div className="flex flex-col gap-1">
                    <span className="text-caption-bold font-caption-bold text-subtext-color">Input</span>
                    <CopyablePre content={previewToString(span.input_preview)!} />
                </div>
            ) : null}
            {llmOutputs.length === 0 && toolOutputs.length === 0 && previewToString(span.output_preview) ? (
                <div className="flex flex-col gap-1">
                    <span className="text-caption-bold font-caption-bold text-subtext-color">Output</span>
                    <CopyablePre content={previewToString(span.output_preview)!} />
                </div>
            ) : null}

            {(span.tags || []).length > 0 ? (
                <div className="flex flex-wrap gap-1">
                    {(span.tags || []).map((tag) => (
                        <Badge key={tag} variant="neutral">{tag}</Badge>
                    ))}
                </div>
            ) : null}
        </div>
    );
}

function TimelineTab({ waterfall }: { waterfall: WaterfallEntry[] }) {
    if (waterfall.length === 0) {
        return <EmptyState title="No timeline data" description="Span data will appear once the run emits trace data." />;
    }

    const maxMs = Math.max(...waterfall.map((w) => w.start_ms + w.duration_ms), 1);

    return (
        <div className="flex flex-col gap-1 overflow-x-auto">
            {waterfall.map((entry) => {
                const leftPct = (entry.start_ms / maxMs) * 100;
                const widthPct = Math.max((entry.duration_ms / maxMs) * 100, 0.5);
                const barColor = RUN_TYPE_BAR_COLORS[entry.run_type] || "bg-neutral-400";
                const durationStr = entry.duration_ms < 1000
                    ? `${entry.duration_ms}ms`
                    : `${(entry.duration_ms / 1000).toFixed(1)}s`;

                return (
                    <div key={entry.span_id} className="flex items-center gap-3 py-1" style={{ paddingLeft: entry.depth * 16 }}>
                        <div className="flex w-[180px] flex-none items-center gap-2 min-w-0">
                            <Badge variant="neutral">{entry.run_type}</Badge>
                            <span className="text-caption font-caption text-default-font truncate">{entry.name}</span>
                        </div>
                        <div className="relative flex h-5 min-w-[300px] grow items-center rounded bg-neutral-100">
                            <div
                                className={`absolute h-full rounded ${barColor} opacity-80`}
                                style={{ left: `${leftPct}%`, width: `${widthPct}%`, minWidth: 2 }}
                            />
                        </div>
                        <span className="w-[60px] flex-none text-right font-monospace-body text-[11px] text-subtext-color">
                            {durationStr}
                        </span>
                    </div>
                );
            })}
        </div>
    );
}

function LogsTab({ logs }: { logs: ObservedEvent[] }) {
    const [levelFilter, setLevelFilter] = useState<string | null>(null);
    const levels = useMemo(() => Array.from(new Set(logs.map((l) => l.level).filter((v): v is string => Boolean(v)))), [logs]);
    const filtered = levelFilter ? logs.filter((l) => l.level === levelFilter) : logs;

    if (logs.length === 0) {
        return <EmptyState title="No logs captured" description="Log events will appear here once the agent emits log output." />;
    }

    const levelColors: Record<string, string> = {
        ERROR: "error",
        WARNING: "warning",
        INFO: "brand",
        DEBUG: "neutral",
    };

    return (
        <div className="flex flex-col gap-3">
            {levels.length > 1 ? (
                <div className="flex flex-wrap gap-2">
                    <button
                        onClick={() => setLevelFilter(null)}
                        className={`rounded-md px-2 py-1 text-caption font-caption ${!levelFilter ? "bg-brand-100 text-brand-700" : "bg-neutral-100 text-subtext-color hover:bg-neutral-200"}`}
                    >
                        All ({logs.length})
                    </button>
                    {levels.map((level) => (
                        <button
                            key={level}
                            onClick={() => setLevelFilter(level)}
                            className={`rounded-md px-2 py-1 text-caption font-caption ${levelFilter === level ? "bg-brand-100 text-brand-700" : "bg-neutral-100 text-subtext-color hover:bg-neutral-200"}`}
                        >
                            {level} ({logs.filter((l) => l.level === level).length})
                        </button>
                    ))}
                </div>
            ) : null}

            <div className="flex flex-col gap-1 max-h-[70vh] overflow-y-auto">
                {filtered.map((log) => (
                    <LogRow key={log.id} log={log} levelColors={levelColors} />
                ))}
            </div>
        </div>
    );
}

function LogRow({
    log,
    levelColors,
}: {
    log: ObservedEvent;
    levelColors: Record<string, string>;
}) {
    const [expanded, setExpanded] = useState(false);
    const message = log.message || log.name || "log";
    const variant = (log.level ? levelColors[log.level] || "neutral" : "neutral") as "neutral" | "brand" | "warning" | "error";

    return (
        <div className="flex flex-col rounded-md border border-solid border-neutral-border bg-default-background shadow-sm">
            <div
                className="flex items-start gap-3 px-3 py-2 cursor-pointer hover:bg-neutral-200"
                onClick={() => setExpanded(!expanded)}
            >
                <FeatherChevronRight
                    className={`mt-0.5 h-3 w-3 text-subtext-color transition-transform flex-none ${expanded ? "rotate-90" : ""}`}
                />
                {log.level ? (
                    <Badge variant={variant}>{log.level}</Badge>
                ) : null}
                <span className={`min-w-0 grow text-caption font-caption text-default-font ${expanded ? "whitespace-pre-wrap break-words" : "truncate"}`}>
                    {message}
                </span>
                <span className="text-caption font-caption text-subtext-color whitespace-nowrap flex-none">
                    {formatDate(log.timestamp)}
                </span>
            </div>
        </div>
    );
}

function TokenSummaryDisplay({ summary }: { summary: TokenSummary }) {
    const models = Object.entries(summary.by_model);
    if (summary.total.total_tokens === 0) return null;

    return (
        <div className="flex flex-col gap-2">
            <div className="flex items-center gap-4">
                <span className="font-monospace-body text-[13px] font-bold text-default-font">
                    {summary.total.total_tokens.toLocaleString()} tokens
                </span>
                <span className="text-caption font-caption text-subtext-color">
                    {summary.total.prompt_tokens.toLocaleString()} prompt + {summary.total.completion_tokens.toLocaleString()} completion
                </span>
            </div>
            {models.length > 1 ? (
                <div className="flex flex-wrap gap-3">
                    {models.map(([model, usage]) => (
                        <div key={model} className="flex items-center gap-2 rounded bg-neutral-50 px-2 py-1">
                            <span className="text-caption-bold font-caption-bold text-subtext-color">{model}</span>
                            <span className="font-monospace-body text-[11px] text-default-font">{usage.total_tokens.toLocaleString()}</span>
                        </div>
                    ))}
                </div>
            ) : null}
        </div>
    );
}

export function RunDetailPageView({ runId }: { runId: string }) {
    const { detail, isLoading, errorMessage } = useObservedRunDetail(runId);
    const selectedRun = detail?.run;
    const [activeTab, setActiveTab] = useState<RunDetailTab>("steps");
    const [selectedSpanId, setSelectedSpanId] = useState<string | null>(null);

    const steps = detail?.steps ?? [];
    const waterfall = detail?.waterfall ?? [];
    const tokenSummary = detail?.token_summary ?? { total: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }, by_model: {} };
    const logs = detail?.logs ?? [];

    return (
        <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-6">
            <div className="flex items-center gap-2 text-caption font-caption">
                <Link href="/runs" className="text-brand-700 hover:text-brand-800">Runs</Link>
                <FeatherChevronRight className="text-neutral-400" />
                <span className="text-subtext-color">Run Detail</span>
            </div>

            <div className="flex w-full flex-col items-start gap-2">
                <div className="flex items-center gap-3">
                    <span className="text-heading-1 font-heading-1 text-default-font">
                        {selectedRun?.task_name || "Run Detail"}
                    </span>
                    {selectedRun ? (
                        <Badge variant={getStatusVariant(selectedRun.status)} icon={getStatusIcon(selectedRun.status)}>
                            {selectedRun.status}
                        </Badge>
                    ) : null}
                    {isLoading ? (
                        <FeatherLoader className="text-caption font-caption text-subtext-color animate-spin" />
                    ) : null}
                </div>
                <span className="text-body font-body text-subtext-color">{runId}</span>
            </div>

            {errorMessage ? <ErrorBanner message={errorMessage} /> : null}
            {isLoading && !detail ? <LoadingPanel message="Loading run detail..." /> : null}
            {!isLoading && !detail && !errorMessage ? (
                <EmptyState title="Run not found" description="This run may have expired or the identifier may be invalid." />
            ) : null}

            {selectedRun ? (
                <>
                    <div className="grid w-full grid-cols-2 gap-4 md:grid-cols-5">
                        <StatCard label="Started" value={formatDate(selectedRun.started_at)} icon={<FeatherClock />} variant="neutral" />
                        <StatCard label="Duration" value={durationLabel(selectedRun.started_at, selectedRun.finished_at)} icon={<FeatherActivity />} variant="brand" />
                        <StatCard label="Worker" value={selectedRun.worker_name || "-"} icon={<FeatherServer />} variant="neutral" />
                        <StatCard label="Total Spans" value={selectedRun.total_spans} icon={<FeatherLayers />} variant="neutral" />
                        <StatCard label="Tokens" value={tokenSummary.total.total_tokens.toLocaleString()} icon={<FeatherHash />} variant="neutral" />
                    </div>

                    {(previewToString(selectedRun.input_preview) || previewToString(selectedRun.output_preview) || selectedRun.error) ? (
                        <SectionCard title="Agent I/O" description="Top-level agent input and output">
                            <div className="flex flex-col gap-4">
                                {selectedRun.error ? (
                                    <div className="flex flex-col gap-1">
                                        <span className="text-caption-bold font-caption-bold text-error-700">Error</span>
                                        <pre className="overflow-x-auto rounded-md bg-error-50 p-3 text-[12px] leading-5 text-error-800 whitespace-pre-wrap">
                                            {selectedRun.error}
                                        </pre>
                                    </div>
                                ) : null}
                                {previewToString(selectedRun.input_preview) ? (
                                    <div className="flex flex-col gap-1">
                                        <span className="text-caption-bold font-caption-bold text-subtext-color">Input</span>
                                        <pre className="overflow-x-auto rounded-md bg-neutral-100 p-3 text-[12px] leading-5 text-default-font whitespace-pre-wrap">
                                            {previewToString(selectedRun.input_preview)}
                                        </pre>
                                    </div>
                                ) : null}
                                {previewToString(selectedRun.output_preview) ? (
                                    <div className="flex flex-col gap-1">
                                        <span className="text-caption-bold font-caption-bold text-subtext-color">Output</span>
                                        <pre className="overflow-x-auto rounded-md bg-neutral-100 p-3 text-[12px] leading-5 text-default-font whitespace-pre-wrap">
                                            {previewToString(selectedRun.output_preview)}
                                        </pre>
                                    </div>
                                ) : null}
                                {tokenSummary.total.total_tokens > 0 ? (
                                    <TokenSummaryDisplay summary={tokenSummary} />
                                ) : null}
                            </div>
                        </SectionCard>
                    ) : null}

                    <div className="flex flex-col gap-4">
                        <div className="flex items-center gap-1 border-b border-solid border-neutral-border">
                            {(
                                [
                                    { id: "steps" as const, label: "Steps", count: steps.length },
                                    { id: "timeline" as const, label: "Timeline", count: waterfall.length },
                                    { id: "logs" as const, label: "Logs", count: logs.length },
                                ] as const
                            ).map((tab) => (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`px-4 py-2.5 text-body font-body transition-colors border-b-2 ${
                                        activeTab === tab.id
                                            ? "border-brand-600 text-brand-700 font-bold"
                                            : "border-transparent text-subtext-color hover:text-default-font hover:border-neutral-300"
                                    }`}
                                >
                                    {tab.label}
                                    {tab.count > 0 ? (
                                        <span className="ml-1.5 rounded bg-neutral-200 px-1.5 py-0.5 text-[11px] text-neutral-600">
                                            {tab.count}
                                        </span>
                                    ) : null}
                                </button>
                            ))}
                        </div>

                        <div className="min-h-[200px]">
                            {activeTab === "steps" ? (
                                <StepsTab
                                    steps={steps}
                                    selectedSpanId={selectedSpanId}
                                    onSelectSpan={setSelectedSpanId}
                                />
                            ) : activeTab === "timeline" ? (
                                <TimelineTab waterfall={waterfall} />
                            ) : (
                                <LogsTab logs={logs} />
                            )}
                        </div>
                    </div>
                </>
            ) : null}
        </div>
    );
}
