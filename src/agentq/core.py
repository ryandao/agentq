"""
Core AgentQ context and lifecycle management.

Provides the central context object that tracks agent runs, collects telemetry,
and manages the lifecycle of framework integrations.
"""

from __future__ import annotations

import logging
import threading
import time
import uuid
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Callable, Optional

logger = logging.getLogger("agentq")


class AgentStatus(Enum):
    IDLE = "idle"
    RUNNING = "running"
    COMPLETED = "completed"
    ERRORED = "errored"


@dataclass
class AgentRun:
    """Represents a single agent execution run."""

    run_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    agent_name: str = ""
    framework: str = "unknown"
    status: AgentStatus = AgentStatus.IDLE
    started_at: float = 0.0
    completed_at: float = 0.0
    metadata: dict[str, Any] = field(default_factory=dict)
    error: Optional[str] = None

    def start(self) -> None:
        self.status = AgentStatus.RUNNING
        self.started_at = time.time()

    def complete(self) -> None:
        self.status = AgentStatus.COMPLETED
        self.completed_at = time.time()

    def fail(self, error: str) -> None:
        self.status = AgentStatus.ERRORED
        self.completed_at = time.time()
        self.error = error

    @property
    def duration(self) -> float:
        if self.started_at and self.completed_at:
            return self.completed_at - self.started_at
        return 0.0


class AgentQContext:
    """
    Central context for AgentQ SDK.

    Manages framework integrations, tracks agent runs, and provides hooks
    for observability and orchestration.
    """

    def __init__(self) -> None:
        self._initialized = False
        self._lock = threading.Lock()
        self._runs: list[AgentRun] = []
        self._active_integrations: dict[str, Any] = {}
        self._hooks: dict[str, list[Callable]] = {
            "on_agent_start": [],
            "on_agent_complete": [],
            "on_agent_error": [],
            "on_step": [],
        }
        self._config: dict[str, Any] = {}

    @property
    def initialized(self) -> bool:
        return self._initialized

    @property
    def active_integrations(self) -> dict[str, Any]:
        return dict(self._active_integrations)

    @property
    def runs(self) -> list[AgentRun]:
        return list(self._runs)

    def init(self, *, auto_detect: bool = True, **config: Any) -> None:
        """
        Initialize the AgentQ context.

        Args:
            auto_detect: If True, automatically detect and integrate with
                         supported agent frameworks. Defaults to True.
            **config: Additional configuration options.
        """
        with self._lock:
            if self._initialized:
                logger.debug("AgentQ already initialized, skipping")
                return

            self._config.update(config)
            logger.info("Initializing AgentQ SDK v%s", "0.1.0")

            if auto_detect:
                from agentq.autodetect import detect_frameworks

                detected = detect_frameworks()
                for framework_name, integration in detected.items():
                    self._activate_integration(framework_name, integration)

            self._initialized = True
            logger.info(
                "AgentQ initialized with %d integration(s): %s",
                len(self._active_integrations),
                ", ".join(self._active_integrations.keys()) or "none",
            )

    def shutdown(self) -> None:
        """Shut down AgentQ and deactivate all integrations."""
        with self._lock:
            for name, integration in self._active_integrations.items():
                try:
                    integration.deactivate()
                    logger.debug("Deactivated integration: %s", name)
                except Exception as exc:
                    logger.warning(
                        "Error deactivating integration %s: %s", name, exc
                    )
            self._active_integrations.clear()
            self._initialized = False
            logger.info("AgentQ shut down")

    def _activate_integration(self, name: str, integration: Any) -> None:
        """Activate a framework integration."""
        try:
            integration.activate(self)
            self._active_integrations[name] = integration
            logger.info("Activated integration: %s", name)
        except Exception as exc:
            logger.warning("Failed to activate integration %s: %s", name, exc)

    def track_run(self, run: AgentRun) -> None:
        """Register an agent run for tracking."""
        with self._lock:
            self._runs.append(run)
        self._fire_hook("on_agent_start", run)

    def complete_run(self, run: AgentRun) -> None:
        """Mark an agent run as completed."""
        run.complete()
        self._fire_hook("on_agent_complete", run)

    def fail_run(self, run: AgentRun, error: str) -> None:
        """Mark an agent run as failed."""
        run.fail(error)
        self._fire_hook("on_agent_error", run)

    def record_step(self, run: AgentRun, step_data: dict[str, Any]) -> None:
        """Record an intermediate step within an agent run."""
        self._fire_hook("on_step", run, step_data)

    def on(self, event: str, callback: Callable) -> None:
        """Register a hook callback for an event."""
        if event not in self._hooks:
            raise ValueError(
                f"Unknown event '{event}'. Valid events: {list(self._hooks.keys())}"
            )
        self._hooks[event].append(callback)

    def _fire_hook(self, event: str, *args: Any) -> None:
        for callback in self._hooks.get(event, []):
            try:
                callback(*args)
            except Exception as exc:
                logger.warning("Hook %s raised: %s", event, exc)


# ---------------------------------------------------------------------------
# Module-level singleton
# ---------------------------------------------------------------------------

_context: Optional[AgentQContext] = None
_context_lock = threading.Lock()


def get_context() -> AgentQContext:
    """Get the global AgentQ context, creating it if needed."""
    global _context
    with _context_lock:
        if _context is None:
            _context = AgentQContext()
        return _context


def init(**kwargs: Any) -> AgentQContext:
    """Initialize the global AgentQ context."""
    ctx = get_context()
    ctx.init(**kwargs)
    return ctx


def shutdown() -> None:
    """Shut down the global AgentQ context."""
    global _context
    with _context_lock:
        if _context is not None:
            _context.shutdown()
            _context = None
