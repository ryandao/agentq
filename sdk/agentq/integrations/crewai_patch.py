"""Auto-instrumentation for the ``crewai`` library.

Patches ``Crew.kickoff`` so every crew execution is automatically wrapped in
an agentq span — no ``@agent`` decorator required.
"""

from __future__ import annotations

import functools
import logging
from typing import Any

logger = logging.getLogger(__name__)

_original_kickoff: Any = None
_patched = False


def patch() -> None:
    global _original_kickoff, _patched
    if _patched:
        return
    try:
        from crewai import Crew
    except ImportError:
        logger.debug("crewai not installed – skipping patch")
        return

    _original_kickoff = Crew.kickoff

    @functools.wraps(_original_kickoff)
    def _wrapped_kickoff(self: Any, *args: Any, **kwargs: Any) -> Any:
        from opentelemetry import trace
        from opentelemetry.trace import StatusCode

        from agentq.instrumentation import (
            _current_agent,
            _current_session_id,
            _is_noop_span,
            _preview_json,
        )
        from agentq.otel import get_tracer
        from agentq.registry import is_initialized

        if not is_initialized():
            return _original_kickoff(self, *args, **kwargs)

        current = trace.get_current_span()
        if _is_noop_span(current):
            return _original_kickoff(self, *args, **kwargs)

        crew_name = getattr(self, "name", None) or "CrewAI"
        tracer = get_tracer()
        attrs: dict[str, Any] = {
            "agentq.run_type": "agent",
            "agentq.framework": "crewai",
            "agentq.crewai.crew_name": crew_name,
        }
        # Record agent roles if available
        if hasattr(self, "agents") and self.agents:
            roles = [getattr(a, "role", type(a).__name__) for a in self.agents[:10]]
            attrs["agentq.crewai.agent_roles"] = roles

        agent_name = _current_agent.get()
        if agent_name:
            attrs["agentq.agent_name"] = agent_name
        session_id = _current_session_id.get()
        if session_id:
            attrs["agentq.session.id"] = session_id

        with tracer.start_as_current_span(crew_name, attributes=attrs) as span:
            try:
                inputs = kwargs.get("inputs") or (args[0] if args else None)
                if inputs:
                    span.add_event("agent_input", attributes={
                        "data": _preview_json(inputs),
                    })
            except Exception:
                logger.debug("crewai patch: failed to record input", exc_info=True)

            result = _original_kickoff(self, *args, **kwargs)

            try:
                span.add_event("agent_output", attributes={
                    "data": _preview_json(result),
                })
                span.set_status(StatusCode.OK)
            except Exception:
                logger.debug("crewai patch: failed to record output", exc_info=True)
        return result

    Crew.kickoff = _wrapped_kickoff  # type: ignore[assignment]
    _patched = True
    logger.debug("crewai auto-instrumentation activated")


def unpatch() -> None:
    global _original_kickoff, _patched
    if not _patched or _original_kickoff is None:
        return
    try:
        from crewai import Crew

        Crew.kickoff = _original_kickoff  # type: ignore[assignment]
    except ImportError:
        pass
    _original_kickoff = None
    _patched = False
