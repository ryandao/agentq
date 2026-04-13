"""Auto-instrumentation for the ``pyautogen`` / ``autogen`` library.

Patches ``ConversableAgent.generate_reply`` so every agent reply is
automatically wrapped in an agentq span — no ``@agent`` decorator required.
"""

from __future__ import annotations

import functools
import logging
from typing import Any

logger = logging.getLogger(__name__)

_original_generate_reply: Any = None
_patched = False


def patch() -> None:
    global _original_generate_reply, _patched
    if _patched:
        return
    try:
        from autogen import ConversableAgent
    except ImportError:
        logger.debug("autogen not installed – skipping patch")
        return

    _original_generate_reply = ConversableAgent.generate_reply

    @functools.wraps(_original_generate_reply)
    def _wrapped_generate_reply(self: Any, *args: Any, **kwargs: Any) -> Any:
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
            return _original_generate_reply(self, *args, **kwargs)

        current = trace.get_current_span()
        if _is_noop_span(current):
            return _original_generate_reply(self, *args, **kwargs)

        agent_name_attr = getattr(self, "name", None) or type(self).__name__
        tracer = get_tracer()
        attrs: dict[str, Any] = {
            "agentq.run_type": "agent",
            "agentq.framework": "autogen",
            "agentq.autogen.agent_name": agent_name_attr,
            "agentq.autogen.agent_type": type(self).__name__,
        }
        parent_agent = _current_agent.get()
        if parent_agent:
            attrs["agentq.agent_name"] = parent_agent
        session_id = _current_session_id.get()
        if session_id:
            attrs["agentq.session.id"] = session_id

        with tracer.start_as_current_span(agent_name_attr, attributes=attrs) as span:
            try:
                messages = kwargs.get("messages") or (args[0] if args else None)
                if messages:
                    span.add_event("agent_input", attributes={
                        "data": _preview_json(messages),
                    })
            except Exception:
                logger.debug("autogen patch: failed to record input", exc_info=True)

            result = _original_generate_reply(self, *args, **kwargs)

            try:
                span.add_event("agent_output", attributes={
                    "data": _preview_json(result),
                })
                span.set_status(StatusCode.OK)
            except Exception:
                logger.debug("autogen patch: failed to record output", exc_info=True)
        return result

    ConversableAgent.generate_reply = _wrapped_generate_reply  # type: ignore[assignment]
    _patched = True
    logger.debug("autogen auto-instrumentation activated")


def unpatch() -> None:
    global _original_generate_reply, _patched
    if not _patched or _original_generate_reply is None:
        return
    try:
        from autogen import ConversableAgent

        ConversableAgent.generate_reply = _original_generate_reply  # type: ignore[assignment]
    except ImportError:
        pass
    _original_generate_reply = None
    _patched = False
