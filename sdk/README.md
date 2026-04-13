# AgentQ SDK

A Python SDK for instrumenting AI agents with observability. Traces agent runs, LLM calls, and tool invocations, sending data to an AgentQ server via OpenTelemetry.

## Installation

```bash
pip install agentq
```

For auto-instrumentation of specific LLM providers, install them alongside:

```bash
pip install agentq openai anthropic google-genai
```

## Quick Start

```python
import agentq

# Point to your AgentQ server
agentq.init(endpoint="http://localhost:3000")

# Auto-patch supported LLM libraries
agentq.instrument()

@agentq.agent(name="my-agent")
def run_task(prompt: str) -> str:
    # Any OpenAI/Anthropic/Gemini calls inside here are traced automatically
    response = openai.chat.completions.create(
        model="gpt-4",
        messages=[{"role": "user", "content": prompt}],
    )
    return response.choices[0].message.content
```

## Features

- **`@agent` decorator** -- Wraps functions and classes to create traced runs with input/output capture
- **Auto-instrumentation** -- Monkey-patches OpenAI, Anthropic, and Google Gemini to trace every LLM call
- **Framework support** -- Auto-instruments LangChain, CrewAI, AutoGen, and LlamaIndex — no `@agent` needed
- **Session tracking** -- Group related runs into sessions with the `session` context manager
- **Nested spans** -- Nested `@agent` calls and manual `track_agent`/`track_llm`/`track_tool` spans
- **Celery integration** -- Captures queue wait time for Celery tasks
- **OpenTelemetry native** -- Built on OpenTelemetry, compatible with any OTLP endpoint

## API Reference

### `agentq.init(endpoint, headers, service_name)`

Initialize the SDK. Call once at startup.

- `endpoint` -- OTLP HTTP base URL (e.g. `http://localhost:3000`). Falls back to `OTEL_EXPORTER_OTLP_ENDPOINT`.
- `headers` -- Extra headers for OTLP requests (e.g. `{"Authorization": "Bearer sk-xxx"}`).
- `service_name` -- Value for the `service.name` resource attribute (default: `"agentq"`).

### `agentq.instrument()`

Activate auto-instrumentation for OpenAI, Anthropic, Google Gemini, and Celery. Safe to call even if libraries aren't installed.

### `@agentq.agent(name, entry_method, description, version, metadata)`

Decorator for functions or classes. Creates a traced run for each invocation.

For classes, `entry_method` specifies which method(s) to instrument (default: `"execute"`).

### `agentq.session(name, session_id, run_id, metadata)`

Context manager that groups runs into a session:

```python
with agentq.session(name="user-chat"):
    run_task("Hello")
    run_task("Follow up")
```

### Manual Span Context Managers

```python
with agentq.track_agent("sub-agent") as span:
    ...

with agentq.track_llm("gpt-4") as span:
    ...

with agentq.track_tool("web-search") as span:
    ...
```

## Supported Agent Frameworks

`agentq.instrument()` auto-patches these frameworks so their runs are traced without `@agent`:

| Framework | What's Traced | Install |
|-----------|---------------|---------|
| [LangChain](docs/frameworks/langchain.md) | `Runnable.invoke()`, `ainvoke()` | `pip install agentq[langchain]` |
| [CrewAI](docs/frameworks/crewai.md) | `Crew.kickoff()` | `pip install agentq[crewai]` |
| [AutoGen](docs/frameworks/autogen.md) | `ConversableAgent.generate_reply()` | `pip install agentq[autogen]` |
| [LlamaIndex](docs/frameworks/llamaindex.md) | `QueryEngine.query()`, `ChatEngine.chat()` | `pip install agentq[llamaindex]` |

Install all frameworks at once: `pip install agentq[frameworks]`

## License

[MIT](../LICENSE)
