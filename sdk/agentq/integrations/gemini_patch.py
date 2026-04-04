"""Auto-instrumentation for the ``google-genai`` library (sync ``generate_content``)."""

from __future__ import annotations

import functools
import logging
from typing import Any

logger = logging.getLogger(__name__)

_original_generate: Any = None
_patched = False


def patch() -> None:
    global _original_generate, _patched
    if _patched:
        return
    try:
        from google.genai.models import Models
    except ImportError:
        logger.debug("google-genai not installed – skipping patch")
        return

    _original_generate = Models.generate_content

    @functools.wraps(_original_generate)
    def _wrapped_generate(self: Any, *args: Any, **kwargs: Any) -> Any:
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
            return _original_generate(self, *args, **kwargs)

        current = trace.get_current_span()
        if _is_noop_span(current):
            return _original_generate(self, *args, **kwargs)

        current_attrs = {}
        if hasattr(current, "attributes") and current.attributes:
            current_attrs = current.attributes
        already_tracking = current_attrs.get("agentq.run_type") == "llm"

        if already_tracking:
            response = _original_generate(self, *args, **kwargs)
            meta = extract_usage(response)
            if meta:
                usage = meta.get("usage", {})
                current.set_attribute("gen_ai.usage.input_tokens", usage.get("prompt_tokens", 0))
                current.set_attribute("gen_ai.usage.output_tokens", usage.get("completion_tokens", 0))
                if meta.get("model"):
                    current.set_attribute("gen_ai.response.model", meta["model"])
            return response

        model = kwargs.get("model") or (args[0] if args else None) or "gemini"
        tracer = get_tracer()
        attrs: dict[str, Any] = {
            "agentq.run_type": "llm",
            "gen_ai.system": "google_genai",
            "gen_ai.request.model": str(model),
        }
        agent_name = _current_agent.get()
        if agent_name:
            attrs["agentq.agent_name"] = agent_name
        session_id = _current_session_id.get()
        if session_id:
            attrs["agentq.session.id"] = session_id

        with tracer.start_as_current_span(str(model), attributes=attrs) as span:
            try:
                contents = kwargs.get("contents") or (args[1] if len(args) > 1 else None)
                llm_input: dict[str, Any] = {}
                if kwargs.get("config") and getattr(kwargs["config"], "system_instruction", None):
                    llm_input["system_instruction"] = kwargs["config"].system_instruction
                if contents:
                    llm_input["contents"] = contents
                span.add_event("llm_input", attributes={"data": _preview_json(llm_input or contents)})
            except Exception:
                logger.debug("gemini patch: failed to record input", exc_info=True)

            response = _original_generate(self, *args, **kwargs)

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
                logger.debug("gemini patch: failed to record output", exc_info=True)
        return response

    Models.generate_content = _wrapped_generate  # type: ignore[assignment]
    _patched = True
    logger.debug("google-genai auto-instrumentation activated")


def unpatch() -> None:
    global _original_generate, _patched
    if not _patched or _original_generate is None:
        return
    try:
        from google.genai.models import Models

        Models.generate_content = _original_generate  # type: ignore[assignment]
    except ImportError:
        pass
    _original_generate = None
    _patched = False
