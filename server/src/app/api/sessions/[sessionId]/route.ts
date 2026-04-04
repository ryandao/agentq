import { NextResponse } from "next/server";

import { withErrorLogging } from "@/src/server/api-handler";
import type { SessionDetailResponse } from "@/src/server/contracts";
import {
    getSession,
    listSessionRuns,
    getSessionStats,
    updateSessionName,
    updateSessionSummary,
} from "@/src/server/store";
import {
    generateSessionTitle,
    generateSessionSummary,
} from "@/src/server/session-title";
import { prisma } from "@/src/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function backfillSessionMeta(sessionId: string, session: { name?: string | null; summary?: string | null }) {
    const needsTitle = !session.name;
    const needsSummary = !session.summary;
    if (!needsTitle && !needsSummary) return;

    const runs = await prisma.run.findMany({
        where: { sessionId, isDeleted: false },
        orderBy: { createdAt: "asc" },
        select: {
            taskName: true,
            status: true,
            inputPreview: true,
            outputPreview: true,
            error: true,
        },
    });
    if (runs.length === 0) return;

    const promises: Promise<void>[] = [];

    if (needsTitle) {
        const firstRun = runs[0];
        promises.push(
            generateSessionTitle(firstRun.taskName, firstRun.inputPreview)
                .then((title) => { if (title) return updateSessionName(sessionId, title); })
                .catch((err) => { console.warn("[session-backfill] title failed:", err); }),
        );
    }

    if (needsSummary) {
        const snapshots = runs.map((r) => ({
            task_name: r.taskName,
            status: r.status,
            input_preview: r.inputPreview,
            output_preview: r.outputPreview,
            error: r.error,
        }));
        promises.push(
            generateSessionSummary(snapshots)
                .then((summary) => { if (summary) return updateSessionSummary(sessionId, summary); })
                .catch((err) => { console.warn("[session-backfill] summary failed:", err); }),
        );
    }

    await Promise.allSettled(promises);
}

export const GET = withErrorLogging("sessions/:sessionId", async (_request, context) => {
    const sessionId = context!.params.sessionId;

    const session = await getSession(sessionId);
    if (!session) {
        return NextResponse.json(
            { error: "Session not found" },
            { status: 404 },
        );
    }

    // Fire-and-forget: backfill title/summary for existing sessions
    backfillSessionMeta(sessionId, session).catch(() => {});

    const [runs, stats] = await Promise.all([
        listSessionRuns(sessionId),
        getSessionStats(sessionId),
    ]);
    const result: SessionDetailResponse = { session, runs, stats };
    return NextResponse.json(result);
});
