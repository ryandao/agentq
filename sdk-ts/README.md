# AgentQ TypeScript SDK

Trace and observe AI agent workflows with OpenTelemetry. The TypeScript SDK for [AgentQ](https://agentq.dev) mirrors the Python SDK, enabling Node.js/TypeScript developers to send traces to AgentQ with minimal setup.

## Installation

```bash
npm install agentq
```

## Quick Start

```ts
import { init, instrument, agent, session } from "agentq";
import OpenAI from "openai";

// 1. Initialize tracing
init({
  apiKey: "aq_your_api_key",       // or set AGENTQ_API_KEY env var
  serviceName: "my-agent-app",
});

// 2. Auto-instrument LLM SDKs
instrument();

// 3. Define agents
const researcher = agent("researcher", async (query: string) => {
  const openai = new OpenAI();
  const res = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: query }],
  });
  return res.choices[0].message.content;
});

// 4. Run within a session for context propagation
await session({ sessionId: "sess_1", userId: "user_abc" }, async () => {
  const answer = await researcher("What is quantum computing?");
  console.log(answer);
});
```

## API Reference

### `init(options?)`

Initialize the AgentQ tracing pipeline. Must be called before any other SDK functions.

```ts
init({
  apiKey: "aq_...",                   // API key (or AGENTQ_API_KEY env var)
  endpoint: "https://ingest.agentq.dev", // OTLP endpoint (default)
  serviceName: "my-app",             // Service name for traces
  headers: {},                       // Additional OTLP headers
  debug: false,                      // Enable console debug output
  batchConfig: {                     // Optional batch export tuning
    maxQueueSize: 2048,
    maxExportBatchSize: 512,
    scheduledDelayMillis: 5000,
    exportTimeoutMillis: 30000,
  },
});
```

### `instrument(options?)`

Auto-patch popular LLM SDKs. Call after `init()`.

```ts
const result = instrument({
  openai: true,      // Patch OpenAI Node SDK (default: true)
  anthropic: true,   // Patch Anthropic Node SDK (default: true)
  vercelAI: true,    // Patch Vercel AI SDK (default: true)
});

console.log(result);
// { openai: true, anthropic: false, vercelAI: true }
// (false = SDK not installed / not found)
```

**Supported SDKs:**
- **OpenAI** (`openai` >= 4.0) — `chat.completions.create()`, `completions.create()`, `embeddings.create()`
- **Anthropic** (`@anthropic-ai/sdk` >= 0.20) — `messages.create()`, `completions.create()`
- **Vercel AI** (`ai` >= 3.0) — `generateText()`, `streamText()`, `generateObject()`, `streamObject()`

### `agent(name, fn)` / `@Agent` decorator

Wrap functions to create agent spans.

**Higher-order function:**
```ts
const myAgent = agent("planner", async (task: string) => {
  // Agent logic here
  return result;
});

await myAgent("Plan a trip to Tokyo");
```

**Decorator (TypeScript with `experimentalDecorators`):**
```ts
class MyAgents {
  @Agent("researcher")
  async research(query: string) {
    // Agent logic here
  }
}
```

### `session(options, fn)`

Run code within a session context. All spans created inside `fn` automatically inherit session attributes via `AsyncLocalStorage`.

```ts
await session(
  {
    sessionId: "sess_123",
    runId: "run_456",
    userId: "user_abc",
    metadata: { environment: "production" },
  },
  async () => {
    // All spans here get session attributes
    await myAgent("Hello");
  },
);
```

### Manual Span Helpers

#### `trackLLM(options, fn?)`

Create a span tracking an LLM call.

```ts
// Auto mode — span ends when fn completes
const result = await trackLLM(
  { model: "gpt-4o", provider: "openai" },
  async (span) => {
    const response = await customLLMCall();
    span.setAttribute("gen_ai.usage.total_tokens", 150);
    return response;
  },
);

// Manual mode — you control the span lifecycle
const span = trackLLM({ model: "claude-3", provider: "anthropic" });
try {
  const response = await customLLMCall();
  span.end();
} catch (err) {
  span.recordError(err);
  span.end();
}
```

#### `trackTool(options, fn?)`

Create a span tracking a tool call.

```ts
const result = await trackTool(
  { name: "web-search", input: { query: "latest news" } },
  async (span) => {
    const results = await search("latest news");
    return results;
  },
);
```

#### `trackAgent(options, fn?)`

Create a span tracking an agent invocation manually.

```ts
const result = await trackAgent(
  { name: "summarizer", description: "Summarizes documents" },
  async (span) => {
    // Agent logic
    return summary;
  },
);
```

### `currentSpan()`

Access the current active span for manual enrichment.

```ts
import { currentSpan } from "agentq";

function myBusinessLogic() {
  const span = currentSpan();
  if (span) {
    span.setAttribute("custom.key", "value");
  }
}
```

### `shutdown()` / `flush()`

```ts
// Force-flush pending spans
await flush();

// Graceful shutdown (flushes then closes)
await shutdown();
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `AGENTQ_API_KEY` | API key for authentication | — |
| `AGENTQ_ENDPOINT` | OTLP ingest endpoint | `https://ingest.agentq.dev` |
| `AGENTQ_SERVICE_NAME` | Service name for traces | `agentq-app` |
| `AGENTQ_DEBUG` | Enable debug logging (`true`/`false`) | `false` |

## Technical Details

- **Context propagation** via Node.js `AsyncLocalStorage` — session context flows through async boundaries automatically
- **Dual build** — ESM (`import`) and CJS (`require`) both supported
- **TypeScript strict mode** — full type exports, zero `any` in public API
- **Built with** `tsup` for fast, tree-shakeable output
- **Targets** Node.js >= 18

## License

MIT
