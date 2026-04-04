"use client";

import * as SubframeCore from "@subframe/core";
import { FeatherMoon, FeatherSun } from "@subframe/core";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode } from "react";
import { useTheme } from "../theme-provider";
import { OBSERVABILITY_NAV_ITEMS } from "../navigation";

export function ObservabilityAppShell({ children }: { children: ReactNode }) {
    const pathname = usePathname();
    const { theme, toggleTheme } = useTheme();

    return (
        <div className="relative flex h-screen w-full items-start bg-neutral-0">
            <div className="bg-grid-overlay" />
            {/* Sidebar */}
            <div className="relative z-10 hidden h-full w-64 flex-none flex-col items-start gap-4 border-r border-solid border-neutral-border bg-neutral-50 px-4 py-6 md:flex">
                <div className="flex w-full items-center gap-3 px-3 py-2">
                    <SubframeCore.Icon
                        className="text-heading-2 font-heading-2 text-brand-600"
                        name="FeatherActivity"
                    />
                    <span className="text-heading-3 font-heading-3 text-default-font tracking-tight">
                        AgentQ
                    </span>
                </div>
                <div className="h-px w-full flex-none bg-neutral-200" />
                <div className="flex w-full flex-col items-start gap-1">
                    {OBSERVABILITY_NAV_ITEMS.filter((item) => item.href !== "/config").map((item) => {
                        const isActive = item.match(pathname);
                        return (
                            <Link key={item.href} href={item.href} className="w-full">
                                <div
                                    className={`flex w-full items-center gap-3 rounded-md px-3 py-2 transition-colors ${
                                        isActive
                                            ? "bg-brand-100 text-brand-700"
                                            : "hover:bg-neutral-200"
                                    }`}
                                >
                                    <SubframeCore.Icon
                                        className={`text-body font-body ${isActive ? "text-brand-600" : "text-subtext-color"}`}
                                        name={item.icon as SubframeCore.IconName}
                                    />
                                    <span
                                        className={
                                            isActive
                                                ? "text-body-bold font-body-bold text-brand-700"
                                                : "text-body font-body text-subtext-color"
                                        }
                                    >
                                        {item.label}
                                    </span>
                                </div>
                            </Link>
                        );
                    })}
                </div>
                <div className="h-px w-full flex-none bg-neutral-200" />
                <div className="flex w-full flex-col items-start gap-1">
                    {OBSERVABILITY_NAV_ITEMS.filter((item) => item.href === "/config").map((item) => {
                        const isActive = item.match(pathname);
                        return (
                            <Link key={item.href} href={item.href} className="w-full">
                                <div
                                    className={`flex w-full items-center gap-3 rounded-md px-3 py-2 transition-colors ${
                                        isActive
                                            ? "bg-brand-100 text-brand-700"
                                            : "hover:bg-neutral-200"
                                    }`}
                                >
                                    <SubframeCore.Icon
                                        className={`text-body font-body ${isActive ? "text-brand-600" : "text-subtext-color"}`}
                                        name={item.icon as SubframeCore.IconName}
                                    />
                                    <span
                                        className={
                                            isActive
                                                ? "text-body-bold font-body-bold text-brand-700"
                                                : "text-body font-body text-subtext-color"
                                        }
                                    >
                                        {item.label}
                                    </span>
                                </div>
                            </Link>
                        );
                    })}
                </div>
                <div className="mt-auto flex w-full flex-col gap-3 px-3">
                    <div className="h-px w-full flex-none bg-neutral-200" />
                    <div className="flex w-full items-center justify-between">
                        <div className="flex items-center gap-2">
                            <div className="h-2 w-2 flex-none rounded-full bg-success-500 animate-pulse" />
                            <span className="text-caption font-caption text-subtext-color">Live &middot; 5s</span>
                        </div>
                        <button
                            type="button"
                            onClick={toggleTheme}
                            className="flex items-center justify-center rounded-md p-1.5 text-subtext-color transition-colors hover:bg-neutral-200 hover:text-default-font"
                            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
                        >
                            {theme === "dark" ? (
                                <FeatherSun className="h-4 w-4" />
                            ) : (
                                <FeatherMoon className="h-4 w-4" />
                            )}
                        </button>
                    </div>
                </div>
            </div>
            {/* Main Content */}
            <div className="relative z-10 flex min-h-0 min-w-0 flex-1 flex-col self-stretch overflow-auto">
                <main className="flex-1 px-8 py-8">{children}</main>
            </div>
        </div>
    );
}
