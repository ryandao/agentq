# AgentQ SDK

A Python SDK for instrumenting AI agents with observability. Traces agent runs, LLM calls, and tool invocations, sending data to an AgentQ server via OpenTelemetry.

## Installation

```bash
pip install agentq
```

For auto-instrumentation of specific LLM providers or agent frameworks, install extras:

```bash
# LLM providers
pip install "agentq[openai]"
pip install "agentq[anthropic]"
pip install "agentq[gemini]"

# Agent frameworks
pip install "agentq[langchain]"       # LangChain / LangGraph
pip install "agentq[crewai]"          # CrewAI
pip install "agentq[openai-agents]"   # OpenAI Agents SDK
pip install "agentq[autogen]"         # AutoGen / AG2

# Everything
pip install "agentq[all]"
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
- **LLM auto-instrumentation** -- Monkey-patches OpenAI, Anthropic, and Google Gemini to trace every LLM call
- **Agent framework auto-instrumentation** -- Patches LangChain/LangGraph, CrewAI, OpenAI Agents SDK, and AutoGen so agent entry points are traced without `@agent`
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

Activate auto-instrumentation for all supported libraries. Safe to call even if libraries aren't installed.

**LLM providers:** OpenAI, Anthropic, Google Gemini
**Agent frameworks:** LangChain/LangGraph, CrewAI, OpenAI Agents SDK, AutoGen/AG2
**Infrastructure:** Celery

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

## Agent Framework Examples

With `agentq.instrument()`, the following frameworks are traced automatically — no `@agent` decorator needed.

### LangChain / LangGraph

```python
import agentq
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser

agentq.init(endpoint="http://localhost:3000")
agentq.instrument()

# Chain.invoke is auto-traced
chain = ChatPromptTemplate.from_template("Tell me about {topic}") | ChatOpenAI() | StrOutputParser()
result = chain.invoke({"topic": "AI agents"})
# → span: RunnableSequence (run_type=chain)

# AgentExecutor.invoke is auto-traced
from langchain.agents import AgentExecutor
executor = AgentExecutor(agent=..., tools=[...])
result = executor.invoke({"input": "research AI agents"})
# → span: AgentExecutor (run_type=agent)

# LangGraph CompiledStateGraph.invoke / stream is auto-traced
from langgraph.graph import StateGraph
graph = StateGraph(...)
app = graph.compile()
result = app.invoke({"messages": [("user", "hello")]})
# → span: CompiledStateGraph (run_type=agent)
```

### CrewAI

```python
import agentq
from crewai import Agent, Task, Crew

agentq.init(endpoint="http://localhost:3000")
agentq.instrument()

researcher = Agent(role="Researcher", goal="Find info", backstory="...")
task = Task(description="Research AI", agent=researcher, expected_output="Report")
crew = Crew(agents=[researcher], tasks=[task])

result = crew.kickoff()
# → spans:
#   Crew(Researcher) (run_type=agent) — top-level crew span
#   Researcher.execute_task (run_type=task) — per-agent task span
```

### OpenAI Agents SDK

```python
import agentq
from agents import Agent, Runner

agentq.init(endpoint="http://localhost:3000")
agentq.instrument()

agent = Agent(name="assistant", instructions="You are helpful.")
result = Runner.run_sync(agent, "What is the capital of France?")
# → span: assistant (run_type=agent)

# Async
import asyncio
result = asyncio.run(Runner.run(agent, "Explain quantum computing"))
# → span: assistant (run_type=agent)
```

### AutoGen / AG2

```python
import agentq
from autogen import ConversableAgent

agentq.init(endpoint="http://localhost:3000")
agentq.instrument()

assistant = ConversableAgent("assistant", system_message="You are helpful.")
user = ConversableAgent("user", human_input_mode="NEVER", max_consecutive_auto_reply=1)

result = user.initiate_chat(assistant, message="What is 2+2?")
# → spans:
#   user->assistant (run_type=agent) — top-level chat span
#   assistant.generate_reply (run_type=task) — per-reply span
```

## License

[MIT](../LICENSE)
