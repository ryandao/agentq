# Code Review Assistant — Hierarchical Delegation Pattern

A code review assistant where a Manager agent delegates to specialist reviewer agents. Demonstrates **hierarchical parent-child trace topology** — the Manager is the parent span, each reviewer is a child span with its own tool + LLM sub-spans.

## Architecture

```
User Pastes Code
       │
       ▼
┌──────────────┐
│   Manager    │  ← Orchestrates the review, consolidates findings
│   Agent      │
└──┬───┬───┬───┘
   │   │   │
   ▼   ▼   ▼
┌────┐┌────┐┌────┐
│ 🔒 ││ 🎨 ││ 🧠 │
│Sec.││Sty.││Log.│
│Rev.││Rev.││Rev.│
└────┘└────┘└────┘
   │   │   │
   └───┼───┘
       ▼
  Consolidated
    Report
```

Each reviewer runs its own static analysis tools and LLM-based code inspection, all appearing as child spans under the Manager in AgentQ traces.

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

- **Code with `eval()` or SQL queries** → Security reviewer flags injection/execution risks
- **Code with hardcoded passwords** → Security reviewer flags credential exposure
- **Code with classes or complex imports** → Style reviewer provides specific guidance
- **Code with nested if/else** → Logic reviewer flags conditional complexity
- **Code with loops** → Logic reviewer analyzes efficiency and termination
- **Any Python code** → All three reviewers provide a general review

Use the **"Show individual reviewer reports"** expander to see each specialist's detailed findings alongside their tool outputs.

## Trace Topology

```
session (conversation)
  └── manager-agent
        ├── security-reviewer
        │     ├── static-analysis-scan (tool)
        │     └── analyze-security (LLM)
        ├── style-reviewer
        │     ├── lint-check (tool)
        │     └── analyze-style (LLM)
        ├── logic-reviewer
        │     ├── complexity-analysis (tool)
        │     └── analyze-logic (LLM)
        └── synthesize-report (LLM)
```
