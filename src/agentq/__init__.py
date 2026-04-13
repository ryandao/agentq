"""
AgentQ SDK — Agent observability and orchestration with framework auto-detection.

Supports popular agent frameworks out of the box:
- LangChain / LangGraph
- CrewAI
- AutoGen
- LlamaIndex
- OpenAI Agents SDK

Usage:
    import agentq

    # Auto-detection activates on import when a supported framework is present.
    # You can also explicitly initialize:
    agentq.init()

    # Or use the decorator for custom agents:
    @agentq.agent
    def my_agent():
        ...
"""

from agentq.core import AgentQContext, init, shutdown, get_context
from agentq.decorator import agent
from agentq.autodetect import detect_frameworks, get_supported_frameworks

__all__ = [
    "init",
    "shutdown",
    "get_context",
    "agent",
    "detect_frameworks",
    "get_supported_frameworks",
    "AgentQContext",
]

__version__ = "0.1.0"
