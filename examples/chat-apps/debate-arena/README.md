# Debate Arena — Collaborative / Discussion Pattern

Multiple expert agents debate a user's topic in rounds, then a Moderator synthesizes a balanced conclusion. Demonstrates **multi-round collaborative traces** — multiple agent spans with back-and-forth interactions.

## Architecture

```
User (poses topic)
       │
       ▼
┌──────────────────┐
│ Debate            │
│ Orchestrator      │
└──────┬───────────┘
       │
  ┌────┴───── Round 1 ─────────────────┐
  │                                     │
  │  🌟 Optimist → 🔍 Skeptic → ⚖️ Pragmatist
  │                                     │
  ├────────── Round 2 ─────────────────┤
  │                                     │
  │  🌟 Optimist → 🔍 Skeptic → ⚖️ Pragmatist
  │                                     │
  └─────────────────────────────────────┘
       │
       ▼
┌──────────────────┐
│ 🏛️ Moderator     │  ← Synthesizes balanced conclusion
└──────────────────┘
```

Each agent contribution appears as a span in the AgentQ trace, showing the multi-round collaborative flow.

## Run

```bash
# Create a virtual environment
python -m venv .venv && source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Start the app
streamlit run main.py
```

Then open `http://localhost:3000` to see traces in the AgentQ dashboard.

## What to Try

- **"Will AI replace most jobs?"** → Rich debate with AI-specific arguments from all three experts
- **"Is remote work better than office work?"** → Balanced debate on the future of work
- **"Is cryptocurrency the future of finance?"** → Sharply divided debate with strong arguments
- **"Can we solve climate change with technology?"** → Nuanced debate with surprising areas of consensus

Watch the AgentQ dashboard — each debate creates a multi-round trace showing all expert contributions and the moderator's synthesis.

## Trace Topology

```
session (conversation)
  └── debate-orchestrator
        ├── optimist-agent (Round 1)
        │     ├── research-positive-evidence (tool)
        │     └── generate-optimist-view (LLM call)
        ├── skeptic-agent (Round 1)
        │     ├── research-counterarguments (tool)
        │     └── generate-skeptic-view (LLM call)
        ├── pragmatist-agent (Round 1)
        │     ├── analyze-perspectives (tool)
        │     └── generate-pragmatist-view (LLM call)
        ├── optimist-agent (Round 2)
        │     └── ...
        ├── skeptic-agent (Round 2)
        │     └── ...
        ├── pragmatist-agent (Round 2)
        │     └── ...
        └── moderator-agent
              ├── tally-debate (tool)
              └── synthesize-conclusion (LLM call)
```
