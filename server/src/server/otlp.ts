/**
 * OTLP HTTP/JSON parser and mapper.
 *
 * Accepts an OTLP ExportTraceServiceRequest JSON payload and maps it to the
 * existing agentq database schema (runs, spans, events, sessions).
 *
 * Partial spans (endTimeUnixNano === "0") are treated as RUNNING — the SDK
 * sends these on span start for real-time monitoring.  When the complete span
 * arrives later, the record is upserted with final status and end time.
 */

import {
    upsertSpanFromOTLP,
    upsertRunFromRootSpan,
    ensureSession,
    createEvents,
    listSessionRuns,
    updateSessionName,
    updateSessionSummary,
} from "@/src/server/store";
import {
    generateSessionTitle,
    generateSessionSummary,
} from "@/src/server/session-title";

// ---------------------------------------------------------------------------
// OTLP JSON types (subset we care about)
// ---------------------------------------------------------------------------

interface OTLPKeyValue {
    key: string;
    value: OTLPAnyValue;
}

interface OTLPAnyValue {
    stringValue?: string;
    intValue?: string;
    doubleValue?: number;
    boolValue?: boolean;
    arrayValue?: { values: OTLPAnyValue[] };
}

interface OTLPEvent {
    name: string;
    timeUnixNano: string;
    attributes?: OTLPKeyValue[];
}

interface OTLPSpan {
    traceId: string;
    spanId: string;
    parentSpanId?: string;
    name: string;
    kind?: number;
    startTimeUnixNano: string;
    endTimeUnixNano: string;
    attributes?: OTLPKeyValue[];
    events?: OTLPEvent[];
    status?: { code?: number; message?: string };
}

interface OTLPScopeSpans {
    scope?: { name?: string };
    spans: OTLPSpan[];
}

interface OTLPResourceSpans {
    resource?: { attributes?: OTLPKeyValue[] };
    scopeSpans: OTLPScopeSpans[];
}

export interface OTLPExportTraceServiceRequest {
    resourceSpans: OTLPResourceSpans[];
}

// ---------------------------------------------------------------------------
// Attribute helpers
// ---------------------------------------------------------------------------

function extractValue(val: OTLPAnyValue): string | number | boolean | null {
    if (val.stringValue !== undefined) return val.stringValue;
    if (val.intValue !== undefined) return Number(val.intValue);
    if (val.doubleValue !== undefined) return val.doubleValue;
    if (val.boolValue !== undefined) return val.boolValue;
    return null;
}

function attrsToMap(attrs: OTLPKeyValue[] | undefined): Map<string, string | number | boolean | null> {
    const map = new Map<string, string | number | boolean | null>();
    if (!attrs) return map;
    for (const kv of attrs) {
        map.set(kv.key, extractValue(kv.value));
    }
    return map;
}

function attrString(map: Map<string, string | number | boolean | null>, key: string): string | null {
    const v = map.get(key);
    if (v === null || v === undefined) return null;
    return String(v);
}

function attrNumber(map: Map<string, string | number | boolean | null>, key: string): number | null {
    const v = map.get(key);
    if (v === null || v === undefined) return null;
    return Number(v);
}

function attrBool(map: Map<string, string | number | boolean | null>, key: string): boolean {
    const v = map.get(key);
    return v === true || v === "true";
}

// ---------------------------------------------------------------------------
// ID conversion helpers
// ---------------------------------------------------------------------------

function hexToUUID(hex: string): string {
    const h = hex.padStart(32, "0");
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

function nanosToDate(nanos: string): Date | null {
    const n = BigInt(nanos);
    if (n === 0n) return null;
    return new Date(Number(n / 1000000n));
}

// ---------------------------------------------------------------------------
// Status mapping
// ---------------------------------------------------------------------------

function deriveStatus(
    statusCode: number | undefined,
    endTimeNanos: string,
): string {
    const isPartial = endTimeNanos === "0" || endTimeNanos === "";
    if (isPartial) return "RUNNING";
    if (statusCode === 2) return "FAILURE";
    return "SUCCESS";
}

// ---------------------------------------------------------------------------
// JSON parsing helper for preview attributes
// ---------------------------------------------------------------------------

function tryParseJson(value: string | null): unknown | null {
    if (!value) return null;
    try {
        return JSON.parse(value);
    } catch {
        return value;
    }
}

// ---------------------------------------------------------------------------
// Core ingest function
// ---------------------------------------------------------------------------

export async function ingestOTLP(
    request: OTLPExportTraceServiceRequest,
): Promise<void> {
    for (const rs of request.resourceSpans ?? []) {
        for (const ss of rs.scopeSpans ?? []) {
            for (const span of ss.spans ?? []) {
                await processSpan(span);
            }
        }
    }
}

async function processSpan(span: OTLPSpan): Promise<void> {
    const attrs = attrsToMap(span.attributes);
    const isPartial = span.endTimeUnixNano === "0" || span.endTimeUnixNano === "";
    const isRoot = !span.parentSpanId;

    const runId = hexToUUID(span.traceId);
    const spanId = hexToUUID(span.spanId);
    const parentSpanId = span.parentSpanId ? hexToUUID(span.parentSpanId) : null;

    const runType = attrString(attrs, "agentq.run_type") ?? "agent";
    const agentName = attrString(attrs, "agentq.agent_name");
    const status = deriveStatus(span.status?.code, span.endTimeUnixNano);
    const error = span.status?.message || null;

    const inputPreview = tryParseJson(attrString(attrs, "agentq.input_preview"));
    const outputPreview = tryParseJson(attrString(attrs, "agentq.output_preview"));

    const startedAt = nanosToDate(span.startTimeUnixNano);
    const finishedAt = isPartial ? null : nanosToDate(span.endTimeUnixNano);

    // Build metadata from gen_ai.* attributes (for LLM spans)
    let metadata: Record<string, unknown> | null = null;
    const inputTokens = attrNumber(attrs, "gen_ai.usage.input_tokens");
    const outputTokens = attrNumber(attrs, "gen_ai.usage.output_tokens");
    const model = attrString(attrs, "gen_ai.request.model") ?? attrString(attrs, "gen_ai.response.model");

    if (inputTokens !== null || outputTokens !== null || model) {
        metadata = {};
        if (inputTokens !== null || outputTokens !== null) {
            const totalTokens = (inputTokens ?? 0) + (outputTokens ?? 0);
            metadata.usage = {
                prompt_tokens: inputTokens ?? 0,
                completion_tokens: outputTokens ?? 0,
                total_tokens: totalTokens,
            };
        }
        if (model) {
            metadata.model = model;
        }
    }

    await upsertSpanFromOTLP({
        span_id: spanId,
        run_id: runId,
        parent_span_id: parentSpanId,
        name: span.name,
        run_type: runType,
        agent_name: agentName,
        status,
        error,
        input_preview: inputPreview,
        output_preview: isPartial ? null : outputPreview,
        metadata,
        started_at: startedAt,
        finished_at: finishedAt,
    });

    if (isRoot) {
        const sessionId = attrString(attrs, "agentq.session.id");
        const sessionName = attrString(attrs, "agentq.session.name");
        const taskName = attrString(attrs, "agentq.task_name");
        const workerName = attrString(attrs, "agentq.worker_name");
        const queueName = attrString(attrs, "agentq.queue_name");

        if (sessionId) {
            await ensureSession({
                id: sessionId,
                name: sessionName,
            });
        }

        await upsertRunFromRootSpan({
            run_id: runId,
            session_id: sessionId,
            task_name: taskName ?? agentName,
            queue_name: queueName,
            worker_name: workerName,
            status,
            error,
            input_preview: inputPreview,
            output_preview: isPartial ? null : outputPreview,
            root_span_id: spanId,
            started_at: startedAt,
            finished_at: finishedAt,
            metadata: null,
        });

        const isTerminal = status === "SUCCESS" || status === "FAILURE";
        if (!isPartial && isTerminal && sessionId) {
            maybeGenerateSessionTitleAndSummary(
                sessionId, taskName ?? agentName, inputPreview,
            ).catch(() => {});
        }
    }

    // Process span events → events table
    if (!isPartial && span.events?.length) {
        const events = span.events.map((ev) => {
            const evAttrs = attrsToMap(ev.attributes);
            const evData: Record<string, unknown> = {};
            for (const [k, v] of evAttrs) {
                evData[k] = v;
            }
            return {
                span_id: spanId,
                run_id: runId,
                type: ev.name,
                name: ev.name,
                message: attrString(evAttrs, "log.message") ?? attrString(evAttrs, "data") ?? null,
                level: attrString(evAttrs, "log.level") ?? null,
                data: Object.keys(evData).length > 0 ? evData : null,
                timestamp: nanosToDate(ev.timeUnixNano)?.toISOString() ?? null,
            };
        });
        await createEvents(events);
    }
}

// ---------------------------------------------------------------------------
// Side-effect: AI-generated session title and summary (fire-and-forget)
// ---------------------------------------------------------------------------

async function maybeGenerateSessionTitleAndSummary(
    sessionId: string,
    taskName: string | null,
    inputPreview: unknown,
): Promise<void> {
    try {
        const title = await generateSessionTitle(taskName, inputPreview);
        if (title) {
            await updateSessionName(sessionId, title);
        }
    } catch {
        // best-effort
    }

    try {
        const runs = await listSessionRuns(sessionId);
        const snapshots = runs.map((r) => ({
            task_name: r.task_name,
            status: r.status,
            input_preview: r.input_preview,
            output_preview: r.output_preview,
            error: r.error,
        }));
        const summary = await generateSessionSummary(snapshots);
        if (summary) {
            await updateSessionSummary(sessionId, summary);
        }
    } catch {
        // best-effort
    }
}
