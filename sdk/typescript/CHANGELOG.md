# Changelog

All notable changes to `@agentq/sdk` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-04-13

### Added

- `AgentQClient` — HTTP client for agent CRUD, heartbeats, and task management
- `@agent` decorator — TypeScript equivalent of Python SDK's `@agent` for declarative registration
- `AgentRegistry` — singleton to collect decorated agents and bulk-sync with platform
- Comprehensive TypeScript type definitions for all API models
- Custom error hierarchy (`AgentQError`, `AgentQApiError`, `AgentQConfigError`, `AgentQNetworkError`, `AgentQTimeoutError`, `AgentNotFoundError`)
- Retry logic with configurable exponential backoff
- Dual CJS/ESM build with `.d.ts` declarations via tsup
- Unit tests with vitest (35+ tests)
- Full README with usage examples and API reference
