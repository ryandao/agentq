import type { ReactNode } from "react";

import { getObservabilityConfig } from "@/src/server/config";

function maskValue(value?: string | null): string {
    if (!value) {
        return "Not configured";
    }

    if (value.length <= 12) {
        return "Configured";
    }

    return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function ConfigRow({
    label,
    value,
    masked = false,
}: {
    label: string;
    value: string | number;
    masked?: boolean;
}) {
    return (
        <div className="flex w-full items-center justify-between gap-4 border-b border-solid border-neutral-border py-3 last:border-b-0">
            <span className="text-body font-body text-subtext-color">{label}</span>
            <div className="flex items-center gap-2">
                {masked ? (
                    <svg
                        className="h-3.5 w-3.5 text-neutral-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                        />
                    </svg>
                ) : null}
                <span className="text-body-bold font-body-bold text-default-font">
                    {value}
                </span>
            </div>
        </div>
    );
}

function ConfigSection({
    icon,
    title,
    description,
    children,
}: {
    icon: ReactNode;
    title: string;
    description: string;
    children: ReactNode;
}) {
    return (
        <div className="flex w-full items-start gap-8 px-6 py-6 max-md:flex-col max-md:gap-4">
            <div className="flex w-64 flex-none flex-col items-start gap-2 max-md:w-full">
                <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-200">
                        {icon}
                    </div>
                    <span className="text-heading-3 font-heading-3 text-default-font">
                        {title}
                    </span>
                </div>
                <span className="text-caption font-caption text-subtext-color">
                    {description}
                </span>
            </div>
            <div className="flex min-w-0 grow shrink-0 basis-0 flex-col items-start">
                {children}
            </div>
        </div>
    );
}

export default function ConfigPage() {
    const config = getObservabilityConfig();

    return (
        <div className="mx-auto flex w-full max-w-[960px] flex-col gap-8">
            <div className="flex w-full flex-col items-start gap-2">
                <span className="text-heading-1 font-heading-1 text-default-font">
                    Configuration
                </span>
                <span className="text-body font-body text-subtext-color">
                    Read-only runtime configuration for the observability system
                </span>
            </div>

            <div className="flex w-full flex-col items-start rounded-md border border-solid border-neutral-border bg-default-background shadow-sm">
                <ConfigSection
                    icon={
                        <svg
                            className="h-4 w-4 text-neutral-700"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4"
                            />
                        </svg>
                    }
                    title="Storage"
                    description="PostgreSQL configuration for data persistence."
                >
                    <ConfigRow
                        label="Database"
                        value={process.env.DATABASE_URL ? "Configured" : "Not configured"}
                    />
                </ConfigSection>

                <div className="h-px w-full flex-none bg-neutral-border" />

                <ConfigSection
                    icon={
                        <svg
                            className="h-4 w-4 text-neutral-700"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01"
                            />
                        </svg>
                    }
                    title="Queue Backend"
                    description="Redis and Celery configuration for asynchronous task processing."
                >
                    <ConfigRow
                        label="Task Queue System"
                        value={config.taskQueueSystem}
                    />
                    <ConfigRow
                        label="Redis URL"
                        value={maskValue(config.redisUrl)}
                        masked
                    />
                    <ConfigRow
                        label="Redis Key Prefix"
                        value={config.redisGlobalKeyPrefix || "(empty)"}
                    />
                    <ConfigRow
                        label="Default Queue"
                        value={config.defaultQueueName}
                    />
                    <ConfigRow
                        label="Priority Steps"
                        value={config.redisPrioritySteps.join(", ")}
                    />
                    <ConfigRow
                        label="Priority Separator"
                        value={JSON.stringify(config.redisPrioritySeparator)}
                    />
                    <ConfigRow
                        label="Control Exchange"
                        value={config.celeryControlExchange}
                    />
                    <ConfigRow
                        label="Inspect Timeout"
                        value={`${config.celeryInspectTimeoutMs} ms`}
                    />
                </ConfigSection>

                <div className="h-px w-full flex-none bg-neutral-border" />

                <ConfigSection
                    icon={
                        <svg
                            className="h-4 w-4 text-neutral-700"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                            />
                        </svg>
                    }
                    title="Admin Access"
                    description="Authentication and authorization settings for administrative endpoints."
                >
                    <ConfigRow
                        label="Node Environment"
                        value={process.env.NODE_ENV || "development"}
                    />
                    <ConfigRow
                        label="Admin Username"
                        value={
                            process.env.AGENTQ_SERVER_ADMIN_USERNAME ||
                            "Not configured"
                        }
                    />
                    <ConfigRow
                        label="Admin Password"
                        value={
                            process.env.AGENTQ_SERVER_ADMIN_PASSWORD
                                ? "Configured"
                                : "Not configured"
                        }
                        masked={!!process.env.AGENTQ_SERVER_ADMIN_PASSWORD}
                    />
                    <ConfigRow
                        label="Protected Routes"
                        value="/, /runs, /workers, /queues, /sessions, /config, /api/runs, /api/agents, /api/infrastructure, /api/sessions"
                    />
                </ConfigSection>
            </div>

            <div className="flex w-full items-center gap-2 rounded-md bg-neutral-200 px-4 py-3">
                <svg
                    className="h-4 w-4 flex-none text-subtext-color"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                </svg>
                <span className="text-caption font-caption text-subtext-color">
                    Configuration values are derived from environment variables
                    and cannot be modified at runtime.
                </span>
            </div>
        </div>
    );
}
