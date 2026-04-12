# @agentq/sdk

TypeScript SDK for **AgentQ** — auto-detect and integrate with popular AI agent frameworks without manual instrumentation.

## Features

- **Zero-config detection** — Automatically detects LangChain, CrewAI, AutoGen, and LlamaIndex in your Node.js runtime
- **Type-safe API** — Full TypeScript support with strict types, generics, and discriminated unions
- **Framework adapters** — Proxy-based wrapping that intercepts agent lifecycle events transparently
- **Event system** — Subscribe to agent start, end, error, tool calls, LLM invocations, and more
- **Extensible** — Register custom adapters for any framework
- **Dual format** — Ships both CommonJS and ESM builds

## Installation

```bash
npm install @agentq/sdk
```

## Quick Start

```ts
import { autoIntegrate } from "@agentq/sdk";

// Auto-detect all installed frameworks and start monitoring
const agentq = autoIntegrate({
  onEvent: (event) => {
    console.log(`[${event.event}] ${event.agentId}`);
  },
});
```

## Manual Configuration

```ts
import { AgentQ, Framework } from "@agentq/sdk";

const agentq = new AgentQ({
  // Only target specific frameworks
  frameworks: [Framework.LANGCHAIN],
  // Don't auto-patch — we'll do it manually
  autoPatch: false,
  // Enable debug logging
  debug: true,
});

// Initialize detection
agentq.init();

// Patch specific frameworks
agentq.patchFramework(Framework.LANGCHAIN);
```

## Wrapping Agents

```ts
import { AgentQ, Framework } from "@agentq/sdk";
// import { AgentExecutor } from "langchain/agents";

const agentq = new AgentQ();
agentq.init();

// Wrap a LangChain agent — same type in, same type out
// const agent = new AgentExecutor({ ... });
// const wrapped = agentq.wrap(agent, Framework.LANGCHAIN, "my-agent");
// wrapped.invoke({ input: "Hello" }); // Events are emitted automatically
```

## Event Handling

```ts
import { AgentQ, AgentEvent, type EventPayload } from "@agentq/sdk";

const agentq = new AgentQ();

agentq.onEvent((event: EventPayload) => {
  switch (event.event) {
    case AgentEvent.AGENT_START:
      console.log(`▶ Agent ${event.agentId} started (run: ${event.runId})`);
      break;
    case AgentEvent.AGENT_END:
      console.log(`✓ Agent ${event.agentId} completed`);
      break;
    case AgentEvent.AGENT_ERROR:
      console.error(`✗ Agent ${event.agentId} failed:`, event.data.error);
      break;
    case AgentEvent.TOOL_CALL:
      console.log(`🔧 Tool called:`, event.data);
      break;
  }
});
```

## Framework Detection

```ts
import { FrameworkDetector, Framework } from "@agentq/sdk";

const detector = new FrameworkDetector();

// Detect a specific framework
const result = detector.detect(Framework.LANGCHAIN);
console.log(result);
// { framework: "langchain", installed: true, version: "0.1.5", active: false, entryClasses: [] }

// Detect all frameworks
const all = detector.detectAll();

// Get only installed frameworks
const installed = detector.getInstalledFrameworks();

// Get actively loaded frameworks
const active = detector.getActiveFrameworks();
```

## Custom Adapters

```ts
import { AgentQ, Framework, AgentEvent } from "@agentq/sdk";
import { BaseAdapter } from "@agentq/sdk/adapters";

class MyAdapter extends BaseAdapter {
  readonly framework = "custom" as Framework;

  patch(): void {
    // Hook into your framework
    this.markPatched();
  }

  unpatch(): void {
    this.markUnpatched();
  }

  wrapAgent<T>(agent: T, agentId?: string): T {
    const id = this.deriveAgentId(agent, agentId);
    // Return a proxy or instrumented version
    return agent;
  }
}

const agentq = new AgentQ();
agentq.getRegistry().register("custom" as Framework, MyAdapter);
```

## Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `apiUrl` | `string` | `process.env.AGENTQ_API_URL` or `http://localhost:3000` | API endpoint |
| `apiKey` | `string` | `process.env.AGENTQ_API_KEY` | Authentication key |
| `frameworks` | `Framework[]` | All frameworks | Which frameworks to detect |
| `autoPatch` | `boolean` | `true` | Auto-patch detected frameworks |
| `onEvent` | `EventHandler` | — | Global event callback |
| `debug` | `boolean` | `false` | Enable debug logging |

## Supported Frameworks

| Framework | Package | Status |
|-----------|---------|--------|
| LangChain | `langchain`, `@langchain/core` | ✅ Adapter ready |
| CrewAI | `crewai` | ✅ Adapter ready |
| AutoGen | `autogen` | ✅ Adapter ready |
| LlamaIndex | `llamaindex` | ✅ Adapter ready |

## API Reference

### Classes

- **`AgentQ`** — Main client. Call `.init()` to detect and patch frameworks.
- **`FrameworkDetector`** — Checks which frameworks are installed/active.
- **`AdapterRegistry`** — Manages framework → adapter mappings.
- **`BaseAdapter`** — Abstract base class for custom adapters.

### Functions

- **`autoIntegrate(config?)`** — One-liner to create, init, and return an `AgentQ` instance.

### Types

- `Framework` — `"langchain" | "crewai" | "autogen" | "llamaindex"`
- `AgentEvent` — `"agent_start" | "agent_end" | "agent_error" | ...`
- `EventPayload` — Event data including agentId, runId, timestamp, data
- `DetectionResult` — Framework detection result with version info
- `AgentQConfig` — Configuration options
- `AgentMeta` — Metadata for wrapped agents

## Development

```bash
# Install dependencies
npm install

# Run tests
npm test

# Type check
npm run typecheck

# Build
npm run build

# Lint
npm run lint
```

## License

MIT
