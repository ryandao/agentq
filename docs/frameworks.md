# Supported Agent Frameworks

AgentQ SDK automatically detects and integrates with popular agent frameworks
so you **don't need** the `@agent` decorator when using them. Just import
`agentq` and call `agentq.init()` — the SDK handles the rest.

## Quick Start

```python
import agentq

# Initialize — auto-detects installed frameworks
agentq.init()

# Now use your framework as normal — AgentQ tracks everything automatically.
```

## Supported Frameworks

| Framework | Package(s) detected | Min version | What's tracked |
|-----------|-------------------|-------------|----------------|
| **LangChain / LangGraph** | `langchain`, `langchain_core`, `langgraph` | 0.1+ | Chain runs, agent actions, LLM calls, tool usage |
| **CrewAI** | `crewai` | 0.1+ | Crew kickoffs, individual agent task executions |
| **AutoGen** | `autogen`, `pyautogen` | 0.2+ | `initiate_chat` conversations, `generate_reply` calls |
| **LlamaIndex** | `llama_index` | 0.10+ | Queries, agent steps, retrieval, synthesis events |
| **OpenAI Agents SDK** | `agents` | 0.1+ | `Runner.run` and `Runner.run_sync` executions |

## How Auto-Detection Works

1. When you call `agentq.init()`, the SDK scans for installed packages.
2. For each detected framework, a **framework integration** is activated.
3. The integration installs lightweight hooks (callbacks, monkey-patches) into
   the framework's execution pipeline.
4. Every agent execution is wrapped in an `AgentRun` and tracked through the
   `AgentQContext` — lifecycle events, errors, and metadata are captured
   automatically.

### Detection Logic

A framework is considered "detected" if **any** of its detection packages can
be resolved via `importlib.util.find_spec()`. This means the package is
installed in the current environment, even if not yet imported.

## Framework Details

### LangChain / LangGraph

**Integration method:** Global callback handler via `langchain_core.callbacks`.

The integration registers a callback handler that listens to:
- `on_chain_start` / `on_chain_end` / `on_chain_error` — tracked as AgentRun lifecycle
- `on_agent_action` — recorded as intermediate steps
- `on_llm_start` — recorded as intermediate steps
- `on_tool_start` — recorded as intermediate steps

```python
import agentq
agentq.init()

from langchain_openai import ChatOpenAI
from langchain.agents import create_openai_tools_agent, AgentExecutor

# No @agent decorator needed — everything is tracked automatically
llm = ChatOpenAI(model="gpt-4")
agent = create_openai_tools_agent(llm, tools, prompt)
executor = AgentExecutor(agent=agent, tools=tools)
result = executor.invoke({"input": "hello"})
```

### CrewAI

**Integration method:** Monkey-patches `Crew.kickoff()`, `Crew.kickoff_async()`,
and `Agent.execute_task()`.

Each crew kickoff creates a top-level AgentRun, and individual agent task
executions are tracked as separate runs.

```python
import agentq
agentq.init()

from crewai import Agent, Task, Crew

# No @agent decorator needed
researcher = Agent(role="Researcher", ...)
writer = Agent(role="Writer", ...)
crew = Crew(agents=[researcher, writer], tasks=[...])
result = crew.kickoff()
```

### AutoGen

**Integration method:** Monkey-patches `ConversableAgent.initiate_chat()` and
`ConversableAgent.generate_reply()`.

Conversations initiated via `initiate_chat` are tracked as top-level runs,
while individual `generate_reply` calls provide step-level tracking.

```python
import agentq
agentq.init()

from autogen import ConversableAgent

# No @agent decorator needed
assistant = ConversableAgent("assistant", ...)
user_proxy = ConversableAgent("user_proxy", ...)
user_proxy.initiate_chat(assistant, message="Hello!")
```

### LlamaIndex

**Integration method:** Global callback handler via `llama_index.core.Settings`.

The integration registers a callback handler that listens to LlamaIndex
events including queries, agent steps, retrieval, and synthesis.

```python
import agentq
agentq.init()

from llama_index.core import VectorStoreIndex, SimpleDirectoryReader

# No @agent decorator needed
documents = SimpleDirectoryReader("data").load_data()
index = VectorStoreIndex.from_documents(documents)
query_engine = index.as_query_engine()
response = query_engine.query("What is AgentQ?")
```

### OpenAI Agents SDK

**Integration method:** Monkey-patches `Runner.run()` and `Runner.run_sync()`.

Every agent run via the Runner is automatically tracked.

```python
import agentq
agentq.init()

from agents import Agent, Runner

# No @agent decorator needed
agent = Agent(name="Assistant", instructions="You are helpful.")
result = Runner.run_sync(agent, "Hello!")
```

## Using the `@agent` Decorator (Still Supported)

The `@agent` decorator is still fully supported for:
- **Custom agents** not built on a supported framework
- **Fine-grained control** over agent tracking metadata
- **Explicit opt-in** when auto-detection is disabled

```python
import agentq

@agentq.agent
def my_custom_agent(query: str) -> str:
    """A custom agent that doesn't use any framework."""
    return f"Answer to: {query}"

@agentq.agent(name="researcher", metadata={"model": "gpt-4"})
async def research_agent(topic: str) -> dict:
    """An async agent with custom metadata."""
    ...
```

## Disabling Auto-Detection

If you want to disable auto-detection and only use the decorator:

```python
import agentq

# Pass auto_detect=False to skip framework detection
agentq.init(auto_detect=False)
```

## Registering Custom Frameworks

Third-party framework authors can register their own framework:

```python
from agentq.autodetect import register_framework
from agentq.autodetect.registry import FrameworkInfo

register_framework(
    FrameworkInfo(
        name="my_framework",
        display_name="My Agent Framework",
        detect_packages=["my_framework"],
        integration_module="my_package.agentq_integration",
        integration_class="MyFrameworkIntegration",
    )
)
```

The integration class must extend `agentq.integrations.base.FrameworkIntegration`
and implement `_install_hooks()` and `_remove_hooks()`.

## Diagnostics

You can inspect which frameworks are supported and which are installed:

```python
import agentq

for fw in agentq.get_supported_frameworks():
    status = "✓ installed" if fw["installed"] else "✗ not installed"
    print(f"{fw['display_name']}: {status}")
```

After initialization, check active integrations:

```python
ctx = agentq.init()
print(ctx.active_integrations)
# {'langchain': <LangChainIntegration>, 'crewai': <CrewAIIntegration>, ...}
```
