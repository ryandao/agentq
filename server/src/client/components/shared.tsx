"use client";

import { ReactNode, useState, useCallback } from "react";
import {
    FeatherAlertCircle,
    FeatherCheck,
    FeatherClipboardCopy,
    FeatherClock,
    FeatherLoader,
    FeatherX,
} from "@subframe/core";
import { IconWithBackground } from "@/src/ui/components/IconWithBackground";
import { COLLAPSE_CHAR_THRESHOLD, COLLAPSE_LINE_THRESHOLD } from "@/src/client/lib/constants";

export function ErrorBanner({ message }: { message: string }) {
    return (
        <div className="flex w-full items-center gap-2 rounded-md border border-solid border-error-200 bg-error-50 px-4 py-3">
            <FeatherAlertCircle className="text-body font-body text-error-600 flex-none" />
            <span className="text-body font-body text-error-700">{message}</span>
        </div>
    );
}

export function EmptyState({ title, description }: { title: string; description: string }) {
    return (
        <div className="flex w-full flex-col items-center gap-2 rounded-md border border-dashed border-neutral-300 px-5 py-10 text-center">
            <span className="text-body-bold font-body-bold text-default-font">{title}</span>
            <span className="max-w-md text-caption font-caption text-subtext-color">{description}</span>
        </div>
    );
}

export function StatCard({
    label,
    value,
    icon,
    variant = "neutral",
}: {
    label: string;
    value: ReactNode;
    icon: ReactNode;
    variant?: "brand" | "neutral" | "error" | "success" | "warning";
}) {
    return (
        <div className="flex flex-col items-start gap-3 rounded-md border border-solid border-neutral-border bg-default-background px-5 py-5 shadow-sm">
            <div className="flex w-full items-center gap-3">
                <IconWithBackground variant={variant} size="small" icon={icon} />
                <span className="text-body font-body text-subtext-color">{label}</span>
            </div>
            <span className="text-heading-2 font-heading-2 text-default-font">{value}</span>
        </div>
    );
}

export function SectionHeader({
    title,
    description,
    action,
}: {
    title: string;
    description?: string;
    action?: ReactNode;
}) {
    return (
        <div className="flex w-full items-start justify-between gap-4">
            <div className="flex flex-col gap-1">
                <span className="text-heading-3 font-heading-3 text-default-font">{title}</span>
                {description ? (
                    <span className="text-caption font-caption text-subtext-color">{description}</span>
                ) : null}
            </div>
            {action}
        </div>
    );
}

export function SectionCard({
    title,
    description,
    action,
    children,
}: {
    title: string;
    description?: string;
    action?: ReactNode;
    children: ReactNode;
}) {
    return (
        <div className="flex w-full flex-col items-start rounded-md border border-solid border-neutral-border bg-default-background shadow-sm">
            <div className="flex w-full flex-wrap items-start justify-between gap-3 border-b border-solid border-neutral-border px-5 py-4">
                <div className="flex flex-col gap-1">
                    <span className="text-body-bold font-body-bold text-default-font">{title}</span>
                    {description ? (
                        <span className="text-caption font-caption text-subtext-color">{description}</span>
                    ) : null}
                </div>
                {action}
            </div>
            <div className="w-full p-5">{children}</div>
        </div>
    );
}

export function LoadingPanel({ message = "Loading..." }: { message?: string }) {
    return (
        <div className="flex w-full items-center justify-center gap-3 rounded-md border border-solid border-neutral-border bg-default-background px-4 py-8">
            <FeatherLoader className="text-body font-body text-subtext-color animate-spin" />
            <span className="text-body font-body text-subtext-color">{message}</span>
        </div>
    );
}

export function QueueErrors({ errors }: { errors: string[] }) {
    if (errors.length === 0) return null;
    return (
        <div className="flex w-full items-center gap-2 rounded-md border border-solid border-error-200 bg-error-50 px-4 py-3">
            <FeatherAlertCircle className="text-body font-body text-error-600 flex-none" />
            <span className="text-body font-body text-error-700">{errors.join(" ")}</span>
        </div>
    );
}

export function DismissibleBanner({
    message,
    onDismiss,
}: {
    message: string;
    onDismiss: () => void;
}) {
    return (
        <div className="flex w-full items-center gap-2 rounded-md border border-solid border-error-200 bg-error-50 px-4 py-3">
            <FeatherAlertCircle className="text-body font-body text-error-600 flex-none" />
            <span className="grow text-body font-body text-error-700">{message}</span>
            <button type="button" onClick={onDismiss} className="flex-none text-error-500 hover:text-error-700">
                <FeatherX className="h-4 w-4" />
            </button>
        </div>
    );
}

export function CollapsiblePre({ content, className }: { content: string; className?: string }) {
    const [isCollapsed, setIsCollapsed] = useState(true);
    const isLong =
        content.length > COLLAPSE_CHAR_THRESHOLD ||
        content.split("\n").length > COLLAPSE_LINE_THRESHOLD;

    return (
        <div className="relative">
            <pre
                className={`overflow-x-auto rounded-md p-3 text-[12px] leading-5 whitespace-pre-wrap break-words ${className ?? ""}`}
                style={isLong && isCollapsed ? { maxHeight: "320px", overflow: "hidden" } : undefined}
            >
                {content}
            </pre>
            {isLong ? (
                <>
                    {isCollapsed ? (
                        <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-neutral-100 to-transparent rounded-b-md" />
                    ) : null}
                    <button
                        type="button"
                        className="relative z-10 mt-1 text-[12px] font-medium text-brand-600 hover:text-brand-700 cursor-pointer"
                        onClick={() => setIsCollapsed((prev) => !prev)}
                    >
                        {isCollapsed ? "Show more" : "Show less"}
                    </button>
                </>
            ) : null}
        </div>
    );
}

export function CopyablePre({ content, className, maxH }: { content: string; className?: string; maxH?: string }) {
    const [copied, setCopied] = useState(false);

    const handleCopy = useCallback(() => {
        navigator.clipboard.writeText(content).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        });
    }, [content]);

    return (
        <div className="group/copy relative">
            <pre className={`overflow-x-auto rounded-md border border-solid border-neutral-border bg-neutral-100 p-3 pr-10 text-[12px] leading-5 text-default-font whitespace-pre-wrap break-words ${maxH ?? "max-h-[400px]"} overflow-y-auto ${className ?? ""}`}>
                {content}
            </pre>
            <button
                type="button"
                onClick={handleCopy}
                className="absolute top-2 right-2 rounded-md p-1 text-subtext-color opacity-0 transition-opacity hover:text-default-font group-hover/copy:opacity-100"
                title="Copy to clipboard"
            >
                {copied ? (
                    <FeatherCheck className="h-3.5 w-3.5 text-success-700" />
                ) : (
                    <FeatherClipboardCopy className="h-3.5 w-3.5" />
                )}
            </button>
        </div>
    );
}

export function getStatusIcon(status?: string | null) {
    if (status === "SUCCESS") return <FeatherCheck />;
    if (status === "FAILURE" || status === "ABORTED") return <FeatherX />;
    if (status === "RUNNING") return <FeatherLoader />;
    if (status === "PENDING") return <FeatherClock />;
    return null;
}
