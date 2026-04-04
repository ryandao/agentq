import { describe, expect, it } from "vitest";
import { getStatusVariant, getHealthBadge, sortByNewestDate } from "./helpers";

describe("getStatusVariant", () => {
    it("returns success for SUCCESS", () => {
        expect(getStatusVariant("SUCCESS")).toBe("success");
    });

    it("returns error for FAILURE", () => {
        expect(getStatusVariant("FAILURE")).toBe("error");
    });

    it("returns error for ABORTED", () => {
        expect(getStatusVariant("ABORTED")).toBe("error");
    });

    it("returns warning for RUNNING", () => {
        expect(getStatusVariant("RUNNING")).toBe("warning");
    });

    it("returns warning for PENDING", () => {
        expect(getStatusVariant("PENDING")).toBe("warning");
    });

    it("returns neutral for unknown", () => {
        expect(getStatusVariant("UNKNOWN")).toBe("neutral");
        expect(getStatusVariant(null)).toBe("neutral");
        expect(getStatusVariant(undefined)).toBe("neutral");
    });
});

describe("getHealthBadge", () => {
    it("returns neutral for undefined stats", () => {
        expect(getHealthBadge(undefined)).toEqual({
            variant: "neutral",
            label: "No runs",
        });
    });

    it("returns neutral for zero runs", () => {
        expect(
            getHealthBadge({
                agent_name: "test",
                total_runs: 0,
                success_count: 0,
                failure_count: 0,
                avg_duration_ms: null,
                total_tokens: 0,
            }),
        ).toEqual({ variant: "neutral", label: "No runs" });
    });

    it("returns healthy for low failure rate", () => {
        expect(
            getHealthBadge({
                agent_name: "test",
                total_runs: 100,
                success_count: 98,
                failure_count: 2,
                avg_duration_ms: 1000,
                total_tokens: 5000,
            }),
        ).toEqual({ variant: "success", label: "Healthy" });
    });

    it("returns degraded for moderate failure rate", () => {
        expect(
            getHealthBadge({
                agent_name: "test",
                total_runs: 100,
                success_count: 90,
                failure_count: 10,
                avg_duration_ms: 1000,
                total_tokens: 5000,
            }),
        ).toEqual({ variant: "warning", label: "Degraded" });
    });

    it("returns unhealthy for high failure rate", () => {
        expect(
            getHealthBadge({
                agent_name: "test",
                total_runs: 100,
                success_count: 70,
                failure_count: 30,
                avg_duration_ms: 1000,
                total_tokens: 5000,
            }),
        ).toEqual({ variant: "error", label: "Unhealthy" });
    });
});

describe("sortByNewestDate", () => {
    it("sorts items by newest first", () => {
        const items = [
            { name: "old", ts: "2024-01-01T00:00:00Z" },
            { name: "new", ts: "2024-06-01T00:00:00Z" },
            { name: "mid", ts: "2024-03-01T00:00:00Z" },
        ];
        const result = sortByNewestDate(items, (i) => i.ts);
        expect(result.map((i) => i.name)).toEqual(["new", "mid", "old"]);
    });

    it("handles null timestamps", () => {
        const items = [
            { name: "a", ts: null },
            { name: "b", ts: "2024-01-01T00:00:00Z" },
        ];
        const result = sortByNewestDate(items, (i) => i.ts);
        expect(result[0].name).toBe("b");
    });
});
