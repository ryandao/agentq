const DEFAULT_PRIORITY_STEPS = [0, 3, 6, 9];
const DEFAULT_PRIORITY_SEPARATOR = "\x06\x16";

export interface ObservabilityConfig {
    taskQueueSystem: string;
    redisUrl?: string;
    redisGlobalKeyPrefix: string;
    defaultQueueName: string;
    redisPrioritySteps: number[];
    redisPrioritySeparator: string;
    celeryControlExchange: string;
    celeryInspectTimeoutMs: number;
}

function parsePrioritySteps(value?: string): number[] {
    if (!value) {
        return DEFAULT_PRIORITY_STEPS;
    }

    const parsed = value
        .split(",")
        .map((entry) => Number.parseInt(entry.trim(), 10))
        .filter((entry) => Number.isFinite(entry));

    return parsed.length > 0
        ? Array.from(new Set(parsed)).sort((a, b) => a - b)
        : DEFAULT_PRIORITY_STEPS;
}

export function getObservabilityConfig(): ObservabilityConfig {
    return {
        taskQueueSystem: process.env.AGENTQ_TASK_QUEUE_SYSTEM || "celery",
        redisUrl:
            process.env.AGENTQ_REDIS_URL ||
            process.env.TASK_QUEUE_REDIS_URL ||
            undefined,
        redisGlobalKeyPrefix: process.env.AGENTQ_REDIS_GLOBAL_KEYPREFIX || "",
        defaultQueueName: process.env.AGENTQ_DEFAULT_QUEUE_NAME || "celery",
        redisPrioritySteps: parsePrioritySteps(
            process.env.AGENTQ_REDIS_PRIORITY_STEPS,
        ),
        redisPrioritySeparator:
            process.env.AGENTQ_REDIS_PRIORITY_SEPARATOR ||
            DEFAULT_PRIORITY_SEPARATOR,
        celeryControlExchange:
            process.env.AGENTQ_CELERY_CONTROL_EXCHANGE || "celery",
        celeryInspectTimeoutMs:
            Number.parseInt(
                process.env.AGENTQ_CELERY_INSPECT_TIMEOUT_MS || "1000",
                10,
            ) || 1000,
    };
}
