"""Base adapter interface for framework integration.

All framework-specific adapters inherit from BaseAdapter and implement
the hooks that AgentQ uses to observe and orchestrate agent execution.
"""

from __future__ import annotations

import logging
import time
import uuid
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Callable, Optional

logger = logging.getLogger(__name__)


class AgentEvent(Enum):
    """Lifecycle events emitted during agent execution."""

    AGENT_START = "agent_start"
    AGENT_END = "agent_end"
    AGENT_ERROR = "agent_error"
    STEP_START = "step_start"
    STEP_END = "step_end"
    TOOL_CALL = "tool_call"
    TOOL_RESULT = "tool_result"
    LLM_START = "llm_start"
    LLM_END = "llm_end"


@dataclass
class EventPayload:
    """Payload attached to agent lifecycle events."""

    event: AgentEvent
    agent_id: str
    run_id: str
    timestamp: float = field(default_factory=time.time)
    data: dict[str, Any] = field(default_factory=dict)
    parent_run_id: Optional[str] = None


EventHandler = Callable[[EventPayload], None]


class BaseAdapter(ABC):
    """Abstract base class for framework adapters.

    Subclasses must implement:
    - `patch()` — monkey-patch or hook into the framework to intercept lifecycle events.
    - `unpatch()` — revert any modifications made by `patch()`.
    - `wrap_agent()` — wrap a single agent instance for AgentQ integration.

    The adapter pattern ensures that user code doesn't need the @agent
    decorator. Instead, the adapter intercepts framework internals to
    provide the same telemetry, logging, and orchestration support.
    """

    def __init__(self) -> None:
        self._patched: bool = False
        self._event_handlers: list[EventHandler] = []
        self._wrapped_agents: dict[str, Any] = {}

    @property
    def is_patched(self) -> bool:
        return self._patched

    def on_event(self, handler: EventHandler) -> None:
        """Register a handler for agent lifecycle events."""
        self._event_handlers.append(handler)

    def emit_event(self, event: AgentEvent, agent_id: str, run_id: str, **data: Any) -> None:
        """Emit an event to all registered handlers."""
        payload = EventPayload(
            event=event,
            agent_id=agent_id,
            run_id=run_id,
            data=data,
        )
        for handler in self._event_handlers:
            try:
                handler(payload)
            except Exception:
                logger.exception("Event handler error for %s", event.value)

    @staticmethod
    def generate_run_id() -> str:
        """Generate a unique run ID."""
        return str(uuid.uuid4())

    @abstractmethod
    def patch(self) -> None:
        """Apply framework-level hooks. Called once during integration setup."""
        ...

    @abstractmethod
    def unpatch(self) -> None:
        """Remove framework-level hooks. Reverts changes made by patch()."""
        ...

    @abstractmethod
    def wrap_agent(self, agent: Any, agent_id: Optional[str] = None) -> Any:
        """Wrap a single agent instance for AgentQ integration.

        Args:
            agent: The framework-native agent instance.
            agent_id: Optional identifier. If not provided, one is generated.

        Returns:
            The wrapped agent (or the same agent if patching is class-level).
        """
        ...

    def _agent_id_for(self, agent: Any, agent_id: Optional[str] = None) -> str:
        """Derive an agent ID from the agent instance or provided value."""
        if agent_id:
            return agent_id
        # Try common attribute names
        for attr in ("name", "agent_name", "id", "agent_id"):
            val = getattr(agent, attr, None)
            if val and isinstance(val, str):
                return val
        return f"{type(agent).__name__}-{uuid.uuid4().hex[:8]}"
