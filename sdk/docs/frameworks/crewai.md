# CrewAI Integration

AgentQ auto-instruments CrewAI so all crew executions are traced — **no `@agent` decorator required**.

## Setup

```bash
pip install agentq crewai
```

```python
import agentq

agentq.init(endpoint="http://localhost:3000")
agentq.instrument()  # Patches CrewAI automatically

from crewai import Agent, Task, Crew

researcher = Agent(role="Researcher", goal="Find info", backstory="Expert")
task = Task(description="Research AI trends", agent=researcher)
crew = Crew(agents=[researcher], tasks=[task])

result = crew.kickoff()  # Automatically traced!
```

## What Gets Traced

- **`Crew.kickoff()`** — every crew execution creates a span

## Span Attributes

| Attribute | Description |
|-----------|-------------|
| `agentq.run_type` | `agent` |
| `agentq.framework` | `crewai` |
| `agentq.crewai.crew_name` | Name of the crew |
| `agentq.crewai.agent_roles` | List of agent roles in the crew |

## Combining with `@agent`

```python
@agentq.agent(name="research-pipeline")
def run_research(topic: str):
    crew = build_research_crew(topic)
    return crew.kickoff()  # CrewAI span nested under agent span
```
