"""
Framework integration implementations.

Each integration module provides a class that:
1. Hooks into the framework's lifecycle (callbacks, events, monkey-patching)
2. Creates AgentRun objects and tracks them through the AgentQ context
3. Can be activated/deactivated cleanly

Supported frameworks:
- LangChain / LangGraph  → LangChainIntegration
- CrewAI                  → CrewAIIntegration
- AutoGen                 → AutoGenIntegration
- LlamaIndex              → LlamaIndexIntegration
- OpenAI Agents SDK       → OpenAIAgentsIntegration
"""

from agentq.integrations.base import FrameworkIntegration

__all__ = [
    "FrameworkIntegration",
]
