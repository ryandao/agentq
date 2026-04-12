"""Framework adapters for AgentQ SDK.

Each adapter provides the glue between a specific agent framework and
AgentQ's telemetry, lifecycle, and orchestration capabilities.
"""

from agentq_sdk.adapters.base import BaseAdapter
from agentq_sdk.adapters.langchain import LangChainAdapter
from agentq_sdk.adapters.crewai import CrewAIAdapter
from agentq_sdk.adapters.autogen import AutoGenAdapter
from agentq_sdk.adapters.llamaindex import LlamaIndexAdapter

__all__ = [
    "BaseAdapter",
    "LangChainAdapter",
    "CrewAIAdapter",
    "AutoGenAdapter",
    "LlamaIndexAdapter",
]
