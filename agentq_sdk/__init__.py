"""AgentQ SDK - Native framework integration for popular agent frameworks.

Provides seamless auto-detection and integration with LangChain, CrewAI,
AutoGen, and LlamaIndex without requiring the @agent decorator.
"""

from agentq_sdk.core import AgentQ, auto_integrate
from agentq_sdk.detection import FrameworkDetector
from agentq_sdk.registry import AdapterRegistry

__version__ = "0.1.0"

__all__ = [
    "AgentQ",
    "auto_integrate",
    "FrameworkDetector",
    "AdapterRegistry",
]
