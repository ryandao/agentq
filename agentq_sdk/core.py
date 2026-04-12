"""Core AgentQ integration module.

Provides the main ``AgentQ`` class and the convenience ``auto_integrate``
function that detects installed frameworks and patches them automatically.
"""

from __future__ import annotations

import logging
from typing import Any, Optional

from agentq_sdk.adapters.base import BaseAdapter, EventHandler
from agentq_sdk.detection import Framework, FrameworkDetector
from agentq_sdk.registry import AdapterRegistry

logger = logging.getLogger(__name__)


def _register_builtin_adapters(registry: AdapterRegistry) -> None:
    """Register the built-in adapters for all supported frameworks.

    Each import is guarded so a missing framework doesn't break the SDK.
    """
    from agentq_sdk.adapters.langchain import LangChainAdapter
    from agentq_sdk.adapters.crewai import CrewAIAdapter
    from agentq_sdk.adapters.autogen import AutoGenAdapter
    from agentq_sdk.adapters.llamaindex import LlamaIndexAdapter

    registry.register(Framework.LANGCHAIN, LangChainAdapter)
    registry.register(Framework.CREWAI, CrewAIAdapter)
    registry.register(Framework.AUTOGEN, AutoGenAdapter)
    registry.register(Framework.LLAMAINDEX, LlamaIndexAdapter)


class AgentQ:
    """Main entry point for AgentQ SDK integration.

    Orchestrates framework detection, adapter resolution, and lifecycle
    management.  Designed to be used as a context manager or via explicit
    ``activate`` / ``deactivate`` calls.

    Usage — context manager::

        with AgentQ() as aq:
            # All detected frameworks are patched automatically.
            agent = AgentExecutor(...)  # LangChain
            result = agent.invoke({"input": "Hello"})

    Usage — explicit::

        aq = AgentQ()
        aq.activate()
        ...
        aq.deactivate()

    Usage — specific frameworks only::

        aq = AgentQ(frameworks=[Framework.LANGCHAIN, Framework.CREWAI])
        aq.activate()
    """

    def __init__(
        self,
        frameworks: Optional[list[Framework]] = None,
        auto_detect: bool = True,
        event_handler: Optional[EventHandler] = None,
    ) -> None:
        self._detector = FrameworkDetector()
        self._registry = AdapterRegistry()
        self._requested_frameworks = frameworks
        self._auto_detect = auto_detect
        self._event_handler = event_handler
        self._active_adapters: list[BaseAdapter] = []
        self._activated = False

        # Ensure built-in adapters are registered
        _register_builtin_adapters(self._registry)

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def activate(self) -> "AgentQ":
        """Detect frameworks and patch them."""
        if self._activated:
            logger.warning("AgentQ is already activated")
            return self

        frameworks = self._resolve_frameworks()
        logger.info(
            "Activating AgentQ for frameworks: %s",
            [fw.value for fw in frameworks],
        )

        for fw in frameworks:
            adapter = self._registry.get(fw)
            if adapter is None:
                logger.warning("No adapter for %s — skipping", fw.value)
                continue
            if self._event_handler:
                adapter.on_event(self._event_handler)
            try:
                adapter.patch()
                self._active_adapters.append(adapter)
                logger.info("Patched %s via %s", fw.value, type(adapter).__name__)
            except Exception:
                logger.exception("Failed to patch %s", fw.value)

        self._activated = True
        return self

    def deactivate(self) -> None:
        """Unpatch all active adapters."""
        if not self._activated:
            return
        for adapter in reversed(self._active_adapters):
            try:
                adapter.unpatch()
            except Exception:
                logger.exception("Error unpatching %s", type(adapter).__name__)
        self._active_adapters.clear()
        self._activated = False
        logger.info("AgentQ deactivated")

    def wrap(self, agent: Any, agent_id: Optional[str] = None) -> Any:
        """Manually wrap an agent instance.

        Useful when you want to integrate an agent that wasn't caught by
        automatic patching (e.g. a dynamically constructed agent).
        """
        for adapter in self._active_adapters:
            try:
                return adapter.wrap_agent(agent, agent_id=agent_id)
            except TypeError:
                continue
        logger.warning("No adapter could wrap agent of type %s", type(agent).__name__)
        return agent

    @property
    def is_active(self) -> bool:
        return self._activated

    @property
    def active_frameworks(self) -> list[Framework]:
        """Frameworks that are currently patched."""
        return [
            fw
            for fw in Framework
            if any(
                isinstance(a, type(self._registry.get(fw)))
                for a in self._active_adapters
                if self._registry.get(fw) is not None
            )
        ]

    # ------------------------------------------------------------------
    # Context manager
    # ------------------------------------------------------------------

    def __enter__(self) -> "AgentQ":
        return self.activate()

    def __exit__(self, *exc: Any) -> None:
        self.deactivate()

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

    def _resolve_frameworks(self) -> list[Framework]:
        """Determine which frameworks to activate."""
        if self._requested_frameworks is not None:
            return self._requested_frameworks

        if self._auto_detect:
            installed = self._detector.get_installed_frameworks()
            if installed:
                return installed
            logger.info("No supported frameworks detected")
            return []

        return list(Framework)


def auto_integrate(
    frameworks: Optional[list[Framework]] = None,
    event_handler: Optional[EventHandler] = None,
) -> AgentQ:
    """One-liner to activate AgentQ integration.

    This is the simplest way to use the SDK:

        import agentq_sdk
        agentq_sdk.auto_integrate()

    From this point on, any supported framework agent will be
    automatically instrumented.
    """
    aq = AgentQ(frameworks=frameworks, event_handler=event_handler)
    return aq.activate()
