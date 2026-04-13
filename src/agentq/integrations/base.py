"""
Base class for all framework integrations.
"""

from __future__ import annotations

import abc
import logging
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from agentq.core import AgentQContext

logger = logging.getLogger("agentq")


class FrameworkIntegration(abc.ABC):
    """
    Abstract base class for a framework integration.

    Subclasses must implement `activate` and `deactivate`.
    Activation should install hooks/callbacks/patches so that agent runs
    in the target framework are automatically tracked by AgentQ.
    """

    framework_name: str = "unknown"

    def __init__(self) -> None:
        self._context: AgentQContext | None = None
        self._active = False

    @property
    def active(self) -> bool:
        return self._active

    @property
    def context(self) -> AgentQContext:
        if self._context is None:
            raise RuntimeError(
                f"Integration {self.framework_name} used before activation"
            )
        return self._context

    def activate(self, context: AgentQContext) -> None:
        """
        Activate the integration.

        This is called by AgentQContext during init. The integration should
        install whatever hooks are needed to auto-track agent runs.
        """
        if self._active:
            return
        self._context = context
        self._install_hooks()
        self._active = True
        logger.info("Integration activated: %s", self.framework_name)

    def deactivate(self) -> None:
        """
        Deactivate the integration and remove all hooks.
        """
        if not self._active:
            return
        self._remove_hooks()
        self._active = False
        self._context = None
        logger.info("Integration deactivated: %s", self.framework_name)

    @abc.abstractmethod
    def _install_hooks(self) -> None:
        """Install framework-specific hooks. Implemented by subclasses."""
        ...

    @abc.abstractmethod
    def _remove_hooks(self) -> None:
        """Remove framework-specific hooks. Implemented by subclasses."""
        ...
