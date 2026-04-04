import { describe, expect, it } from "vitest";
import {
    compactNumber,
    durationLabel,
    formatCustomLabel,
    formatDate,
    formatDurationMs,
    formatTimeInput,
    previewToString,
    relativeTime,
} from "./format";

describe("formatDate", () => {
    it("returns 'Unknown' for null", () => {
        expect(formatDate(null)).toBe("Unknown");
    });

    it("returns 'Unknown' for undefined", () => {
        expect(formatDate(undefined)).toBe("Unknown");
    });

    it("formats a valid ISO date", () => {
        const result = formatDate("2024-01-15T12:30:00Z");
        expect(result).not.toBe("Unknown");
        expect(result.length).toBeGreaterThan(0);
    });

    it("returns raw string for invalid date", () => {
        expect(formatDate("not-a-date")).toBe("not-a-date");
    });
});

describe("compactNumber", () => {
    it("returns raw number below 1000", () => {
        expect(compactNumber(42)).toBe("42");
        expect(compactNumber(999)).toBe("999");
    });

    it("formats thousands with K", () => {
        expect(compactNumber(1000)).toBe("1K");
        expect(compactNumber(1500)).toBe("1.5K");
        expect(compactNumber(10000)).toBe("10K");
    });

    it("formats millions with M", () => {
        expect(compactNumber(1_000_000)).toBe("1M");
        expect(compactNumber(2_500_000)).toBe("2.5M");
        expect(compactNumber(10_000_000)).toBe("10M");
    });
});

describe("durationLabel", () => {
    it("returns dash when no start", () => {
        expect(durationLabel(null, null)).toBe("-");
        expect(durationLabel(undefined, undefined)).toBe("-");
    });

    it("shows seconds for short durations", () => {
        const start = "2024-01-01T00:00:00Z";
        const end = "2024-01-01T00:00:30Z";
        expect(durationLabel(start, end)).toBe("30s");
    });

    it("shows minutes and seconds", () => {
        const start = "2024-01-01T00:00:00Z";
        const end = "2024-01-01T00:05:30Z";
        expect(durationLabel(start, end)).toBe("5m 30s");
    });

    it("shows hours and minutes", () => {
        const start = "2024-01-01T00:00:00Z";
        const end = "2024-01-01T02:15:00Z";
        expect(durationLabel(start, end)).toBe("2h 15m");
    });
});

describe("previewToString", () => {
    it("returns empty string for null/undefined", () => {
        expect(previewToString(null)).toBe("");
        expect(previewToString(undefined)).toBe("");
    });

    it("returns string value as-is", () => {
        expect(previewToString("hello")).toBe("hello");
    });

    it("JSON-stringifies objects", () => {
        expect(previewToString({ key: "value" })).toBe(
            JSON.stringify({ key: "value" }, null, 2),
        );
    });
});

describe("formatDurationMs", () => {
    it("returns dash for null/undefined", () => {
        expect(formatDurationMs(null)).toBe("-");
        expect(formatDurationMs(undefined)).toBe("-");
    });

    it("formats milliseconds", () => {
        expect(formatDurationMs(500)).toBe("500ms");
    });

    it("formats seconds", () => {
        expect(formatDurationMs(1500)).toBe("1.5s");
    });

    it("formats minutes", () => {
        expect(formatDurationMs(90_000)).toBe("1.5m");
    });
});

describe("formatTimeInput", () => {
    it("pads hours and minutes", () => {
        const d = new Date(2024, 0, 1, 9, 5);
        expect(formatTimeInput(d)).toBe("09:05");
    });
});

describe("formatCustomLabel", () => {
    it("shows single date with times when same day", () => {
        const from = new Date(2024, 0, 15, 10, 0);
        const to = new Date(2024, 0, 15, 18, 0);
        const result = formatCustomLabel(from, to);
        expect(result).toContain("10:00");
        expect(result).toContain("18:00");
    });

    it("shows date range when different days", () => {
        const from = new Date(2024, 0, 10);
        const to = new Date(2024, 0, 20);
        const result = formatCustomLabel(from, to);
        expect(result).toContain("–");
    });
});
