# LangChain Multi-Agent Example

A multi-agent content pipeline built with LangChain's `Runnable` interface, automatically traced by AgentQ's LangChain integration. An **Editor-in-Chief** chain coordinates a **Researcher** chain and a **Writer** chain — all with automatic span capture.

## What It Demonstrates

- **LangChain auto-instrumentation:** AgentQ's `instrument()` call automatically detects LangChain and installs a callback handler — no `@agent` decorator needed for LangChain chains.
- **Chain-to-chain delegation:** The editor chain invokes specialist chains as sub-steps, creating parent-child trace hierarchies.
- **Custom Runnables:** Uses `RunnableLambda` to build agents as composable LangChain components.
- **Tool tracing:** Tools defined via LangChain-style patterns are captured with `agentq.track_tool()`.
- **Hybrid instrumentation:** Combines LangChain auto-instrumentation with manual `agentq.track_tool()` calls for full visibility.
- **Mock responses:** Uses custom fake LLM/chain implementations — no API keys required.

## Architecture

```
Editor-in-Chief (RunnableSequence)
├── Researcher Chain (RunnableLambda)
│   ├── [tool] web_search
│   └── [chain] analyze_and_summarize (mock LLM)
└── Writer Chain (RunnableLambda)
    ├── [chain] outline_generator (mock LLM)
    ├── [chain] draft_writer (mock LLM)
    └── [tool] format_output
```

## Setup

```bash
# 1. Make sure the AgentQ server is running
#    (from the repo root: docker compose up -d)

# 2. Create a virtual environment
python -m venv .venv && source .venv/bin/activate

# 3. Install dependencies
pip install -r requirements.txt
```

## Run

```bash
python main.py
```

You should see console output showing each chain step. Then open http://localhost:3000 to view the trace — you'll see LangChain chains, LLM calls, and tool invocations all captured automatically.

## Customization

**Use a real LLM:** Replace `FakeLLM` with `ChatOpenAI` or another LangChain LLM provider:

```python
from langchain_openai import ChatOpenAI
llm = ChatOpenAI(model="gpt-4")
```

Install the provider package (`pip install langchain-openai`) and set your `OPENAI_API_KEY`. AgentQ auto-instrumentation will trace the real LLM calls automatically.

**Change the endpoint:** Set the `AGENTQ_ENDPOINT` environment variable:

```bash
AGENTQ_ENDPOINT=https://your-server.com python main.py
```
