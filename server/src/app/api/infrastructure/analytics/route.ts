import { NextResponse } from "next/server";

import { withErrorLogging } from "@/src/server/api-handler";
import type { InfraAnalyticsResponse } from "@/src/server/contracts";
import {
    getHourlyQueueThroughput,
    getHourlyThroughput,
    getHourlyWorkerThroughput,
    getQueueThroughput,
    getQueueWaitStatsByAgent,
    getRunStatsByTimeRange,
    getWorkerThroughput,
} from "@/src/server/analytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withErrorLogging(
    "infrastructure/analytics",
    async (request) => {
        const fromParam = request.nextUrl.searchParams.get("from");
        const toParam = request.nextUrl.searchParams.get("to");

        let from: Date;
        let to: Date;

        if (fromParam && toParam) {
            from = new Date(fromParam);
            to = new Date(toParam);
            if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
                return NextResponse.json({ error: "Invalid from/to dates" }, { status: 400 });
            }
        } else {
            const hoursParam = request.nextUrl.searchParams.get("hours");
            let lookbackHours = 24;
            if (hoursParam) {
                const parsed = Number.parseInt(hoursParam, 10);
                if (Number.isFinite(parsed) && parsed > 0) {
                    lookbackHours = Math.min(parsed, 720);
                }
            }
            to = new Date();
            from = new Date(to.getTime() - lookbackHours * 60 * 60 * 1000);
        }

        const [
            hourlyThroughput,
            queueThroughput,
            workerThroughput,
            hourlyWorkerThroughput,
            hourlyQueueThroughput,
            runStats,
            queueWaitStats,
        ] = await Promise.all([
            getHourlyThroughput(from, to),
            getQueueThroughput(from, to),
            getWorkerThroughput(from, to),
            getHourlyWorkerThroughput(from, to),
            getHourlyQueueThroughput(from, to),
            getRunStatsByTimeRange(from, to),
            getQueueWaitStatsByAgent(from, to),
        ]);

        const lookbackHours = Math.round((to.getTime() - from.getTime()) / (60 * 60 * 1000));

        const result: InfraAnalyticsResponse = {
            hourly_throughput: hourlyThroughput,
            queue_throughput: queueThroughput,
            worker_throughput: workerThroughput,
            hourly_worker_throughput: hourlyWorkerThroughput,
            hourly_queue_throughput: hourlyQueueThroughput,
            run_stats: runStats,
            queue_wait_stats: queueWaitStats,
            lookback_hours: lookbackHours,
        };

        return NextResponse.json(result);
    },
);
