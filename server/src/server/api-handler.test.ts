import { describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { withErrorLogging } from "./api-handler";

// Mock NextResponse
vi.mock("next/server", async () => {
    const actual = await vi.importActual("next/server");
    return {
        ...actual,
        NextResponse: {
            json: vi.fn((body: unknown, init?: ResponseInit) => ({
                body,
                status: init?.status ?? 200,
            })),
        },
    };
});

describe("withErrorLogging", () => {
    it("passes through successful responses", async () => {
        const handler = vi.fn().mockResolvedValue({ body: { ok: true }, status: 200 });
        const wrapped = withErrorLogging("/test", handler);

        const req = {} as NextRequest;
        const result = await wrapped(req);

        expect(handler).toHaveBeenCalledWith(req, undefined);
        expect(result).toEqual({ body: { ok: true }, status: 200 });
    });

    it("returns 400 for SyntaxError", async () => {
        const handler = vi.fn().mockRejectedValue(new SyntaxError("Unexpected token"));
        const wrapped = withErrorLogging("/test", handler);

        const result = await wrapped({} as NextRequest);
        expect(result).toEqual({
            body: { error: "Invalid or empty request body" },
            status: 400,
        });
    });

    it("returns 500 for generic errors", async () => {
        const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
        const handler = vi.fn().mockRejectedValue(new Error("Internal"));
        const wrapped = withErrorLogging("/test", handler);

        const result = await wrapped({} as NextRequest);
        expect(result).toEqual({
            body: { error: "Internal server error" },
            status: 500,
        });
        expect(consoleError).toHaveBeenCalled();
        consoleError.mockRestore();
    });
});
