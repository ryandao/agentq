"""
Framework auto-detection engine.

Scans for installed agent frameworks and returns integration objects
that can hook into each framework's lifecycle without requiring the
@agent decorator.
"""

from __future__ import annotations

import importlib
import logging
from typing import Any

from agentq.autodetect.registry import FrameworkRegistry, FrameworkInfo

logger = logging.getLogger("agentq")

# Central registry of known frameworks and their detection logic.
_registry = FrameworkRegistry()


def _register_builtin_frameworks() -> None:
    """Register all built-in framework integrations."""
    _registry.register(
        FrameworkInfo(
            name="langchain",
            display_name="LangChain / LangGraph",
            detect_packages=["langchain", "langchain_core", "langgraph"],
            integration_module="agentq.integrations.langchain_integration",
            integration_class="LangChainIntegration",
        )
    )
    _registry.register(
        FrameworkInfo(
            name="crewai",
            display_name="CrewAI",
            detect_packages=["crewai"],
            integration_module="agentq.integrations.crewai_integration",
            integration_class="CrewAIIntegration",
        )
    )
    _registry.register(
        FrameworkInfo(
            name="autogen",
            display_name="AutoGen",
            detect_packages=["autogen", "pyautogen"],
            integration_module="agentq.integrations.autogen_integration",
            integration_class="AutoGenIntegration",
        )
    )
    _registry.register(
        FrameworkInfo(
            name="llamaindex",
            display_name="LlamaIndex",
            detect_packages=["llama_index"],
            integration_module="agentq.integrations.llamaindex_integration",
            integration_class="LlamaIndexIntegration",
        )
    )
    _registry.register(
        FrameworkInfo(
            name="openai_agents",
            display_name="OpenAI Agents SDK",
            detect_packages=["agents"],
            integration_module="agentq.integrations.openai_agents_integration",
            integration_class="OpenAIAgentsIntegration",
        )
    )


# Register on module load
_register_builtin_frameworks()


def detect_frameworks() -> dict[str, Any]:
    """
    Detect installed agent frameworks and return their integration objects.

    Returns:
        A dict mapping framework name -> instantiated integration object
        for each framework that was detected as installed.
    """
    detected: dict[str, Any] = {}

    for info in _registry.all():
        if not info.is_installed():
            continue

        logger.debug("Detected framework: %s", info.display_name)
        try:
            mod = importlib.import_module(info.integration_module)
            cls = getattr(mod, info.integration_class)
            detected[info.name] = cls()
        except Exception as exc:
            logger.warning(
                "Framework %s detected but integration failed to load: %s",
                info.display_name,
                exc,
            )

    return detected


def get_supported_frameworks() -> list[dict[str, Any]]:
    """
    Return metadata about all supported frameworks.

    This is useful for documentation, CLI tooling, and diagnostics.
    """
    result = []
    for info in _registry.all():
        result.append(
            {
                "name": info.name,
                "display_name": info.display_name,
                "detect_packages": info.detect_packages,
                "installed": info.is_installed(),
            }
        )
    return result


def register_framework(info: FrameworkInfo) -> None:
    """
    Register a custom framework integration.

    Third-party framework authors can call this to register their
    framework so AgentQ auto-detects it.
    """
    _registry.register(info)
