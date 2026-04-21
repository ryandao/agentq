# AgentQ Examples

Runnable multi-agent examples demonstrating AgentQ observability in action. Each example is self-contained — install its dependencies, run it, and see traces appear in your AgentQ dashboard.

## Prerequisites

All examples assume you have an **AgentQ server** running locally. The fastest way:

```bash
# From the repo root
cp server/.env.example server/.env
docker compose up -d
```

This starts the AgentQ server at `http://localhost:3000`. Once running, open the dashboard in your browser to see traces as they arrive.

## Examples

| Example | Framework | Description |
|---------|-----------|-------------|
| [`native-multi-agent/`](native-multi-agent/) | AgentQ `@agent` decorator | Orchestrator agent delegating to research + writing specialist agents with tool calls |
| [`langchain-multi-agent/`](langchain-multi-agent/) | LangChain + AgentQ auto-instrumentation | Multi-agent content pipeline using LangChain chains with automatic trace capture |
| [`crewai-multi-agent/`](crewai-multi-agent/) | CrewAI + AgentQ auto-instrumentation | Marketing campaign crew with sequential task execution across analyst, strategist, and copywriter agents |
| [`autogen-multi-agent/`](autogen-multi-agent/) | AutoGen + AgentQ auto-instrumentation | Software dev team conversation with architect, developer, and reviewer agents taking turns |

## Conventions

Every example follows the same structure:

```
examples/<name>/
├── README.md          # What it does, how to set up, how to run
├── requirements.txt   # Python dependencies (pip install -r requirements.txt)
└── main.py            # Single entrypoint (python main.py)
```

**Design principles:**
- **Works out of the box** — examples use mock/simulated LLM responses by default so no API keys are required. Each README explains how to swap in real API keys if desired.
- **Self-contained** — each example is its own mini-project with its own `requirements.txt`. No shared imports between examples.
- **Traces everything** — each example produces rich multi-agent traces visible in the AgentQ dashboard, demonstrating parent-child agent relationships, tool calls, and LLM interactions.
- **Readable** — code is documented inline so it serves as a learning resource for new users.

## Running an Example

```bash
# 1. cd into the example
cd examples/native-multi-agent/

# 2. Create a virtual environment (recommended)
python -m venv .venv && source .venv/bin/activate

# 3. Install dependencies (includes the AgentQ SDK from the local repo)
pip install -r requirements.txt

# 4. Run it
python main.py
```

Then open http://localhost:3000 and inspect the traces.

## Adding a New Example

1. Create a new subdirectory under `examples/`
2. Add a `README.md`, `requirements.txt`, and `main.py`
3. Follow the conventions above
4. Add your example to the table in this README
