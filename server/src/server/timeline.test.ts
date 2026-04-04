import { describe, expect, it } from "vitest";
import { buildStepTree, buildWaterfall, buildTokenSummary } from "./timeline";
import type { ObservedEvent, ObservedSpan } from "./contracts";

function makeSpan(overrides: Partial<ObservedSpan> & { span_id: string }): ObservedSpan {
    return {
        parent_span_id: null,
        agent_name: null,
        name: "test-span",
        run_type: "agent",
        status: "SUCCESS",
        started_at: "2024-01-01T00:00:00Z",
        finished_at: "2024-01-01T00:00:05Z",
        input_preview: null,
        output_preview: null,
        error: null,
        metadata: null,
        tags: [],
        ...overrides,
    };
}

function makeEvent(overrides: Partial<ObservedEvent> & { id: string; run_id: string }): ObservedEvent {
    return {
        span_id: null,
        type: "log",
        name: null,
        message: null,
        level: null,
        data: null,
        timestamp: "2024-01-01T00:00:01Z",
        ...overrides,
    };
}

describe("buildStepTree", () => {
    it("returns empty array for empty inputs", () => {
        expect(buildStepTree([], [])).toEqual([]);
    });

    it("creates root nodes for spans without parents", () => {
        const spans = [
            makeSpan({ span_id: "s1" }),
            makeSpan({ span_id: "s2" }),
        ];
        const result = buildStepTree(spans, []);
        expect(result).toHaveLength(2);
        expect(result[0].children).toHaveLength(0);
    });

    it("nests children under parent spans", () => {
        const spans = [
            makeSpan({ span_id: "parent" }),
            makeSpan({ span_id: "child", parent_span_id: "parent" }),
        ];
        const result = buildStepTree(spans, []);
        expect(result).toHaveLength(1);
        expect(result[0].span.span_id).toBe("parent");
        expect(result[0].children).toHaveLength(1);
        expect(result[0].children[0].span.span_id).toBe("child");
    });

    it("attaches events to their spans (excluding log type)", () => {
        const spans = [makeSpan({ span_id: "s1" })];
        const events = [
            makeEvent({ id: "e1", run_id: "r1", span_id: "s1", type: "llm_output" }),
            makeEvent({ id: "e2", run_id: "r1", span_id: "s1", type: "log" }),
        ];
        const result = buildStepTree(spans, events);
        expect(result[0].events).toHaveLength(1);
        expect(result[0].events[0].id).toBe("e1");
    });
});

describe("buildWaterfall", () => {
    it("returns empty array for no spans", () => {
        expect(buildWaterfall([], null)).toEqual([]);
    });

    it("calculates start_ms and duration_ms relative to run start", () => {
        const spans = [
            makeSpan({
                span_id: "s1",
                started_at: "2024-01-01T00:00:02Z",
                finished_at: "2024-01-01T00:00:05Z",
            }),
        ];
        const result = buildWaterfall(spans, "2024-01-01T00:00:00Z");
        expect(result).toHaveLength(1);
        expect(result[0].start_ms).toBe(2000);
        expect(result[0].duration_ms).toBe(3000);
    });

    it("assigns correct depth for nested spans", () => {
        const spans = [
            makeSpan({ span_id: "root" }),
            makeSpan({ span_id: "child", parent_span_id: "root" }),
            makeSpan({ span_id: "grandchild", parent_span_id: "child" }),
        ];
        const result = buildWaterfall(spans, "2024-01-01T00:00:00Z");
        const depthMap = new Map(result.map((e) => [e.span_id, e.depth]));
        expect(depthMap.get("root")).toBe(0);
        expect(depthMap.get("child")).toBe(1);
        expect(depthMap.get("grandchild")).toBe(2);
    });

    it("sorts entries by start_ms", () => {
        const spans = [
            makeSpan({ span_id: "late", started_at: "2024-01-01T00:00:10Z", finished_at: "2024-01-01T00:00:15Z" }),
            makeSpan({ span_id: "early", started_at: "2024-01-01T00:00:01Z", finished_at: "2024-01-01T00:00:03Z" }),
        ];
        const result = buildWaterfall(spans, "2024-01-01T00:00:00Z");
        expect(result[0].span_id).toBe("early");
        expect(result[1].span_id).toBe("late");
    });
});

describe("buildTokenSummary", () => {
    it("returns zero totals for empty spans", () => {
        const result = buildTokenSummary([]);
        expect(result.total.total_tokens).toBe(0);
        expect(Object.keys(result.by_model)).toHaveLength(0);
    });

    it("ignores non-llm spans", () => {
        const spans = [
            makeSpan({
                span_id: "s1",
                run_type: "agent",
                metadata: { model: "gpt-4", usage: { total_tokens: 100 } },
            }),
        ];
        const result = buildTokenSummary(spans);
        expect(result.total.total_tokens).toBe(0);
    });

    it("sums tokens from llm spans", () => {
        const spans = [
            makeSpan({
                span_id: "s1",
                run_type: "llm",
                metadata: {
                    model: "gpt-4",
                    usage: { prompt_tokens: 50, completion_tokens: 30, total_tokens: 80 },
                },
            }),
            makeSpan({
                span_id: "s2",
                run_type: "llm",
                metadata: {
                    model: "gpt-4",
                    usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 },
                },
            }),
        ];
        const result = buildTokenSummary(spans);
        expect(result.total.total_tokens).toBe(110);
        expect(result.total.prompt_tokens).toBe(70);
        expect(result.total.completion_tokens).toBe(40);
        expect(result.by_model["gpt-4"].total_tokens).toBe(110);
    });

    it("groups by model", () => {
        const spans = [
            makeSpan({
                span_id: "s1",
                run_type: "llm",
                metadata: { model: "gpt-4", usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 } },
            }),
            makeSpan({
                span_id: "s2",
                run_type: "llm",
                metadata: { model: "claude", usage: { prompt_tokens: 30, completion_tokens: 20, total_tokens: 50 } },
            }),
        ];
        const result = buildTokenSummary(spans);
        expect(result.total.total_tokens).toBe(70);
        expect(result.by_model["gpt-4"].total_tokens).toBe(20);
        expect(result.by_model["claude"].total_tokens).toBe(50);
    });
});
