// ---------------------------------------------------------------------------
// @agentq/infra/client — public client-side API
// ---------------------------------------------------------------------------

// API functions
export {
    fetchInfraSnapshot,
    fetchInfraAnalytics,
    fetchInfraSuggestions,
} from "./api";

// Hooks
export {
    useInfraSnapshot,
    useInfraSuggestions,
    useInfraAnalytics,
    useQueueHistory,
} from "./hooks";
export type { InfraSnapshotQueryState } from "./hooks";

// Components
export { InfrastructurePageView } from "./components";

// Navigation
export {
    INFRA_NAV_ITEM,
} from "./navigation";
