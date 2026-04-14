import { describe, expect, it, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// We can't easily test the full ingestOTLP pipeline (it calls the store), but
// we can test the pure helper functions extracted into local scope.
// Since those helpers are not exported, we test via the module's observable
// behaviour using mocks.
// ---------------------------------------------------------------------------

// Mock store & session-title modules
vi.mock("@/src/server/store", () => ({
    upsertSpanFromOTLP: vi.fn().mockResolvedValue(undefined),
    upsertRunFromRootSpan: vi.fn().mockResolvedValue(undefined),
    ensureSession: vi.fn().mockResolvedValue(undefined),
    createEvents: vi.fn().mockResolvedValue(undefined),
    listSessionRuns: vi.fn().mockResolvedValue([]),
    updateSessionName: vi.fn().mockResolvedValue(undefined),
    updateSessionSummary: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/src/server/session-title", () => ({
    generateSessionTitle: vi.fn().mockResolvedValue(null),
    generateSessionSummary: vi.fn().mockResolvedValue(null),
}));

import { ingestOTLP, type OTLPExportTraceServiceRequest } from "./otlp";
import {
    upsertSpanFromOTLP,
    upsertRunFromRootSpan,
    ensureSession,
    createEvents,
} from "@/src/server/store";

beforeEach(() => {
    vi.clearAllMocks();
});

function makeOTLPRequest(
    overrides: Partial<{
        traceId: string;
        spanId: string;
        parentSpanId: string;
        name: string;
        startTimeUnixNano: string;
        endTimeUnixNano: string;
        attributes: { key: string; value: Record<string, unknown> }[];
        events: unknown[];
        status: { code: number; message?: string };
    }> = {},
): OTLPExportTraceServiceRequest {
    return {
        resourceSpans: [
            {
                resource: { attributes: [{ key: "service.name", value: { stringValue: "test" } }] },
                scopeSpans: [
                    {
                        scope: { name: "agentq" },
                        spans: [
                            {
                                traceId: overrides.traceId ?? "0123456789abcdef0123456789abcdef",
                                spanId: overrides.spanId ?? "abcdef0123456789",
                                parentSpanId: overrides.parentSpanId,
                                name: overrides.name ?? "test-span",
                                startTimeUnixNano: overrides.startTimeUnixNano ?? "1704067200000000000",
                                endTimeUnixNano: overrides.endTimeUnixNano ?? "1704067205000000000",
                                attributes: overrides.attributes ?? [
                                    { key: "agentq.run_type", value: { stringValue: "agent" } },
                                    { key: "agentq.agent_name", value: { stringValue: "test-agent" } },
                                    { key: "agentq.is_root", value: { boolValue: true } },
                                ],
                                events: overrides.events ?? [],
                                status: overrides.status ?? { code: 1 },
                            },
                        ],
                    },
                ],
            },
        ],
    };
}

describe("ingestOTLP", () => {
    it("processes a simple root span", async () => {
        await ingestOTLP(makeOTLPRequest());

        expect(upsertSpanFromOTLP).toHaveBeenCalledTimes(1);
        expect(upsertRunFromRootSpan).toHaveBeenCalledTimes(1);

        const spanCall = vi.mocked(upsertSpanFromOTLP).mock.calls[0][0];
        expect(spanCall.name).toBe("test-span");
        expect(spanCall.run_type).toBe("agent");
        expect(spanCall.agent_name).toBe("test-agent");
        expect(spanCall.status).toBe("SUCCESS");
    });

    it("handles partial spans (RUNNING)", async () => {
        await ingestOTLP(
            makeOTLPRequest({
                endTimeUnixNano: "0",
            }),
        );

        const spanCall = vi.mocked(upsertSpanFromOTLP).mock.calls[0][0];
        expect(spanCall.status).toBe("RUNNING");
        expect(spanCall.finished_at).toBeNull();
    });

    it("handles failure status", async () => {
        await ingestOTLP(
            makeOTLPRequest({
                status: { code: 2, message: "something failed" },
            }),
        );

        const spanCall = vi.mocked(upsertSpanFromOTLP).mock.calls[0][0];
        expect(spanCall.status).toBe("FAILURE");
        expect(spanCall.error).toBe("something failed");
    });

    it("processes child spans (non-root)", async () => {
        await ingestOTLP(
            makeOTLPRequest({
                parentSpanId: "0000000000000001",
                attributes: [
                    { key: "agentq.run_type", value: { stringValue: "llm" } },
                    { key: "gen_ai.request.model", value: { stringValue: "gpt-4" } },
                ],
            }),
        );

        expect(upsertSpanFromOTLP).toHaveBeenCalledTimes(1);
        // Non-root spans should NOT create runs
        expect(upsertRunFromRootSpan).not.toHaveBeenCalled();

        const spanCall = vi.mocked(upsertSpanFromOTLP).mock.calls[0][0];
        expect(spanCall.run_type).toBe("llm");
        expect(spanCall.parent_span_id).not.toBeNull();
    });

    it("creates session when session_id is present", async () => {
        await ingestOTLP(
            makeOTLPRequest({
                attributes: [
                    { key: "agentq.run_type", value: { stringValue: "agent" } },
                    { key: "agentq.is_root", value: { boolValue: true } },
                    { key: "agentq.session.id", value: { stringValue: "sess-123" } },
                    { key: "agentq.session.name", value: { stringValue: "My Session" } },
                ],
            }),
        );

        expect(ensureSession).toHaveBeenCalledWith({
            id: "sess-123",
            name: "My Session",
        });
    });

    it("processes span events into event records", async () => {
        await ingestOTLP(
            makeOTLPRequest({
                events: [
                    {
                        name: "llm_input",
                        timeUnixNano: "1704067201000000000",
                        attributes: [
                            { key: "data", value: { stringValue: '{"messages":[]}' } },
                        ],
                    },
                ],
            }),
        );

        expect(createEvents).toHaveBeenCalledTimes(1);
        const eventsArg = vi.mocked(createEvents).mock.calls[0][0];
        expect(eventsArg).toHaveLength(1);
        expect(eventsArg[0].type).toBe("llm_input");
    });

    it("skips events for partial spans", async () => {
        await ingestOTLP(
            makeOTLPRequest({
                endTimeUnixNano: "0",
                events: [
                    {
                        name: "llm_input",
                        timeUnixNano: "1704067201000000000",
                        attributes: [],
                    },
                ],
            }),
        );

        // Partial spans should not create events
        expect(createEvents).not.toHaveBeenCalled();
    });

    it("extracts LLM token metadata", async () => {
        await ingestOTLP(
            makeOTLPRequest({
                parentSpanId: "0000000000000001",
                attributes: [
                    { key: "agentq.run_type", value: { stringValue: "llm" } },
                    { key: "gen_ai.usage.input_tokens", value: { intValue: "100" } },
                    { key: "gen_ai.usage.output_tokens", value: { intValue: "50" } },
                    { key: "gen_ai.request.model", value: { stringValue: "gpt-4" } },
                ],
            }),
        );

        const spanCall = vi.mocked(upsertSpanFromOTLP).mock.calls[0][0];
        expect(spanCall.metadata).toEqual({
            usage: {
                prompt_tokens: 100,
                completion_tokens: 50,
                total_tokens: 150,
            },
            model: "gpt-4",
        });
    });

    it("handles empty resourceSpans gracefully", async () => {
        await ingestOTLP({ resourceSpans: [] });
        expect(upsertSpanFromOTLP).not.toHaveBeenCalled();
    });

    it("handles multiple spans in one request", async () => {
        const request: OTLPExportTraceServiceRequest = {
            resourceSpans: [
                {
                    scopeSpans: [
                        {
                            spans: [
                                {
                                    traceId: "aabbccdd11223344aabbccdd11223344",
                                    spanId: "1111111111111111",
                                    name: "root-agent",
                                    startTimeUnixNano: "1704067200000000000",
                                    endTimeUnixNano: "1704067210000000000",
                                    attributes: [
                                        { key: "agentq.run_type", value: { stringValue: "agent" } },
                                        { key: "agentq.is_root", value: { boolValue: true } },
                                    ],
                                    status: { code: 1 },
                                },
                                {
                                    traceId: "aabbccdd11223344aabbccdd11223344",
                                    spanId: "2222222222222222",
                                    parentSpanId: "1111111111111111",
                                    name: "llm-call",
                                    startTimeUnixNano: "1704067202000000000",
                                    endTimeUnixNano: "1704067208000000000",
                                    attributes: [
                                        { key: "agentq.run_type", value: { stringValue: "llm" } },
                                    ],
                                    status: { code: 1 },
                                },
                            ],
                        },
                    ],
                },
            ],
        };

        await ingestOTLP(request);
        expect(upsertSpanFromOTLP).toHaveBeenCalledTimes(2);
        expect(upsertRunFromRootSpan).toHaveBeenCalledTimes(1);
    });
});
