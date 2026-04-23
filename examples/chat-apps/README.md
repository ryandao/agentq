# AgentQ Chat App Examples

Interactive multi-agent chat applications with Streamlit UI for testing AgentQ observability. Each app demonstrates a different multi-agent architecture pattern — run it, chat with it, and watch the traces appear in your AgentQ dashboard.

## Apps

| App | Pattern | Description |
|-----|---------|-------------|
| [`support-bot/`](support-bot/) | **Router / Dispatcher** | Customer support bot that routes questions to specialist agents (Billing, Technical, FAQ). Demonstrates branching trace topology. |
| [`research-assistant/`](research-assistant/) | **Sequential Pipeline** | Research assistant that flows queries through Researcher → Analyzer → Writer agents. Demonstrates linear trace chains. |

## Prerequisites

1. **AgentQ server** running locally:

```bash
# From the repo root
cp server/.env.example server/.env
docker compose up -d
```

This starts the AgentQ server at `http://localhost:3000`.

2. **Python 3.11+** with pip.

## Quick Start

```bash
# 1. Pick an app
cd examples/chat-apps/support-bot/

# 2. Create a virtual environment
python -m venv .venv && source .venv/bin/activate

# 3. Install dependencies
pip install -r requirements.txt

# 4. Run the app
streamlit run main.py
```

The Streamlit UI opens in your browser. Chat with the bot, then open `http://localhost:3000` to inspect the traces.

## Architecture

All apps share the same design:

```
examples/chat-apps/
├── README.md               ← This file
├── shared/
│   ├── __init__.py
│   ├── mock_llm.py         ← Mock LLM helper (no API keys needed)
│   └── agentq_setup.py     ← AgentQ initialization boilerplate
├── support-bot/
│   ├── README.md
│   ├── requirements.txt
│   └── main.py
└── research-assistant/
    ├── README.md
    ├── requirements.txt
    └── main.py
```

### Shared Utilities

The `shared/` package provides common helpers so each app stays focused on its architecture pattern:

- **`mock_llm.py`** — Keyword-based mock LLM that returns realistic responses without any API keys. Configurable delay to simulate latency.
- **`agentq_setup.py`** — One-call AgentQ initialization with sensible defaults.

### Design Principles

- **Works out of the box** — mock LLM responses mean no API keys are needed
- **Self-contained** — each app has its own `requirements.txt`
- **Observable** — every app produces rich multi-agent traces in AgentQ
- **Interactive** — real Streamlit chat UI, not just CLI scripts
- **Readable** — code is documented inline as a learning resource

## Adding a New Chat App

1. Create a new directory under `examples/chat-apps/`
2. Add `main.py`, `requirements.txt`, and `README.md`
3. Import from `shared/` for mock LLM and AgentQ setup
4. Add your app to the table in this README
5. Each app should demonstrate a distinct multi-agent architecture pattern
