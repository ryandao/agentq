import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";

function timingSafeEquals(a: string, b: string): boolean {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) {
        crypto.timingSafeEqual(bufA, bufA);
        return false;
    }
    return crypto.timingSafeEqual(bufA, bufB);
}

function unauthorizedBasicResponse(): NextResponse {
    return new NextResponse("Authentication required", {
        status: 401,
        headers: {
            "WWW-Authenticate": 'Basic realm="AgentQ Observability"',
        },
    });
}

function unauthorizedBearerResponse(): NextResponse {
    return new NextResponse("Invalid or missing API key", {
        status: 401,
        headers: {
            "WWW-Authenticate": 'Bearer realm="AgentQ Ingest"',
        },
    });
}

function decodeBasicCredentials(
    header: string,
): { username: string; password: string } | null {
    const [scheme, encoded] = header.split(" ");
    if (scheme !== "Basic" || !encoded) {
        return null;
    }

    try {
        const decoded = atob(encoded);
        const separator = decoded.indexOf(":");
        if (separator < 0) {
            return null;
        }

        return {
            username: decoded.slice(0, separator),
            password: decoded.slice(separator + 1),
        };
    } catch {
        return null;
    }
}

function isIngestRoute(pathname: string): boolean {
    return pathname.startsWith("/v1/");
}

function authenticateBearer(request: NextRequest): NextResponse | null {
    const apiKey = process.env.AGENTQ_INGEST_API_KEY;

    if (!apiKey) {
        if (process.env.NODE_ENV !== "production") {
            return null;
        }
        return new NextResponse("Ingest API key is not configured", {
            status: 500,
        });
    }

    const authorization = request.headers.get("authorization");
    if (!authorization) {
        return unauthorizedBearerResponse();
    }

    const [scheme, token] = authorization.split(" ");
    if (scheme !== "Bearer" || !token || !timingSafeEquals(token, apiKey)) {
        return unauthorizedBearerResponse();
    }

    return null;
}

function authenticateBasic(request: NextRequest): NextResponse | null {
    const username = process.env.AGENTQ_SERVER_ADMIN_USERNAME;
    const password = process.env.AGENTQ_SERVER_ADMIN_PASSWORD;

    if (!username || !password) {
        if (process.env.NODE_ENV !== "production") {
            return null;
        }
        return new NextResponse("AgentQ admin credentials are not configured", {
            status: 500,
        });
    }

    const authorization = request.headers.get("authorization");
    if (!authorization) {
        return unauthorizedBasicResponse();
    }

    const credentials = decodeBasicCredentials(authorization);
    if (!credentials) {
        return unauthorizedBasicResponse();
    }

    if (!timingSafeEquals(credentials.username, username) ||
        !timingSafeEquals(credentials.password, password)) {
        return unauthorizedBasicResponse();
    }

    return null;
}

export function middleware(request: NextRequest) {
    if (isIngestRoute(request.nextUrl.pathname)) {
        const error = authenticateBearer(request);
        return error ?? NextResponse.next();
    }

    const error = authenticateBasic(request);
    return error ?? NextResponse.next();
}

export const config = {
    matcher: [
        "/",
        "/runs/:path*",
        "/sessions/:path*",
        "/agents/:path*",
        "/config/:path*",
        "/api/:path*",
        "/v1/:path*",
    ],
};
