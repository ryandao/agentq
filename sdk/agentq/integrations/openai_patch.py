"""Auto-instrumentation for the ``openai`` library (sync ``create`` only)."""

from __future__ import annotations

import functools
import logging
from typing import Any

logger = logging.getLogger(__name__)

_original_create: Any = None
_patched = False


def patch() -> None:
    global _original_create, _patched
    if _patched:
        return
    try:
        from openai.resources.chat.completions import Completions
    except ImportError:
        logger.debug("openai not installed – skipping patch")
        return

    _original_create = Completions.create

    @functools.wraps(_original_create)
    def _wrapped_create(self: Any, *args: Any, **kwargs: Any) -> Any:
        from opentelemetry import trace
        from opentelemetry.trace import StatusCode

        from agentq.instrumentation import (
            _current_agent,
            _current_session_id,
            _is_noop_span,
            _preview_json,
        )
        from agentq.integrations._extract import extract_usage
        from agentq.otel import get_tracer
        from agentq.registry import is_initialized

        if not is_initialized():
            return _original_create(self, *args, **kwargs)

        current = trace.get_current_span()
        if _is_noop_span(current):
            return _original_create(self, *args, **kwargs)

        current_attrs = {}
        if hasattr(current, "attributes") and current.attributes:
            current_attrs = current.attributes
        already_tracking = current_attrs.get("agentq.run_type") == "llm"

        if already_tracking:
            response = _original_create(self, *args, **kwargs)
            meta = extract_usage(response)
            if meta:
                usage = meta.get("usage", {})
                current.set_attribute("gen_ai.usage.input_tokens", usage.get("prompt_tokens", 0))
                current.set_attribute("gen_ai.usage.output_tokens", usage.get("completion_tokens", 0))
                if meta.get("model"):
                    current.set_attribute("gen_ai.response.model", meta["model"])
            return response

        model = kwargs.get("model") or "openai"
        tracer = get_tracer()
        attrs: dict[str, Any] = {
            "agentq.run_type": "llm",
            "gen_ai.system": "openai",
            "gen_ai.request.model": model,
        }
        agent_name = _current_agent.get()
        if agent_name:
            attrs["agentq.agent_name"] = agent_name
        session_id = _current_session_id.get()
        if session_id:
            attrs["agentq.session.id"] = session_id

        with tracer.start_as_current_span(model, attributes=attrs) as span:
            try:
                messages = kwargs.get("messages")
                if messages:
                    span.add_event("llm_input", attributes={"data": _preview_json(messages)})
            except Exception:
                logger.debug("openai patch: failed to record input", exc_info=True)

            response = _original_create(self, *args, **kwargs)

            try:
                span.add_event("llm_output", attributes={"data": _preview_json(response)})
                meta = extract_usage(response)
                if meta:
                    usage = meta.get("usage", {})
                    span.set_attribute("gen_ai.usage.input_tokens", usage.get("prompt_tokens", 0))
                    span.set_attribute("gen_ai.usage.output_tokens", usage.get("completion_tokens", 0))
                    if meta.get("model"):
                        span.set_attribute("gen_ai.response.model", meta["model"])
                span.set_status(StatusCode.OK)
            except Exception:
                logger.debug("openai patch: failed to record output", exc_info=True)
        return response

    Completions.create = _wrapped_create  # type: ignore[assignment]
    _patched = True
    logger.debug("openai auto-instrumentation activated")


def unpatch() -> None:
    global _original_create, _patched
    if not _patched or _original_create is None:
        return
    try:
        from openai.resources.chat.completions import Completions

        Completions.create = _original_create  # type: ignore[assignment]
    except ImportError:
        pass
    _original_create = None
    _patched = False
