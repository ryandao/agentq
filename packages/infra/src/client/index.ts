// ---------------------------------------------------------------------------
// @agentq/infra/client — public client-side API
// ---------------------------------------------------------------------------

// API functions
export {
    fetchInfraSnapshot,
    fetchInfraAnalytics,
    fetchInfraSuggestions,
} from "./api.js";

// Hooks
export {
    useInfraSnapshot,
    useInfraSuggestions,
    useInfraAnalytics,
    useQueueHistory,
} from "./hooks.js";
export type { InfraSnapshotQueryState } from "./hooks.js";

// Components
export { InfrastructurePageView } from "./components/index.js";

// Navigation
export {
    INFRA_NAV_ITEM,
} from "./navigation.js";
