# Native Multi-Agent Example

A multi-agent content production pipeline using AgentQ's native `@agent` decorator. An **Orchestrator** agent delegates work to two specialist agents — a **Researcher** and a **Writer** — each with their own tool calls.

## What It Demonstrates

- **Agent-to-agent delegation:** The orchestrator calls specialist agents as sub-steps, creating a parent-child span hierarchy in the trace.
- **`@agent` decorator:** Both function-based and class-based agents instrumented with `@agentq.agent()`.
- **Tool calls:** Each specialist agent uses `agentq.track_tool()` to trace tool invocations (web search, document retrieval, text formatting).
- **LLM calls:** Simulated LLM calls traced via `agentq.track_llm()` so you can see the full call stack in the dashboard.
- **Session context:** The entire pipeline runs inside an `agentq.session()` context, grouping all spans under one session.
- **Mock responses:** No API keys needed — LLM responses are simulated so the example works out of the box.

## Architecture

```
Orchestrator Agent
├── Research Agent
│   ├── [tool] web_search("AI observability trends 2025")
│   ├── [llm]  analyze_sources (simulated)
│   └── [tool] extract_key_findings(sources)
└── Writer Agent
    ├── [llm]  generate_outline (simulated)
    ├── [llm]  write_draft (simulated)
    └── [tool] format_markdown(draft)
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

You should see console output showing each agent step. Then open http://localhost:3000 to view the trace.

## Customization

**Use a real LLM:** Replace the `_mock_llm_call()` function in `main.py` with actual OpenAI/Anthropic calls. Install the provider (`pip install openai`) and add `agentq.instrument()` after `agentq.init()` to get automatic LLM tracing.

**Change the endpoint:** Set the `AGENTQ_ENDPOINT` environment variable or edit the `agentq.init()` call in `main.py`:

```bash
AGENTQ_ENDPOINT=https://your-server.com python main.py
```
