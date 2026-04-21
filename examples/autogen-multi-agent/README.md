# AutoGen Multi-Agent Example

A software development team using AutoGen-style multi-agent conversation patterns, traced by AgentQ. An **Architect**, **Developer**, and **Reviewer** take turns in a structured conversation — designing, implementing, reviewing, and iterating on a system.

## What It Demonstrates

- **AutoGen conversation pattern:** Turn-based multi-agent dialogue where each agent responds to the previous agent's output — the same pattern AutoGen's `initiate_chat()` uses.
- **Multi-round iteration:** The conversation includes a review cycle: Developer submits code → Reviewer requests changes → Developer fixes → Reviewer approves. This mirrors real AutoGen workflows with `max_consecutive_auto_reply`.
- **Agent-to-agent delegation:** Each agent turn creates a child span in the trace, showing the conversation flow.
- **`@agent` decorator:** Each team member is instrumented with `@agentq.agent()` for automatic tracing.
- **Tool calls:** Agents use `agentq.track_tool()` for requirements analysis, test execution, static analysis, and code quality checks.
- **LLM calls:** Simulated LLM calls traced via `agentq.track_llm()` for architecture design, code generation, and code review.
- **Framework auto-detection:** `agentq.instrument()` auto-detects AutoGen if installed and wraps `generate_reply()` and `initiate_chat()`.
- **Mock responses:** No API keys needed — LLM responses are simulated so the example works out of the box.

## Architecture

```
Dev Team Conversation (5 turns)
├── Turn 1 — Architect (initial design)
│   ├── [tool] analyze_requirements
│   ├── [tool] create_architecture_diagram
│   └── [llm]  architect-design
├── Turn 2 — Developer (implementation)
│   ├── [llm]  developer-implement
│   ├── [tool] run_tests (12/12 passing)
│   └── [tool] static_analysis
├── Turn 3 — Reviewer (code review)
│   ├── [tool] code_quality_check
│   └── [llm]  reviewer-review → requests changes
├── Turn 4 — Developer (address feedback)
│   ├── [llm]  developer-fix
│   └── [tool] run_tests (15/15 passing)
└── Turn 5 — Reviewer (final review)
    └── [llm]  reviewer-final → approved ✅
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

You should see console output showing each agent taking turns in the conversation. Then open http://localhost:3000 to view the trace — you'll see the `dev-team-conversation` span with nested architect, developer, and reviewer turns, each containing their tool and LLM calls.

## Using Real AutoGen

This example works in **mock mode** by default (no API keys required). To use it with real AutoGen:

1. Install AutoGen: `pip install pyautogen`
2. Set your LLM API key: `export OPENAI_API_KEY=sk-...`
3. Run `python main.py` — `agentq.instrument()` auto-detects AutoGen and wraps `ConversableAgent.generate_reply()` and `initiate_chat()` with traced spans.

With real AutoGen, the auto-instrumentation captures every agent reply and message exchange automatically — no decorator changes needed.

## Customization

**Change the endpoint:** Set the `AGENTQ_ENDPOINT` environment variable:

```bash
AGENTQ_ENDPOINT=https://your-server.com python main.py
```

**Swap in real LLM calls:** Replace `_mock_llm_call()` with actual OpenAI/Anthropic calls. Install the provider and ensure `agentq.instrument()` is called to get automatic LLM tracing.

**Adjust the conversation:** Modify `dev_team_conversation()` to add more turns, different agents, or group chat patterns (AutoGen's `GroupChat` equivalent).
