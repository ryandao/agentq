# CrewAI Multi-Agent Example

A marketing campaign crew demonstrating CrewAI's collaboration patterns, traced by AgentQ. Three specialist agents — a **Market Analyst**, **Content Strategist**, and **Copywriter** — work sequentially, with each agent's output feeding the next.

## What It Demonstrates

- **CrewAI crew pattern:** Sequential task execution where agents pass context forward — the same pattern CrewAI's `Crew(process=Process.sequential)` uses.
- **Agent-to-agent delegation:** The crew orchestrator delegates to specialist agents, creating a parent-child span hierarchy in the trace.
- **`@agent` decorator:** Each crew member is instrumented with `@agentq.agent()` for automatic tracing.
- **Tool calls:** Agents use `agentq.track_tool()` for market data search, competitor analysis, audience segmentation, SEO optimization, and more.
- **LLM calls:** Simulated LLM calls traced via `agentq.track_llm()` for analysis synthesis, strategy development, and copywriting.
- **Framework auto-detection:** `agentq.instrument()` auto-detects CrewAI if installed and wraps `Crew.kickoff()` and `Agent.execute_task()`.
- **Mock responses:** No API keys needed — LLM responses are simulated so the example works out of the box.

## Architecture

```
Marketing Crew (sequential process)
├── Market Analyst
│   ├── [tool] market_data_search("AI observability market trends")
│   ├── [tool] competitor_analysis(top_players)
│   └── [llm]  synthesize-analysis (simulated)
├── Content Strategist
│   ├── [tool] audience_segmentation(market_segments)
│   ├── [llm]  develop-strategy (simulated)
│   └── [tool] channel_prioritization(audiences)
└── Copywriter
    ├── [llm]  draft-copy (simulated)
    ├── [tool] seo_optimize(draft, keywords)
    └── [tool] format_final(content)
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

You should see console output showing each crew member executing their task. Then open http://localhost:3000 to view the trace — you'll see the marketing-crew span with nested analyst, strategist, and copywriter spans, each containing their tool and LLM calls.

## Using Real CrewAI

This example works in **mock mode** by default (no API keys required). To use it with real CrewAI:

1. Install CrewAI: `pip install crewai`
2. Set your LLM API key: `export OPENAI_API_KEY=sk-...`
3. Run `python main.py` — `agentq.instrument()` auto-detects CrewAI and wraps `Crew.kickoff()` and `Agent.execute_task()` with traced spans.

With real CrewAI, the auto-instrumentation captures the full execution hierarchy automatically — no decorator changes needed.

## Customization

**Change the endpoint:** Set the `AGENTQ_ENDPOINT` environment variable:

```bash
AGENTQ_ENDPOINT=https://your-server.com python main.py
```

**Swap in real LLM calls:** Replace `_mock_llm_call()` with actual OpenAI/Anthropic calls. Install the provider and ensure `agentq.instrument()` is called to get automatic LLM tracing.
