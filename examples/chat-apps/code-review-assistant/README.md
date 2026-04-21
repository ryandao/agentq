# Code Review Assistant — Hierarchical Delegation Pattern

A code review assistant where a Manager agent breaks the review into subtasks and delegates to specialist reviewers. Demonstrates **hierarchical trace tree** — a manager span with parallel child worker spans.

## Architecture

```
User (pastes code)
       │
       ▼
┌──────────────┐
│   Manager    │  ← Plans review, delegates, assembles report
│   Agent      │
└──────┬───────┘
       │
       ├──────────────────┬──────────────────┐
       ▼                  ▼                  ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│  🔒 Security │  │  🎨 Style    │  │  🧠 Logic    │
│  Reviewer    │  │  Reviewer    │  │  Reviewer    │
└──────────────┘  └──────────────┘  └──────────────┘
       │                  │                  │
       └──────────────────┴──────────────────┘
                          │
                          ▼
                ┌──────────────────┐
                │ Consolidated     │
                │ Review Report    │
                └──────────────────┘
```

Each reviewer appears as a child span under the Manager in the AgentQ trace, showing the delegation hierarchy.

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

- **Paste code with `password = 'secret123'`** → Security Reviewer flags hardcoded secrets
- **Paste code with `eval(user_input)`** → Security Reviewer flags code injection risk
- **Paste code with SQL queries** → Security Reviewer flags SQL injection risk
- **Paste any Python function** → Gets comprehensive style and logic feedback
- **Paste code with `try/except` blocks** → Logic Reviewer analyzes error handling

Watch the AgentQ dashboard — each review creates a hierarchical trace showing the Manager delegating to specialist reviewers.

## Trace Topology

```
session (conversation)
  └── review-manager
        ├── plan-review-tasks (LLM call)
        ├── security-reviewer
        │     ├── vulnerability-scan (tool call)
        │     └── generate-security-review (LLM call)
        ├── style-reviewer
        │     ├── style-lint (tool call)
        │     └── generate-style-review (LLM call)
        ├── logic-reviewer
        │     ├── complexity-analysis (tool call)
        │     └── generate-logic-review (LLM call)
        └── assemble-report (LLM call)
```
