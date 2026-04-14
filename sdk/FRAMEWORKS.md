# AgentQ Framework Integrations

AgentQ natively supports popular agent frameworks **without requiring the `@agent` decorator**. Simply call `agentq.instrument()` after `agentq.init()` and any installed frameworks will be automatically detected and instrumented.

## Supported Frameworks

| Framework | Auto-detected | What's traced |
|-----------|---------------|---------------|
| **LangChain** | ✅ | Chains, LLM calls, tool calls, retrievers |
| **CrewAI** | ✅ | Crew kickoff, agent execution, tasks |
| **AutoGen** | ✅ | Agent conversations, message generation |
| **LlamaIndex** | ✅ | Query engines, retrievers |
| **Haystack** | ✅ | Pipeline runs |

## Quick Start

```python
import agentq

# 1. Initialize AgentQ
agentq.init(endpoint="http://localhost:3000")

# 2. Activate auto-instrumentation (detects all installed frameworks)
agentq.instrument()

# 3. Use your framework normally — no @agent decorator needed!
```

## LangChain

AgentQ registers a callback handler that traces all LangChain operations.

```python
import agentq
agentq.init(endpoint="http://localhost:3000")
agentq.instrument()

from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate

prompt = ChatPromptTemplate.from_messages([("user", "{input}")])
chain = prompt | ChatOpenAI(model="gpt-4")

# Automatically traced — chain invocation, LLM call, token usage
result = chain.invoke({"input": "What is the meaning of life?"})
```

**What's captured:**
- Chain runs as `agent` spans with chain name
- LLM calls as `llm` spans with model name and token usage
- Tool calls as `tool` spans
- Retriever calls as `tool` spans with document count

## CrewAI

AgentQ wraps CrewAI's execution pipeline to trace crews, agents, and tasks.

```python
import agentq
agentq.init(endpoint="http://localhost:3000")
agentq.instrument()

from crewai import Agent, Task, Crew

researcher = Agent(role="Researcher", goal="Find info", backstory="...")
writer = Agent(role="Writer", goal="Write content", backstory="...")

research_task = Task(description="Research AI trends", agent=researcher)
write_task = Task(description="Write a summary", agent=writer)

crew = Crew(agents=[researcher, writer], tasks=[research_task, write_task])

# Automatically traced — crew kickoff, agent execution, tasks
result = crew.kickoff()
```

**What's captured:**
- `Crew.kickoff()` as a top-level `agent` span with crew name
- `Agent.execute_task()` as child `agent` spans per agent
- Input/output previews for each span

## AutoGen

AgentQ wraps AutoGen agent message processing and conversations.

```python
import agentq
agentq.init(endpoint="http://localhost:3000")
agentq.instrument()

from autogen import ConversableAgent

assistant = ConversableAgent("assistant", llm_config={"model": "gpt-4"})
user = ConversableAgent("user_proxy", human_input_mode="NEVER")

# Automatically traced — each generate_reply and conversation flow
user.initiate_chat(assistant, message="What is quantum computing?")
```

**What's captured:**
- `initiate_chat()` as a top-level `agent` span
- `generate_reply()` as `agent` spans per agent response
- Message content previews

## LlamaIndex

AgentQ wraps LlamaIndex query engines and retrievers.

```python
import agentq
agentq.init(endpoint="http://localhost:3000")
agentq.instrument()

from llama_index.core import VectorStoreIndex, SimpleDirectoryReader

documents = SimpleDirectoryReader("data").load_data()
index = VectorStoreIndex.from_documents(documents)
query_engine = index.as_query_engine()

# Automatically traced — query, retrieval, synthesis
response = query_engine.query("What did the author do?")
```

**What's captured:**
- `query()` / `aquery()` as `agent` spans with query engine class name
- Retriever calls as `tool` spans with document count
- Query text and response previews

## Haystack

AgentQ wraps Haystack pipeline execution.

```python
import agentq
agentq.init(endpoint="http://localhost:3000")
agentq.instrument()

from haystack import Pipeline
from haystack.components.generators import OpenAIGenerator

pipe = Pipeline()
pipe.add_component("llm", OpenAIGenerator(model="gpt-4"))

# Automatically traced — pipeline run
result = pipe.run({"llm": {"prompt": "Tell me about AI"}})
```

**What's captured:**
- `Pipeline.run()` as `agent` spans with pipeline name
- Input/output key previews

## Backward Compatibility

The `@agent` decorator still works as before. Framework integrations and the decorator can coexist:

```python
import agentq

agentq.init(endpoint="http://localhost:3000")
agentq.instrument()

# This still works — decorator creates an explicit agent span
@agentq.agent(name="my-custom-agent")
def custom_logic():
    # LangChain calls inside are still traced via the framework integration
    chain.invoke(...)
```

## Manual Framework Instrumentation

If you prefer to instrument specific frameworks only, you can import them directly:

```python
from agentq.frameworks.langchain_integration import patch as patch_langchain
from agentq.frameworks.crewai_integration import patch as patch_crewai

patch_langchain()  # Only instrument LangChain
patch_crewai()     # Only instrument CrewAI
```

## Install Framework Dependencies

```bash
# Install with specific framework support
pip install agentq[langchain]
pip install agentq[crewai]
pip install agentq[autogen]
pip install agentq[llamaindex]
pip install agentq[haystack]

# Install with all frameworks
pip install agentq[all]
```
