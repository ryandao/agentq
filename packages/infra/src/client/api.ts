// ---------------------------------------------------------------------------
// @agentq/infra — client-side API functions for infrastructure monitoring
// ---------------------------------------------------------------------------

import type {
    InfraSnapshotResponse,
    InfraAnalyticsResponse,
    InfraSuggestionsResponse,
} from "../types.js";

async function validateResponse(response: Response): Promise<void> {
    if (response.ok) {
        return;
    }

    let error = `Request failed with status ${response.status}`;
    try {
        const body = (await response.json()) as { error?: string };
        if (body.error) {
            error = body.error;
        }
    } catch {
        // Ignore parse failures and keep the generic message.
    }

    throw new Error(error);
}

export async function fetchInfraSnapshot(): Promise<InfraSnapshotResponse> {
    const response = await fetch("/api/infrastructure/snapshot", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
    });
    await validateResponse(response);
    return (await response.json()) as InfraSnapshotResponse;
}

export async function fetchInfraAnalytics(
    from: string,
    to: string,
): Promise<InfraAnalyticsResponse> {
    const params = new URLSearchParams({ from, to });
    const response = await fetch(
        `/api/infrastructure/analytics?${params}`,
        {
            method: "GET",
            credentials: "include",
            cache: "no-store",
        },
    );
    await validateResponse(response);
    return (await response.json()) as InfraAnalyticsResponse;
}

export async function fetchInfraSuggestions(
    hours = 24,
): Promise<InfraSuggestionsResponse> {
    const response = await fetch(
        `/api/infrastructure/suggestions?hours=${hours}`,
        {
            method: "GET",
            credentials: "include",
            cache: "no-store",
        },
    );
    await validateResponse(response);
    return (await response.json()) as InfraSuggestionsResponse;
}
