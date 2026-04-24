# Debate Arena — Collaborative Multi-Round Pattern

Multiple expert agents debate a user's topic across multiple rounds with **context accumulation**, then a Moderator synthesizes a balanced conclusion. Demonstrates **collaborative multi-agent traces** — each round's agents receive and build upon prior arguments, producing distinct Round 1 (opening positions) and Round 2 (rebuttals) responses visible in AgentQ.

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
  ┌────┴───── Round 1 (Opening Positions) ──────┐
  │                                              │
  │  🌟 Optimist → 🔍 Skeptic → ⚖️ Pragmatist    │
  │       │              │             │          │
  │       └──── context accumulates ───┘          │
  │                                              │
  ├────────── Round 2 (Rebuttals) ──────────────┤
  │                                              │
  │  🌟 Optimist → 🔍 Skeptic → ⚖️ Pragmatist    │
  │  (responds to    (responds to   (refines     │
  │   R1 Skeptic)     R1 Optimist)   position)   │
  │                                              │
  └──────────────────────────────────────────────┘
       │
       ▼
┌──────────────────┐
│ 🏛️ Moderator     │  ← Synthesizes balanced conclusion
└──────────────────┘       referencing both rounds
```

**Key feature:** Round 2 responses are *different* from Round 1 — each speaker references and rebuts arguments from the prior round, demonstrating real context accumulation across the multi-agent trace.

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

- **"Will AI replace most jobs?"** → Rich debate: Optimist's ATM analogy meets Skeptic's "cognition is different" rebuttal
- **"Is remote work better than office work?"** → Balanced debate converging on structured hybrid by Round 2
- **"Is cryptocurrency the future of finance?"** → Sharpest disagreement, with Pragmatist refining stablecoin focus in Round 2
- **"Can we solve climate change with technology?"** → Surprising convergence on nuclear + renewables + storage by Round 2

Watch the AgentQ dashboard — each debate creates a multi-round trace showing how speakers' arguments evolve across rounds.

## Trace Topology

```
session (conversation)
  └── debate-orchestrator
        ├── optimist-agent (Round 1)       ← Opening position
        │     ├── research-optimist-evidence (tool)
        │     └── generate-optimist-view (LLM call)
        ├── skeptic-agent (Round 1)        ← Opening position
        │     ├── research-skeptic-evidence (tool)
        │     └── generate-skeptic-view (LLM call)
        ├── pragmatist-agent (Round 1)     ← Opening position
        │     ├── research-pragmatist-evidence (tool)
        │     └── generate-pragmatist-view (LLM call)
        ├── optimist-agent (Round 2)       ← Rebuttal (references R1 Skeptic)
        │     ├── research-optimist-evidence (tool)
        │     └── generate-optimist-view (LLM call)
        ├── skeptic-agent (Round 2)        ← Rebuttal (references R1 Optimist)
        │     ├── research-skeptic-evidence (tool)
        │     └── generate-skeptic-view (LLM call)
        ├── pragmatist-agent (Round 2)     ← Refined position
        │     ├── research-pragmatist-evidence (tool)
        │     └── generate-pragmatist-view (LLM call)
        └── moderator-agent                ← References arguments from both rounds
              ├── tally-debate (tool)
              └── synthesize-conclusion (LLM call)
```

Each agent span's input includes the accumulated context length and preview, allowing you to see how context grows through the debate.
