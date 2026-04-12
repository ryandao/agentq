"""Adapter registry — maps frameworks to their adapter implementations.

The registry provides a central lookup for framework adapters, allowing
AgentQ to resolve the correct adapter for a detected framework.
"""

from __future__ import annotations

import logging
from typing import Optional, Type

from agentq_sdk.adapters.base import BaseAdapter
from agentq_sdk.detection import Framework

logger = logging.getLogger(__name__)


class AdapterRegistry:
    """Singleton registry that maps Framework enum values to adapter classes.

    Usage:
        registry = AdapterRegistry()
        registry.register(Framework.LANGCHAIN, LangChainAdapter)
        adapter = registry.get(Framework.LANGCHAIN)
    """

    _instance: Optional["AdapterRegistry"] = None

    def __new__(cls) -> "AdapterRegistry":
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._adapters = {}
            cls._instance._instances = {}
        return cls._instance

    @classmethod
    def reset(cls) -> None:
        """Reset the singleton (primarily for testing)."""
        cls._instance = None

    def register(self, framework: Framework, adapter_cls: Type[BaseAdapter]) -> None:
        """Register an adapter class for a framework."""
        if not issubclass(adapter_cls, BaseAdapter):
            raise TypeError(
                f"Adapter must be a subclass of BaseAdapter, got {adapter_cls}"
            )
        self._adapters[framework] = adapter_cls
        logger.debug("Registered adapter %s for %s", adapter_cls.__name__, framework.value)

    def get(self, framework: Framework) -> Optional[BaseAdapter]:
        """Get or create an adapter instance for a framework.

        Returns the same instance on repeated calls (adapters are singletons
        within the registry).
        """
        if framework in self._instances:
            return self._instances[framework]

        adapter_cls = self._adapters.get(framework)
        if adapter_cls is None:
            logger.warning("No adapter registered for %s", framework.value)
            return None

        instance = adapter_cls()
        self._instances[framework] = instance
        return instance

    def get_class(self, framework: Framework) -> Optional[Type[BaseAdapter]]:
        """Get the adapter class (not instance) for a framework."""
        return self._adapters.get(framework)

    def has(self, framework: Framework) -> bool:
        """Check if an adapter is registered for a framework."""
        return framework in self._adapters

    @property
    def registered_frameworks(self) -> list[Framework]:
        """List all frameworks with registered adapters."""
        return list(self._adapters.keys())

    def clear(self) -> None:
        """Remove all registrations and instances."""
        # Unpatch any active adapters
        for instance in self._instances.values():
            if instance.is_patched:
                try:
                    instance.unpatch()
                except Exception:
                    logger.exception("Error unpatching adapter %s", type(instance).__name__)
        self._adapters.clear()
        self._instances.clear()
