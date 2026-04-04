# AgentQ

An open source observability platform for AI agents and task queues. AgentQ helps you trace agent runs, inspect LLM calls, monitor workers, and debug failures across your AI infrastructure.

## What's Inside

- **[`server/`](server/)** -- A Next.js web application that provides the observability dashboard. Displays run timelines, span trees, token usage, queue depths, worker status, and AI-powered search.

- **[`sdk/`](sdk/)** -- A Python SDK that instruments your agents. Drop in the `@agent` decorator and auto-instrumentation patches for OpenAI, Anthropic, and Google Gemini to start sending traces.

## Quick Start

### 1. Start the server

The fastest way to run the server locally is with Docker Compose:

```bash
cp server/.env.example server/.env
# Edit server/.env with your database credentials

docker compose up
```

This starts PostgreSQL, Redis, and the AgentQ server at `http://localhost:3000`.

Alternatively, run the server directly:

```bash
cd server
npm install
npm run dev
```

See [`server/README.md`](server/README.md) for full setup instructions.

### 2. Install the SDK

```bash
pip install agentq
```

### 3. Instrument your agents

```python
import agentq

agentq.init(endpoint="http://localhost:3000")
agentq.instrument()  # auto-patches OpenAI, Anthropic, Gemini

@agentq.agent(name="my-agent")
def my_agent(task):
    # Your agent logic here -- all LLM calls are traced automatically
    return result
```

See [`sdk/README.md`](sdk/README.md) for the full SDK documentation.

## Architecture

```
Your Python Agents (SDK)  --OTLP-->  AgentQ Server  --SQL-->  PostgreSQL
                                          |
                                     Redis (queue inspection)
```

The SDK sends OpenTelemetry-compatible traces to the server's `/v1/traces` endpoint. The server stores runs and spans in PostgreSQL and optionally inspects Celery/Redis queues for live worker status.

## License

[MIT](LICENSE)
