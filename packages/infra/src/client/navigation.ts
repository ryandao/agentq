// ---------------------------------------------------------------------------
// @agentq/infra — Infrastructure navigation item
// ---------------------------------------------------------------------------

/**
 * Navigation item definition for the Infrastructure page.
 * Can be used directly in OBSERVABILITY_NAV_ITEMS or composed with other nav items.
 */
export const INFRA_NAV_ITEM = {
    href: "/infrastructure",
    label: "Infrastructure",
    description: "Workers, queues, and system health",
    icon: "FeatherServer",
    match: (pathname: string) =>
        pathname === "/infrastructure" ||
        pathname === "/workers" ||
        pathname === "/queues",
} as const;
