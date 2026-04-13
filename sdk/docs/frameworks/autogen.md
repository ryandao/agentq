# AutoGen Integration

AgentQ auto-instruments Microsoft AutoGen so all agent reply generations are traced — **no `@agent` decorator required**.

## Setup

```bash
pip install agentq pyautogen
```

```python
import agentq

agentq.init(endpoint="http://localhost:3000")
agentq.instrument()  # Patches AutoGen automatically

from autogen import AssistantAgent, UserProxyAgent

assistant = AssistantAgent("assistant", llm_config={"model": "gpt-4"})
user = UserProxyAgent("user")

# generate_reply calls are automatically traced
reply = assistant.generate_reply(messages=[{"role": "user", "content": "Hello"}])
```

## What Gets Traced

- **`ConversableAgent.generate_reply()`** — every reply generation creates a span
- Applies to all subclasses: `AssistantAgent`, `UserProxyAgent`, etc.

## Span Attributes

| Attribute | Description |
|-----------|-------------|
| `agentq.run_type` | `agent` |
| `agentq.framework` | `autogen` |
| `agentq.autogen.agent_name` | Name of the AutoGen agent |
| `agentq.autogen.agent_type` | Class name (e.g., AssistantAgent) |

## Combining with `@agent`

```python
@agentq.agent(name="multi-agent-chat")
def run_conversation(prompt: str):
    assistant.generate_reply(messages=[{"role": "user", "content": prompt}])
```
