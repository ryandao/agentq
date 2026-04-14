# @agentq/sdk

TypeScript SDK for the [AgentQ](https://agentq.dev) agent management platform.

## Installation

```bash
npm install @agentq/sdk
# or
yarn add @agentq/sdk
# or
pnpm add @agentq/sdk
```

## Quick Start

### Using the Client Directly

```ts
import { AgentQClient } from "@agentq/sdk";

const client = new AgentQClient({
  baseUrl: "https://api.agentq.dev",
  apiKey: process.env.AGENTQ_API_KEY!,
});

// Register an agent
const agent = await client.registerAgent({
  name: "my-assistant",
  description: "A helpful AI assistant",
  framework: "openai",
  capabilities: ["chat", "code-generation"],
  tags: { team: "platform" },
});

console.log(`Registered agent: ${agent.id}`);

// List all active agents
const { items } = await client.listAgents({ status: "active" });
console.log(`Active agents: ${items.length}`);
```

### Using the `@agent` Decorator

The `@agent` decorator is the TypeScript equivalent of the Python SDK's `@agent` decorator. It automatically registers your agent class with the local registry.

```ts
import { agent, AgentRegistry } from "@agentq/sdk";

@agent({
  name: "Summarizer",
  description: "Summarizes long documents",
  version: "1.0.0",
  framework: "langchain",
  capabilities: ["summarize", "extract-key-points"],
})
class SummarizerAgent {
  async run(input: string): Promise<string> {
    // Your agent logic here
    return `Summary of: ${input}`;
  }
}

// Sync all decorated agents with the AgentQ platform
const registered = await AgentRegistry.getInstance().syncAll({
  baseUrl: "https://api.agentq.dev",
  apiKey: process.env.AGENTQ_API_KEY!,
});
```

### Using the Registry Manually

If you prefer not to use decorators, you can register agents manually:

```ts
import { AgentRegistry } from "@agentq/sdk";

const registry = AgentRegistry.getInstance();

registry.register({
  name: "my-agent",
  description: "Manually registered agent",
  framework: "custom",
  capabilities: ["task-execution"],
});

// Sync with the platform
await registry.syncAll({
  baseUrl: "https://api.agentq.dev",
  apiKey: process.env.AGENTQ_API_KEY!,
});
```

## Agent Lifecycle

```ts
const client = new AgentQClient({ baseUrl, apiKey });

// 1. Register
const agent = await client.registerAgent({
  name: "worker-agent",
  capabilities: ["process-data"],
});

// 2. Send heartbeats
setInterval(() => {
  client.heartbeat({ agentId: agent.id, status: "active" });
}, 30_000);

// 3. Poll for tasks
const task = await client.getNextTask(agent.id);
if (task) {
  try {
    const result = await processTask(task.input);
    await client.submitTaskResult(agent.id, task.id, result);
  } catch (err) {
    await client.reportTaskFailure(agent.id, task.id, String(err));
  }
}

// 4. Update status
await client.updateAgent(agent.id, { status: "inactive" });

// 5. Deregister
await client.deleteAgent(agent.id);
```

## Error Handling

The SDK provides typed error classes for different failure scenarios:

```ts
import {
  AgentQApiError,
  AgentQNetworkError,
  AgentQTimeoutError,
  AgentQConfigError,
} from "@agentq/sdk";

try {
  await client.getAgent("non-existent-id");
} catch (err) {
  if (err instanceof AgentQApiError) {
    console.error(`API error ${err.statusCode}: ${err.message}`);
    console.error(`Error code: ${err.code}`);
  } else if (err instanceof AgentQNetworkError) {
    console.error(`Network error: ${err.message}`);
  } else if (err instanceof AgentQTimeoutError) {
    console.error(`Request timed out: ${err.message}`);
  }
}
```

## Configuration

```ts
const client = new AgentQClient({
  // Required
  baseUrl: "https://api.agentq.dev",
  apiKey: "your-api-key",

  // Optional
  timeout: 30_000, // Request timeout in ms (default: 30s)
  headers: {
    // Additional headers for every request
    "X-Custom-Header": "value",
  },
});
```

## API Reference

### `AgentQClient`

| Method | Description |
| --- | --- |
| `registerAgent(request)` | Register a new agent |
| `getAgent(agentId)` | Get agent by ID |
| `listAgents(params?)` | List agents with filters |
| `updateAgent(agentId, request)` | Update an agent |
| `deleteAgent(agentId)` | Delete an agent |
| `heartbeat(payload)` | Send agent heartbeat |
| `getNextTask(agentId)` | Get next pending task |
| `submitTaskResult(agentId, taskId, output)` | Submit task result |
| `reportTaskFailure(agentId, taskId, error)` | Report task failure |

### `AgentRegistry`

| Method | Description |
| --- | --- |
| `getInstance()` | Get singleton instance |
| `register(metadata)` | Register agent locally |
| `unregister(name)` | Remove agent from registry |
| `get(name)` | Get agent metadata |
| `getAll()` | Get all registered agents |
| `has(name)` | Check if agent is registered |
| `syncAll(config)` | Sync all agents with platform |
| `clear()` | Clear all local registrations |

### Decorator: `@agent(options?)`

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `name` | `string` | Class name | Agent name |
| `description` | `string` | — | Agent description |
| `version` | `string` | — | Semver version |
| `framework` | `AgentFramework` | — | Framework type |
| `capabilities` | `string[]` | — | Agent capabilities |
| `autoRegister` | `boolean` | `true` | Auto-register in global registry |

## Supported Frameworks

- `langchain` — LangChain
- `crewai` — CrewAI
- `autogen` — AutoGen
- `openai` — OpenAI Assistants
- `anthropic` — Anthropic Claude
- `custom` — Custom implementation

## Requirements

- Node.js >= 18.0.0 (uses native `fetch`)
- TypeScript >= 5.0 (if using decorators)

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test

# Watch mode
npm run test:watch
```

## License

MIT
