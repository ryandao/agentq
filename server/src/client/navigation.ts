export interface ObservabilityNavItem {
    href: string;
    label: string;
    description: string;
    icon: string;
    match: (pathname: string) => boolean;
}

export const OBSERVABILITY_NAV_ITEMS: ObservabilityNavItem[] = [
    {
        href: "/",
        label: "Overview",
        description: "Health, activity, and recent runs",
        icon: "FeatherLayoutDashboard",
        match: (pathname) => pathname === "/",
    },
    {
        href: "/agents",
        label: "Agents",
        description: "Registered agents and call patterns",
        icon: "FeatherCpu",
        match: (pathname) =>
            pathname === "/agents" || pathname.startsWith("/agents/"),
    },
    {
        href: "/runs",
        label: "Runs",
        description: "Browse recent observed runs",
        icon: "FeatherPlay",
        match: (pathname) =>
            pathname === "/runs" || pathname.startsWith("/runs/"),
    },
    {
        href: "/infrastructure",
        label: "Infrastructure",
        description: "Workers, queues, and system health",
        icon: "FeatherServer",
        match: (pathname) =>
            pathname === "/infrastructure" ||
            pathname === "/workers" ||
            pathname === "/queues",
    },
    {
        href: "/sessions",
        label: "Sessions",
        description: "Group related runs by session",
        icon: "FeatherFolder",
        match: (pathname) =>
            pathname === "/sessions" || pathname.startsWith("/sessions/"),
    },
    {
        href: "/config",
        label: "Config",
        description: "Environment and observability settings",
        icon: "FeatherSettings",
        match: (pathname) => pathname === "/config",
    },
];

export function getObservabilityPageMeta(pathname: string): {
    title: string;
    description: string;
} {
    if (pathname.startsWith("/runs/")) {
        return {
            title: "Run Detail",
            description:
                "Inspect one run, its timeline, spans, workers, and queues.",
        };
    }

    if (pathname.startsWith("/sessions/")) {
        return {
            title: "Session Detail",
            description:
                "View the full conversation flow for a session.",
        };
    }

    const navItem = OBSERVABILITY_NAV_ITEMS.find((item) =>
        item.match(pathname),
    );
    if (navItem) {
        return {
            title: navItem.label,
            description: navItem.description,
        };
    }

    return {
        title: "Observability",
        description:
            "Inspect live runs, workers, queues, sessions, and config.",
    };
}
