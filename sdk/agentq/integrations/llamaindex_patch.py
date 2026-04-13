"""Auto-instrumentation for the ``llama-index`` library.

Patches ``BaseQueryEngine.query`` and ``BaseChatEngine.chat`` so every
query/chat is automatically wrapped in an agentq span — no ``@agent``
decorator required.
"""

from __future__ import annotations

import functools
import logging
from typing import Any

logger = logging.getLogger(__name__)

_original_query: Any = None
_original_chat: Any = None
_patched = False


def patch() -> None:
    global _original_query, _original_chat, _patched
    if _patched:
        return

    patched_any = False

    # Patch QueryEngine
    try:
        from llama_index.core.base.base_query_engine import BaseQueryEngine

        _original_query = BaseQueryEngine.query

        @functools.wraps(_original_query)
        def _wrapped_query(self: Any, str_or_query_bundle: Any, *args: Any, **kwargs: Any) -> Any:
            return _instrumented_call(
                _original_query, self, str_or_query_bundle,
                run_type="agent",
                component_type="query_engine",
                args=args, kwargs=kwargs,
            )

        BaseQueryEngine.query = _wrapped_query  # type: ignore[assignment]
        patched_any = True
        logger.debug("llama-index QueryEngine.query patched")
    except ImportError:
        logger.debug("llama-index QueryEngine not available – skipping")

    # Patch ChatEngine
    try:
        from llama_index.core.base.base_chat_engine import BaseChatEngine

        _original_chat = BaseChatEngine.chat

        @functools.wraps(_original_chat)
        def _wrapped_chat(self: Any, message: str, *args: Any, **kwargs: Any) -> Any:
            return _instrumented_call(
                _original_chat, self, message,
                run_type="agent",
                component_type="chat_engine",
                args=args, kwargs=kwargs,
            )

        BaseChatEngine.chat = _wrapped_chat  # type: ignore[assignment]
        patched_any = True
        logger.debug("llama-index ChatEngine.chat patched")
    except ImportError:
        logger.debug("llama-index ChatEngine not available – skipping")

    if patched_any:
        _patched = True
        logger.debug("llama-index auto-instrumentation activated")


def _instrumented_call(
    original: Any,
    self_obj: Any,
    first_arg: Any,
    *,
    run_type: str,
    component_type: str,
    args: tuple = (),
    kwargs: dict | None = None,
) -> Any:
    """Shared instrumentation wrapper for query/chat calls."""
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

    if kwargs is None:
        kwargs = {}

    if not is_initialized():
        return original(self_obj, first_arg, *args, **kwargs)

    current = trace.get_current_span()
    if _is_noop_span(current):
        return original(self_obj, first_arg, *args, **kwargs)

    span_name = getattr(self_obj, "name", None) or type(self_obj).__name__
    tracer = get_tracer()
    attrs: dict[str, Any] = {
        "agentq.run_type": run_type,
        "agentq.framework": "llamaindex",
        "agentq.llamaindex.component_type": component_type,
        "agentq.llamaindex.class": type(self_obj).__name__,
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
                "data": _preview_json(first_arg),
            })
        except Exception:
            logger.debug("llama-index patch: failed to record input", exc_info=True)

        result = original(self_obj, first_arg, *args, **kwargs)

        try:
            output = result
            if hasattr(result, "response"):
                output = result.response
            span.add_event(f"{run_type}_output", attributes={
                "data": _preview_json(output),
            })
            span.set_status(StatusCode.OK)
        except Exception:
            logger.debug("llama-index patch: failed to record output", exc_info=True)
    return result


def unpatch() -> None:
    global _original_query, _original_chat, _patched
    if not _patched:
        return
    try:
        from llama_index.core.base.base_query_engine import BaseQueryEngine
        if _original_query is not None:
            BaseQueryEngine.query = _original_query  # type: ignore[assignment]
    except ImportError:
        pass
    try:
        from llama_index.core.base.base_chat_engine import BaseChatEngine
        if _original_chat is not None:
            BaseChatEngine.chat = _original_chat  # type: ignore[assignment]
    except ImportError:
        pass
    _original_query = None
    _original_chat = None
    _patched = False
