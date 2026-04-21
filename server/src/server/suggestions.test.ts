import { describe, expect, it, vi, beforeEach } from "vitest";
import type {
    InfraSuggestion,
    ObservabilityQueueSnapshot,
} from "./contracts";

// We need to test the evaluateAllRules logic. Since the public function
// generateInfraSuggestions builds context from DB, we test the rules in
// isolation by importing the module and mocking the dependencies.

vi.mock("./queue", () => ({
    getQueueSnapshot: vi.fn().mockResolvedValue({
        counts: { workers: 0, active_tasks: 0, reserved_tasks: 0, scheduled_tasks: 0, pending_tasks: 0, broker_queues: 0 },
        workers: [],
        broker_queues: [],
        errors: [],
    }),
}));

vi.mock("./analytics", () => ({
    getHourlyThroughput: vi.fn().mockResolvedValue([]),
    getQueueThroughput: vi.fn().mockResolvedValue([]),
    getRunStatsByTimeRange: vi.fn().mockResolvedValue([]),
}));

import { generateInfraSuggestions } from "./suggestions";
import { getQueueSnapshot } from "./queue";
import {
    getHourlyThroughput,
    getQueueThroughput,
    getRunStatsByTimeRange,
} from "./analytics";

beforeEach(() => {
    vi.clearAllMocks();
});

function mockLiveSnapshot(overrides: Partial<ObservabilityQueueSnapshot["counts"]> = {}, extra: Partial<ObservabilityQueueSnapshot> = {}): void {
    vi.mocked(getQueueSnapshot).mockResolvedValue({
        counts: {
            workers: 3,
            active_tasks: 2,
            reserved_tasks: 0,
            scheduled_tasks: 0,
            pending_tasks: 0,
            broker_queues: 1,
            ...overrides,
        },
        workers: extra.workers ?? [
            { name: "worker-1", active_count: 1, reserved_count: 0, scheduled_count: 0, queues: ["default"] },
            { name: "worker-2", active_count: 1, reserved_count: 0, scheduled_count: 0, queues: ["default"] },
            { name: "worker-3", active_count: 0, reserved_count: 0, scheduled_count: 0, queues: ["default"] },
        ],
        broker_queues: extra.broker_queues ?? [
            { name: "default", pending_count: 0, priority_buckets: {}, is_default: true },
        ],
        errors: extra.errors ?? [],
    });
}

describe("generateInfraSuggestions", () => {
    it("returns 'system looks healthy' when everything is fine", async () => {
        mockLiveSnapshot({ workers: 3, active_tasks: 1, pending_tasks: 0 });
        vi.mocked(getHourlyThroughput).mockResolvedValue([
            { hour: "2024-01-01T00:00:00Z", count: 5, failure_count: 0 },
            { hour: "2024-01-01T01:00:00Z", count: 4, failure_count: 0 },
            { hour: "2024-01-01T02:00:00Z", count: 6, failure_count: 0 },
        ]);

        const result = await generateInfraSuggestions(24);
        expect(result.suggestions.length).toBeGreaterThanOrEqual(1);
        expect(result.suggestions.some((s) => s.severity === "success")).toBe(true);
    });

    it("flags no workers as critical", async () => {
        mockLiveSnapshot({ workers: 0 });

        const result = await generateInfraSuggestions(24);
        const noWorkers = result.suggestions.find((s) => s.title === "No workers online");
        expect(noWorkers).toBeDefined();
        expect(noWorkers!.severity).toBe("critical");
    });

    it("flags pending tasks exceeding worker count", async () => {
        mockLiveSnapshot({ workers: 2, pending_tasks: 30 });

        const result = await generateInfraSuggestions(24);
        const pending = result.suggestions.find((s) => s.title === "Pending tasks exceed worker count");
        expect(pending).toBeDefined();
        expect(pending!.severity).toBe("critical");
    });

    it("flags broker errors", async () => {
        mockLiveSnapshot({ workers: 2 }, { errors: ["Connection refused"] });

        const result = await generateInfraSuggestions(24);
        const brokerErr = result.suggestions.find((s) => s.title === "Broker inspection errors");
        expect(brokerErr).toBeDefined();
        expect(brokerErr!.severity).toBe("warning");
    });

    it("flags rising failure rate", async () => {
        mockLiveSnapshot({ workers: 3 });
        // Full period: 5% failure rate
        vi.mocked(getRunStatsByTimeRange)
            .mockResolvedValueOnce([
                { status: "SUCCESS", count: 95 },
                { status: "FAILURE", count: 5 },
            ])
            // Recent 2h: 30% failure rate
            .mockResolvedValueOnce([
                { status: "SUCCESS", count: 7 },
                { status: "FAILURE", count: 3 },
            ]);

        const result = await generateInfraSuggestions(24);
        const rising = result.suggestions.find((s) => s.title === "Failure rate is rising");
        expect(rising).toBeDefined();
        expect(rising!.severity).toBe("critical");
    });

    it("flags unsubscribed queues", async () => {
        mockLiveSnapshot(
            { workers: 2, broker_queues: 2 },
            {
                workers: [
                    { name: "w1", active_count: 1, reserved_count: 0, scheduled_count: 0, queues: ["default"] },
                ],
                broker_queues: [
                    { name: "default", pending_count: 0, priority_buckets: {}, is_default: true },
                    { name: "priority", pending_count: 5, priority_buckets: {}, is_default: false },
                ],
            },
        );

        const result = await generateInfraSuggestions(24);
        const unsub = result.suggestions.find((s) => s.title.includes("No workers subscribed"));
        expect(unsub).toBeDefined();
        expect(unsub!.severity).toBe("critical");
    });

    it("sorts suggestions by severity (critical first)", async () => {
        mockLiveSnapshot({ workers: 0, pending_tasks: 100 });

        const result = await generateInfraSuggestions(24);
        if (result.suggestions.length >= 2) {
            const severities = result.suggestions.map((s) => s.severity);
            const severityOrder = ["critical", "warning", "info", "success"];
            for (let i = 1; i < severities.length; i++) {
                expect(
                    severityOrder.indexOf(severities[i]),
                ).toBeGreaterThanOrEqual(severityOrder.indexOf(severities[i - 1]));
            }
        }
    });

    it("returns lookback_hours and generated_at", async () => {
        mockLiveSnapshot({ workers: 1 });
        const result = await generateInfraSuggestions(12);
        expect(result.lookback_hours).toBe(12);
        expect(result.generated_at).toBeTruthy();
    });
});
