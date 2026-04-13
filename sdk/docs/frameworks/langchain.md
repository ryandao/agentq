# LangChain Integration

AgentQ auto-instruments LangChain so all chain, agent, and tool invocations are traced — **no `@agent` decorator required**.

## Setup

```bash
pip install agentq langchain-core
```

```python
import agentq

agentq.init(endpoint="http://localhost:3000")
agentq.instrument()  # Patches LangChain automatically

# Now all Runnable.invoke() / ainvoke() calls are traced
from langchain_core.runnables import RunnableSequence
chain = prompt | llm | parser
result = chain.invoke({"input": "Hello"})  # Automatically traced!
```

## What Gets Traced

- **`Runnable.invoke()`** — synchronous invocations
- **`Runnable.ainvoke()`** — asynchronous invocations
- All subclasses: chains, agents, tools, LLMs, prompts, parsers

## Span Attributes

| Attribute | Description |
|-----------|-------------|
| `agentq.run_type` | `agent`, `tool`, or `llm` (auto-detected) |
| `agentq.framework` | `langchain` |
| `agentq.langchain.class` | The Runnable class name |

## Run Type Detection

The patch auto-classifies each Runnable:
- **AgentExecutor** / agent modules → `agent`
- **Tool** classes → `tool`
- **ChatModel / LLM** classes → `llm`
- Everything else → `agent`

## Combining with `@agent`

You can still use `@agent` for top-level entry points. LangChain calls inside will be nested as child spans:

```python
@agentq.agent(name="qa-pipeline")
def answer_question(question: str) -> str:
    # LangChain calls are auto-traced as children of this agent span
    return chain.invoke({"question": question})
```
