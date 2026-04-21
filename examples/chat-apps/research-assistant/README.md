# Research Assistant — Sequential Pipeline Pattern

A research assistant that processes questions through a sequential agent pipeline. Demonstrates **linear trace chain** topology where each agent hands off to the next in a fixed order.

## Architecture

```
User Question
     │
     ▼
┌────────────┐     ┌────────────┐     ┌────────────┐
│ Researcher │ ──▶ │  Analyzer  │ ──▶ │   Writer   │
│   Agent    │     │   Agent    │     │   Agent    │
│            │     │            │     │            │
│ Gathers    │     │ Identifies │     │ Composes   │
│ sources    │     │ key themes │     │ the answer │
└────────────┘     └────────────┘     └────────────┘
                                           │
                                           ▼
                                     Final Response
```

Each agent appears as a sequential child span in the AgentQ trace, forming a clear pipeline chain.

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

- **"What are the benefits of microservices?"** → Researches, analyzes trends, writes a summary
- **"Explain quantum computing"** → Gathers sources, extracts key concepts, synthesizes
- **"How does machine learning work?"** → Full pipeline with research, analysis, and writing
- Any open-ended research question!

Use the **"Show agent steps"** expander to see the intermediate output from each agent in the pipeline.

## Trace Topology

```
session (conversation)
  └── pipeline-orchestrator
        ├── researcher-agent
        │     ├── web-search (tool)
        │     └── summarize-sources (LLM)
        ├── analyzer-agent
        │     ├── extract-themes (LLM)
        │     └── assess-confidence (tool)
        └── writer-agent
              ├── plan-response (LLM)
              └── compose-answer (LLM)
```
