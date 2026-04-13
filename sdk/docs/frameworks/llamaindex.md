# LlamaIndex Integration

AgentQ auto-instruments LlamaIndex so all query engine and chat engine invocations are traced — **no `@agent` decorator required**.

## Setup

```bash
pip install agentq llama-index-core
```

```python
import agentq

agentq.init(endpoint="http://localhost:3000")
agentq.instrument()  # Patches LlamaIndex automatically

from llama_index.core import VectorStoreIndex, SimpleDirectoryReader

documents = SimpleDirectoryReader("data").load_data()
index = VectorStoreIndex.from_documents(documents)
query_engine = index.as_query_engine()

result = query_engine.query("What is in the documents?")  # Automatically traced!
```

## What Gets Traced

- **`BaseQueryEngine.query()`** — every query creates a span
- **`BaseChatEngine.chat()`** — every chat creates a span

## Span Attributes

| Attribute | Description |
|-----------|-------------|
| `agentq.run_type` | `agent` |
| `agentq.framework` | `llamaindex` |
| `agentq.llamaindex.component_type` | `query_engine` or `chat_engine` |
| `agentq.llamaindex.class` | The engine class name |

## Combining with `@agent`

```python
@agentq.agent(name="rag-pipeline")
def ask(question: str):
    return query_engine.query(question)  # Nested under agent span
```
