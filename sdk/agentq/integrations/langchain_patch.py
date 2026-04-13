"""Auto-instrumentation for the ``langchain`` / ``langchain-core`` library.

Patches ``Runnable.invoke`` and ``Runnable.ainvoke`` so every chain, agent,
or tool invocation is automatically wrapped in an agentq span — no
``@agent`` decorator required.
"""

from __future__ import annotations

import functools
import logging
from typing import Any

logger = logging.getLogger(__name__)

_original_invoke: Any = None
_original_ainvoke: Any = None
_patched = False


def patch() -> None:
    global _original_invoke, _original_ainvoke, _patched
    if _patched:
        return
    try:
        from langchain_core.runnables.base import Runnable
    except ImportError:
        logger.debug("langchain-core not installed – skipping patch")
        return

    _original_invoke = Runnable.invoke
    _original_ainvoke = Runnable.ainvoke

    @functools.wraps(_original_invoke)
    def _wrapped_invoke(self: Any, input: Any, config: Any = None, **kwargs: Any) -> Any:
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
            return _original_invoke(self, input, config, **kwargs)

        current = trace.get_current_span()
        if _is_noop_span(current):
            return _original_invoke(self, input, config, **kwargs)

        run_type = _detect_run_type(self)
        span_name = _detect_span_name(self)

        tracer = get_tracer()
        attrs: dict[str, Any] = {
            "agentq.run_type": run_type,
            "agentq.framework": "langchain",
            "agentq.langchain.class": type(self).__name__,
        }
        agent_name = _current_agent.get()
        if agent_name:
            attrs["agentq.agent_name"] = agent_name
        session_id = _current_session_id.get()
        if session_id:
            attrs["agentq.session.id"] = session_id

        with tracer.start_as_current_span(span_name, attributes=attrs) as span:
            try:
                span.add_event(f"{run_type}_input", attributes={
                    "data": _preview_json(input),
                })
            except Exception:
                logger.debug("langchain patch: failed to record input", exc_info=True)

            result = _original_invoke(self, input, config, **kwargs)

            try:
                span.add_event(f"{run_type}_output", attributes={
                    "data": _preview_json(result),
                })
                span.set_status(StatusCode.OK)
            except Exception:
                logger.debug("langchain patch: failed to record output", exc_info=True)
        return result

    @functools.wraps(_original_ainvoke)
    async def _wrapped_ainvoke(self: Any, input: Any, config: Any = None, **kwargs: Any) -> Any:
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
            return await _original_ainvoke(self, input, config, **kwargs)

        current = trace.get_current_span()
        if _is_noop_span(current):
            return await _original_ainvoke(self, input, config, **kwargs)

        run_type = _detect_run_type(self)
        span_name = _detect_span_name(self)

        tracer = get_tracer()
        attrs: dict[str, Any] = {
            "agentq.run_type": run_type,
            "agentq.framework": "langchain",
            "agentq.langchain.class": type(self).__name__,
        }
        agent_name = _current_agent.get()
        if agent_name:
            attrs["agentq.agent_name"] = agent_name
        session_id = _current_session_id.get()
        if session_id:
            attrs["agentq.session.id"] = session_id

        with tracer.start_as_current_span(span_name, attributes=attrs) as span:
            try:
                span.add_event(f"{run_type}_input", attributes={
                    "data": _preview_json(input),
                })
            except Exception:
                logger.debug("langchain patch: failed to record input", exc_info=True)

            result = await _original_ainvoke(self, input, config, **kwargs)

            try:
                span.add_event(f"{run_type}_output", attributes={
                    "data": _preview_json(result),
                })
                span.set_status(StatusCode.OK)
            except Exception:
                logger.debug("langchain patch: failed to record output", exc_info=True)
        return result

    Runnable.invoke = _wrapped_invoke  # type: ignore[assignment]
    Runnable.ainvoke = _wrapped_ainvoke  # type: ignore[assignment]
    _patched = True
    logger.debug("langchain auto-instrumentation activated")


def unpatch() -> None:
    global _original_invoke, _original_ainvoke, _patched
    if not _patched:
        return
    try:
        from langchain_core.runnables.base import Runnable

        if _original_invoke is not None:
            Runnable.invoke = _original_invoke  # type: ignore[assignment]
        if _original_ainvoke is not None:
            Runnable.ainvoke = _original_ainvoke  # type: ignore[assignment]
    except ImportError:
        pass
    _original_invoke = None
    _original_ainvoke = None
    _patched = False


def _detect_run_type(obj: Any) -> str:
    """Classify the LangChain Runnable into an agentq run type."""
    cls_name = type(obj).__name__.lower()
    module = type(obj).__module__ or ""

    if "agentexecutor" in cls_name or "agent" in module.split(".")[-1:]:
        return "agent"
    if "tool" in cls_name or "tool" in module:
        return "tool"
    if "llm" in cls_name or "chat" in cls_name or "language_model" in module:
        return "llm"
    return "agent"


def _detect_span_name(obj: Any) -> str:
    """Generate a readable span name for the Runnable."""
    if hasattr(obj, "name") and obj.name:
        return str(obj.name)
    return type(obj).__name__
