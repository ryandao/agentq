import { randomUUID } from "node:crypto";
import { Buffer } from "node:buffer";
import { URL } from "node:url";

import { createClient } from "redis";

import { getObservabilityConfig } from "@/src/server/config";
import {
    ObservabilityBrokerQueue,
    ObservabilityQueueSnapshot,
    ObservabilityWorker,
} from "@/src/server/contracts";

const REDIS_BINDING_PREFIX = "_kombu.binding.";
const REDIS_FANOUT_PREFIX_TEMPLATE = "/{db}.";
const REDIS_BINDING_SEPARATOR = "\x06\x16";
const CELERY_CONTENT_TYPE = "application/json";
const CELERY_CONTENT_ENCODING = "utf-8";

type CeleryInspectSubcommand =
    | "stats"
    | "active"
    | "reserved"
    | "scheduled"
    | "active_queues";

interface CeleryInspectPayload {
    active: Record<string, unknown[]>;
    reserved: Record<string, unknown[]>;
    scheduled: Record<string, unknown[]>;
    stats: Record<string, Record<string, unknown>>;
    active_queues: Record<string, Array<Record<string, unknown>>>;
    errors: string[];
}

interface WorkerInspectionResult {
    workers: ObservabilityWorker[];
    queueNames: Set<string>;
    errors: string[];
}

interface TaskQueueInspector {
    inspectWorkers(): Promise<WorkerInspectionResult>;
}

interface TransportEnvelope {
    body: string;
    "content-type": string;
    "content-encoding": string;
    headers?: Record<string, unknown>;
    properties: {
        body_encoding: string;
        delivery_tag: string;
        delivery_info: {
            exchange: string;
            routing_key: string;
        };
        priority: number;
    };
}

function prefixRedisKey(key: string, prefix: string): string {
    return prefix ? `${prefix}${key}` : key;
}

function getRedisDbIndex(redisUrl: string): number {
    try {
        const parsed = new URL(redisUrl);
        const dbPath = parsed.pathname.replace(/^\//, "");
        if (!dbPath) {
            return 0;
        }
        const db = Number.parseInt(dbPath, 10);
        return Number.isFinite(db) ? db : 0;
    } catch {
        return 0;
    }
}

function getFanoutTopic(
    exchange: string,
    redisUrl: string,
    globalKeyPrefix: string,
): string {
    const db = getRedisDbIndex(redisUrl);
    const topic = `${REDIS_FANOUT_PREFIX_TEMPLATE.replace("{db}", String(db))}${exchange}`;
    return prefixRedisKey(topic, globalKeyPrefix);
}

function encodeTransportEnvelope(
    body: Record<string, unknown>,
    exchange: string,
    routingKey: string,
    headers?: Record<string, unknown>,
): string {
    const encodedBody = Buffer.from(JSON.stringify(body), "utf8").toString(
        "base64",
    );
    const envelope: TransportEnvelope = {
        body: encodedBody,
        "content-type": CELERY_CONTENT_TYPE,
        "content-encoding": CELERY_CONTENT_ENCODING,
        headers,
        properties: {
            body_encoding: "base64",
            delivery_tag: randomUUID(),
            delivery_info: {
                exchange,
                routing_key: routingKey,
            },
            priority: 0,
        },
    };
    return JSON.stringify(envelope);
}

function decodeTransportEnvelope(raw: string): {
    headers: Record<string, unknown>;
    body: unknown;
} {
    const envelope = JSON.parse(raw) as Partial<TransportEnvelope>;
    const decodedBody = Buffer.from(
        String(envelope.body || ""),
        "base64",
    ).toString("utf8");
    return {
        headers: (envelope.headers || {}) as Record<string, unknown>,
        body: decodedBody ? JSON.parse(decodedBody) : null,
    };
}

class NoopTaskQueueInspector implements TaskQueueInspector {
    async inspectWorkers(): Promise<WorkerInspectionResult> {
        return {
            workers: [],
            queueNames: new Set<string>(),
            errors: [],
        };
    }
}

class CeleryRedisTaskQueueInspector implements TaskQueueInspector {
    private readonly config = getObservabilityConfig();

    async inspectWorkers(): Promise<WorkerInspectionResult> {
        if (!this.config.redisUrl) {
            return {
                workers: [],
                queueNames: new Set<string>(),
                errors: [],
            };
        }

        const payload = await this.inspectViaPidbox();
        const workers = buildWorkers(payload);
        const queueNames = new Set<string>();
        workers.forEach((worker) =>
            worker.queues.forEach((queueName) => queueNames.add(queueName)),
        );

        return {
            workers,
            queueNames,
            errors: payload.errors,
        };
    }

    private async inspectViaPidbox(): Promise<CeleryInspectPayload> {
        const redis = createClient({ url: this.config.redisUrl });
        await redis.connect();

        const subcommands: CeleryInspectSubcommand[] = [
            "stats",
            "active",
            "reserved",
            "scheduled",
            "active_queues",
        ];

        try {
            const results = await Promise.allSettled(
                subcommands.map((subcommand) =>
                    this.runInspectCommand(redis, subcommand),
                ),
            );

            const payload: CeleryInspectPayload = {
                stats: {},
                active: {},
                reserved: {},
                scheduled: {},
                active_queues: {},
                errors: [],
            };

            subcommands.forEach((subcommand, index) => {
                const result = results[index];
                if (result.status === "fulfilled") {
                    switch (subcommand) {
                        case "stats":
                            payload.stats = result.value as Record<
                                string,
                                Record<string, unknown>
                            >;
                            break;
                        case "active":
                            payload.active = result.value as Record<
                                string,
                                unknown[]
                            >;
                            break;
                        case "reserved":
                            payload.reserved = result.value as Record<
                                string,
                                unknown[]
                            >;
                            break;
                        case "scheduled":
                            payload.scheduled = result.value as Record<
                                string,
                                unknown[]
                            >;
                            break;
                        case "active_queues":
                            payload.active_queues = result.value as Record<
                                string,
                                Array<Record<string, unknown>>
                            >;
                            break;
                    }
                    return;
                }
                payload.errors.push(
                    `Worker inspection (${subcommand}) failed: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`,
                );
            });

            return payload;
        } finally {
            await redis.quit();
        }
    }

    private async runInspectCommand(
        sharedRedis: ReturnType<typeof createClient>,
        subcommand: CeleryInspectSubcommand,
    ): Promise<Record<string, unknown>> {
        const controlExchange = `${this.config.celeryControlExchange}.pidbox`;
        const replyExchange = `reply.${this.config.celeryControlExchange}.pidbox`;
        const replyRoutingKey = randomUUID();
        const replyQueueName = `${replyRoutingKey}.${replyExchange}`;
        const replyBindingKey = prefixRedisKey(
            `${REDIS_BINDING_PREFIX}${replyExchange}`,
            this.config.redisGlobalKeyPrefix,
        );
        const replyBindingValue = [replyRoutingKey, "", replyQueueName].join(
            REDIS_BINDING_SEPARATOR,
        );
        const replyQueueKey = prefixRedisKey(
            replyQueueName,
            this.config.redisGlobalKeyPrefix,
        );
        const ticket = randomUUID();
        const timeoutMs = this.config.celeryInspectTimeoutMs;

        // brPop on shared connections can interfere, so use a dedicated client
        // just for the blocking pop — but reuse the shared one for setup/teardown.
        const popRedis = sharedRedis.duplicate();
        await popRedis.connect();

        try {
            await sharedRedis.sAdd(replyBindingKey, replyBindingValue);
            await sharedRedis.del(replyQueueKey);

            const commandBody: Record<string, unknown> = {
                method: subcommand,
                arguments: {},
                destination: null,
                pattern: null,
                matcher: null,
                ticket,
                reply_to: {
                    exchange: replyExchange,
                    routing_key: replyRoutingKey,
                },
            };

            const envelope = encodeTransportEnvelope(
                commandBody,
                controlExchange,
                "",
                {
                    clock: Date.now(),
                    expires: Math.floor(Date.now() / 1000 + timeoutMs / 1000),
                },
            );

            await sharedRedis.publish(
                getFanoutTopic(
                    controlExchange,
                    this.config.redisUrl!,
                    this.config.redisGlobalKeyPrefix,
                ),
                envelope,
            );

            return await this.collectReplies(
                popRedis,
                replyQueueKey,
                ticket,
                timeoutMs,
            );
        } finally {
            await sharedRedis.sRem(replyBindingKey, replyBindingValue);
            await sharedRedis.del(replyQueueKey);
            await popRedis.quit();
        }
    }

    private async collectReplies(
        redis: ReturnType<typeof createClient>,
        replyQueueKey: string,
        ticket: string,
        timeoutMs: number,
    ): Promise<Record<string, unknown>> {
        const replies: Record<string, unknown> = {};
        const startedAt = Date.now();

        while (Date.now() - startedAt < timeoutMs) {
            const remainingMs = timeoutMs - (Date.now() - startedAt);
            if (remainingMs <= 0) break;
            const timeoutSeconds = Math.max(0.1, remainingMs / 1000);
            const reply = await redis.brPop(replyQueueKey, timeoutSeconds);

            if (!reply) {
                break;
            }

            const { headers, body } = decodeTransportEnvelope(reply.element);
            if (
                headers.ticket !== ticket ||
                !body ||
                typeof body !== "object" ||
                Array.isArray(body)
            ) {
                continue;
            }

            Object.assign(replies, body as Record<string, unknown>);
        }

        return replies;
    }
}

function createTaskQueueInspector(): TaskQueueInspector {
    const config = getObservabilityConfig();

    switch (config.taskQueueSystem) {
        case "celery":
            return new CeleryRedisTaskQueueInspector();
        case "none":
        default:
            return new NoopTaskQueueInspector();
    }
}

function buildWorkers(payload: CeleryInspectPayload): ObservabilityWorker[] {
    const workerNames = Array.from(
        new Set([
            ...Object.keys(payload.stats),
            ...Object.keys(payload.active),
            ...Object.keys(payload.reserved),
            ...Object.keys(payload.scheduled),
            ...Object.keys(payload.active_queues),
        ]),
    ).sort();

    return workerNames.map((workerName) => {
        const stats = payload.stats[workerName] || {};
        const queues = Array.isArray(payload.active_queues[workerName])
            ? payload.active_queues[workerName]
                  .map((queue) =>
                      queue && typeof queue === "object"
                          ? String(queue.name || "")
                          : "",
                  )
                  .filter(Boolean)
            : [];

        const broker =
            stats &&
            typeof stats === "object" &&
            stats.broker &&
            typeof stats.broker === "object"
                ? String(
                      (stats.broker as Record<string, unknown>).transport || "",
                  )
                : null;

        return {
            name: workerName,
            active_count: Array.isArray(payload.active[workerName])
                ? payload.active[workerName].length
                : 0,
            reserved_count: Array.isArray(payload.reserved[workerName])
                ? payload.reserved[workerName].length
                : 0,
            scheduled_count: Array.isArray(payload.scheduled[workerName])
                ? payload.scheduled[workerName].length
                : 0,
            queues,
            pool:
                stats &&
                typeof stats === "object" &&
                stats.pool &&
                typeof stats.pool === "object"
                    ? (stats.pool as Record<string, unknown>)
                    : undefined,
            total:
                stats &&
                typeof stats === "object" &&
                stats.total &&
                typeof stats.total === "object"
                    ? (stats.total as Record<string, unknown>)
                    : undefined,
            broker,
            pid:
                typeof (stats as Record<string, unknown>).pid === "number"
                    ? ((stats as Record<string, unknown>).pid as number)
                    : null,
            uptime:
                typeof (stats as Record<string, unknown>).uptime === "number"
                    ? ((stats as Record<string, unknown>).uptime as number)
                    : null,
        };
    });
}

async function inspectBrokerQueues(
    queueNames: string[],
): Promise<ObservabilityBrokerQueue[]> {
    const config = getObservabilityConfig();
    if (!config.redisUrl || queueNames.length === 0) {
        return [];
    }

    const redis = createClient({ url: config.redisUrl });
    await redis.connect();

    try {
        const allQueueNames = Array.from(
            new Set([...queueNames, config.defaultQueueName].filter(Boolean)),
        ).sort();
        const requests: Array<{
            queueName: string;
            bucketName: string;
            key: string;
        }> = [];

        for (const queueName of allQueueNames) {
            requests.push({
                queueName,
                bucketName: "default",
                key: prefixRedisKey(queueName, config.redisGlobalKeyPrefix),
            });
            for (const priority of config.redisPrioritySteps) {
                if (priority === 0) {
                    continue;
                }
                requests.push({
                    queueName,
                    bucketName: `priority_${priority}`,
                    key: prefixRedisKey(
                        `${queueName}${config.redisPrioritySeparator}${priority}`,
                        config.redisGlobalKeyPrefix,
                    ),
                });
            }
        }

        const counts = await Promise.all(
            requests.map((request) => redis.lLen(request.key)),
        );
        const byQueue = new Map<string, ObservabilityBrokerQueue>();

        requests.forEach((request, index) => {
            const existing = byQueue.get(request.queueName) || {
                name: request.queueName,
                pending_count: 0,
                priority_buckets: {},
                is_default: request.queueName === config.defaultQueueName,
            };

            const count = Number(counts[index] || 0);
            existing.priority_buckets[request.bucketName] = count;
            existing.pending_count += count;
            byQueue.set(request.queueName, existing);
        });

        return Array.from(byQueue.values());
    } finally {
        await redis.quit();
    }
}

const QUEUE_SNAPSHOT_TTL_MS = 5_000;
let cachedSnapshot: { data: ObservabilityQueueSnapshot; expiresAt: number } | null = null;

export async function getQueueSnapshot(
    observedQueueNames: string[] = [],
): Promise<ObservabilityQueueSnapshot> {
    if (cachedSnapshot && Date.now() < cachedSnapshot.expiresAt) {
        return cachedSnapshot.data;
    }

    const config = getObservabilityConfig();
    const workerInspection = await createTaskQueueInspector().inspectWorkers();
    const workers = workerInspection.workers;
    const discoveredQueueNames = new Set<string>(observedQueueNames);
    workerInspection.queueNames.forEach((queueName) =>
        discoveredQueueNames.add(queueName),
    );
    if (config.defaultQueueName) {
        discoveredQueueNames.add(config.defaultQueueName);
    }

    let brokerQueues: ObservabilityBrokerQueue[] = [];
    const errors = [...workerInspection.errors];

    try {
        brokerQueues = await inspectBrokerQueues(
            Array.from(discoveredQueueNames),
        );
    } catch (error) {
        errors.push(
            `Broker inspection failed: ${error instanceof Error ? error.message : String(error)}`,
        );
    }

    const snapshot: ObservabilityQueueSnapshot = {
        counts: {
            workers: workers.length,
            active_tasks: workers.reduce(
                (total, worker) => total + worker.active_count,
                0,
            ),
            reserved_tasks: workers.reduce(
                (total, worker) => total + worker.reserved_count,
                0,
            ),
            scheduled_tasks: workers.reduce(
                (total, worker) => total + worker.scheduled_count,
                0,
            ),
            pending_tasks: brokerQueues.reduce(
                (total, queue) => total + queue.pending_count,
                0,
            ),
            broker_queues: brokerQueues.length,
        },
        workers,
        broker_queues: brokerQueues,
        errors,
    };

    cachedSnapshot = { data: snapshot, expiresAt: Date.now() + QUEUE_SNAPSHOT_TTL_MS };
    return snapshot;
}
