import { NextRequest, NextResponse } from "next/server";

type RouteHandler = (
    request: NextRequest,
    context?: { params: Record<string, string> },
) => Promise<NextResponse>;

export function withErrorLogging(
    route: string,
    handler: RouteHandler,
): RouteHandler {
    return async (request, context) => {
        try {
            return await handler(request, context);
        } catch (error) {
            if (error instanceof SyntaxError) {
                return NextResponse.json(
                    { error: "Invalid or empty request body" },
                    { status: 400 },
                );
            }
            console.error(`[${route}]`, error);
            return NextResponse.json(
                { error: "Internal server error" },
                { status: 500 },
            );
        }
    };
}
