# @agentq/infra

Infrastructure monitoring types and utilities for AgentQ.

## Overview

This package contains the canonical type definitions for AgentQ's infrastructure monitoring surface — worker inspection, broker queue snapshots, infrastructure suggestions, and analytics responses.

## Exported Types

| Type | Description |
|------|-------------|
| `ObservabilityWorker` | A Celery worker as observed through inspection |
| `ObservabilityBrokerQueue` | A broker queue (e.g. Redis list backing a Celery queue) |
| `ObservabilityQueueSnapshot` | Point-in-time snapshot of task queue infrastructure |
| `InfraSuggestionCategory` | Suggestion categories: capacity, reliability, performance, operational |
| `InfraSuggestionSeverity` | Severity levels: success, info, warning, critical |
| `InfraSuggestion` | An individual infrastructure suggestion |
| `InfraSuggestionsResponse` | Response payload for suggestions endpoint |
| `InfraSnapshotResponse` | Response payload for snapshot endpoint |
| `InfraAnalyticsResponse` | Response payload for analytics endpoint |

## Usage

```typescript
import type {
    ObservabilityWorker,
    InfraSuggestion,
    InfraAnalyticsResponse,
} from "@agentq/infra";
```

## Building

```bash
npm run build
```

## Backward Compatibility

These types are re-exported from `server/src/server/contracts.ts` so existing imports within the server package continue to work without changes.
