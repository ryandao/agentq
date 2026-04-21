# Support Bot — Router / Dispatcher Pattern

A customer support chatbot that routes questions to specialist agents. Demonstrates **branching trace topology** where one parent span fans out to different child agent spans.

## Architecture

```
User Question
     │
     ▼
┌──────────┐
│ Router   │  ← Analyzes the question and picks a specialist
│ Agent    │
└────┬─────┘
     │
     ├──────────────┬──────────────┐
     ▼              ▼              ▼
┌─────────┐  ┌───────────┐  ┌──────────┐
│ Billing │  │ Technical │  │ General  │
│ Agent   │  │ Support   │  │ FAQ      │
│         │  │ Agent     │  │ Agent    │
└─────────┘  └───────────┘  └──────────┘
```

Each agent appears as a child span in the AgentQ trace, showing the routing decision and the specialist's response.

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

- **"How much does the pro plan cost?"** → Routes to Billing Agent
- **"My API keeps returning 500 errors"** → Routes to Technical Support Agent
- **"What is AgentQ?"** → Routes to General FAQ Agent
- **"I need a refund for my last invoice"** → Routes to Billing Agent
- **"How do I configure webhooks?"** → Routes to Technical Support Agent

Watch the AgentQ dashboard — each conversation creates a trace showing the router's decision and the specialist agent's work.

## Trace Topology

```
session (conversation)
  └── router-agent
        ├── classify-question (LLM call)
        └── billing-agent / tech-support-agent / faq-agent
              └── generate-response (LLM call)
```
