"""Auto-instrumentation for Microsoft AutoGen / AG2.

Patches the following entry points to auto-create agent spans:
- ``ConversableAgent.initiate_chat`` — top-level chat span
- ``ConversableAgent.generate_reply`` — per-reply span
- ``ConversableAgent.a_initiate_chat`` — async initiate_chat
- ``ConversableAgent.a_generate_reply`` — async generate_reply

Usage::

    import agentq
    agentq.init(endpoint="http://localhost:3000")
    agentq.instrument()  # Automatically patches AutoGen if installed
"""

from __future__ import annotations

import functools
import logging
from typing import Any

logger = logging.getLogger(__name__)

_originals: dict[str, Any] = {}
_patched = False


def patch() -> None:
    global _patched
    if _patched:
        return

    try:
        from autogen import ConversableAgent  # noqa: F401
    except ImportError:
        logger.debug("autogen not installed – skipping patch")
        return

    any_patched = False
    any_patched = _patch_initiate_chat() or any_patched
    any_patched = _patch_generate_reply() or any_patched

    if any_patched:
        _patched = True
        logger.debug("autogen auto-instrumentation activated")


def unpatch() -> None:
    global _patched
    if not _patched:
        return

    try:
        from autogen import ConversableAgent

        for attr in (
            "initiate_chat",
            "a_initiate_chat",
            "generate_reply",
            "a_generate_reply",
        ):
            key = f"ConversableAgent.{attr}"
            orig = _originals.get(key)
            if orig:
                setattr(ConversableAgent, attr, orig)
    except ImportError:
        pass

    _patched = False


# ---------------------------------------------------------------------------
# ConversableAgent.initiate_chat / a_initiate_chat
# ---------------------------------------------------------------------------

def _patch_initiate_chat() -> bool:
    from autogen import ConversableAgent

    # --- initiate_chat (sync) ---
    original = ConversableAgent.initiate_chat
    _originals["ConversableAgent.initiate_chat"] = original

    @functools.wraps(original)
    def _wrapped_initiate_chat(self: Any, recipient: Any, *args: Any, **kwargs: Any) -> Any:
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
            return original(self, recipient, *args, **kwargs)

        current = trace.get_current_span()
        if _is_noop_span(current):
            return original(self, recipient, *args, **kwargs)

        sender_name = _get_agent_name(self)
        recipient_name = _get_agent_name(recipient) if recipient else "unknown"
        tracer = get_tracer()

        attrs: dict[str, Any] = {
            "agentq.run_type": "agent",
            "agentq.agent_name": sender_name,
            "agentq.framework": "autogen",
            "agentq.meta.recipient": recipient_name,
        }
        parent_agent = _current_agent.get()
        if parent_agent:
            attrs["agentq.parent_agent"] = parent_agent
        session_id = _current_session_id.get()
        if session_id:
            attrs["agentq.session.id"] = session_id

        _add_chat_metadata(attrs, self, recipient, kwargs)

        span_name = f"{sender_name}->{recipient_name}"
        with tracer.start_as_current_span(span_name, attributes=attrs) as span:
            # Extract initial message
            message = kwargs.get("message", args[0] if args else None)
            if message is not None:
                try:
                    span.add_event("agent_input", attributes={"data": _preview_json(message)})
                except Exception:
                    logger.debug("autogen patch: failed to record input", exc_info=True)

            try:
                result = original(self, recipient, *args, **kwargs)
                try:
                    output = _extract_chat_result(result)
                    span.add_event("agent_output", attributes={"data": _preview_json(output)})
                    span.set_status(StatusCode.OK)
                except Exception:
                    logger.debug("autogen patch: failed to record output", exc_info=True)
                return result
            except Exception as exc:
                span.set_status(StatusCode.ERROR, str(exc))
                span.record_exception(exc)
                raise

    ConversableAgent.initiate_chat = _wrapped_initiate_chat  # type: ignore[assignment]

    # --- a_initiate_chat (async) ---
    if hasattr(ConversableAgent, "a_initiate_chat"):
        original_async = ConversableAgent.a_initiate_chat
        _originals["ConversableAgent.a_initiate_chat"] = original_async

        @functools.wraps(original_async)
        async def _wrapped_a_initiate_chat(
            self: Any, recipient: Any, *args: Any, **kwargs: Any
        ) -> Any:
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
                return await original_async(self, recipient, *args, **kwargs)

            current = trace.get_current_span()
            if _is_noop_span(current):
                return await original_async(self, recipient, *args, **kwargs)

            sender_name = _get_agent_name(self)
            recipient_name = _get_agent_name(recipient) if recipient else "unknown"
            tracer = get_tracer()

            attrs: dict[str, Any] = {
                "agentq.run_type": "agent",
                "agentq.agent_name": sender_name,
                "agentq.framework": "autogen",
                "agentq.meta.recipient": recipient_name,
            }
            parent_agent = _current_agent.get()
            if parent_agent:
                attrs["agentq.parent_agent"] = parent_agent
            session_id = _current_session_id.get()
            if session_id:
                attrs["agentq.session.id"] = session_id

            _add_chat_metadata(attrs, self, recipient, kwargs)

            span_name = f"{sender_name}->{recipient_name}"
            with tracer.start_as_current_span(span_name, attributes=attrs) as span:
                message = kwargs.get("message", args[0] if args else None)
                if message is not None:
                    try:
                        span.add_event(
                            "agent_input", attributes={"data": _preview_json(message)}
                        )
                    except Exception:
                        logger.debug("autogen patch: failed to record input", exc_info=True)

                try:
                    result = await original_async(self, recipient, *args, **kwargs)
                    try:
                        output = _extract_chat_result(result)
                        span.add_event(
                            "agent_output", attributes={"data": _preview_json(output)}
                        )
                        span.set_status(StatusCode.OK)
                    except Exception:
                        logger.debug("autogen patch: failed to record output", exc_info=True)
                    return result
                except Exception as exc:
                    span.set_status(StatusCode.ERROR, str(exc))
                    span.record_exception(exc)
                    raise

        ConversableAgent.a_initiate_chat = _wrapped_a_initiate_chat  # type: ignore[assignment]

    return True


# ---------------------------------------------------------------------------
# ConversableAgent.generate_reply / a_generate_reply
# ---------------------------------------------------------------------------

def _patch_generate_reply() -> bool:
    from autogen import ConversableAgent

    # --- generate_reply (sync) ---
    original = ConversableAgent.generate_reply
    _originals["ConversableAgent.generate_reply"] = original

    @functools.wraps(original)
    def _wrapped_generate_reply(
        self: Any, messages: Any = None, sender: Any = None, **kwargs: Any
    ) -> Any:
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
            return original(self, messages=messages, sender=sender, **kwargs)

        current = trace.get_current_span()
        if _is_noop_span(current):
            return original(self, messages=messages, sender=sender, **kwargs)

        agent_name = _get_agent_name(self)
        sender_name = _get_agent_name(sender) if sender else "unknown"
        tracer = get_tracer()

        attrs: dict[str, Any] = {
            "agentq.run_type": "task",
            "agentq.agent_name": agent_name,
            "agentq.framework": "autogen",
            "agentq.meta.sender": sender_name,
        }
        parent_agent = _current_agent.get()
        if parent_agent:
            attrs["agentq.parent_agent"] = parent_agent
        session_id = _current_session_id.get()
        if session_id:
            attrs["agentq.session.id"] = session_id

        span_name = f"{agent_name}.generate_reply"
        with tracer.start_as_current_span(span_name, attributes=attrs) as span:
            # Input from last message
            if messages and isinstance(messages, list) and len(messages) > 0:
                last_msg = messages[-1]
                try:
                    span.add_event(
                        "task_input",
                        attributes={"data": _preview_json(last_msg)},
                    )
                except Exception:
                    logger.debug("autogen patch: failed to record input", exc_info=True)

            try:
                result = original(self, messages=messages, sender=sender, **kwargs)
                if result is not None:
                    try:
                        span.add_event(
                            "task_output", attributes={"data": _preview_json(result)}
                        )
                    except Exception:
                        logger.debug("autogen patch: failed to record output", exc_info=True)
                span.set_status(StatusCode.OK)
                return result
            except Exception as exc:
                span.set_status(StatusCode.ERROR, str(exc))
                span.record_exception(exc)
                raise

    ConversableAgent.generate_reply = _wrapped_generate_reply  # type: ignore[assignment]

    # --- a_generate_reply (async) ---
    if hasattr(ConversableAgent, "a_generate_reply"):
        original_async = ConversableAgent.a_generate_reply
        _originals["ConversableAgent.a_generate_reply"] = original_async

        @functools.wraps(original_async)
        async def _wrapped_a_generate_reply(
            self: Any, messages: Any = None, sender: Any = None, **kwargs: Any
        ) -> Any:
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
                return await original_async(
                    self, messages=messages, sender=sender, **kwargs
                )

            current = trace.get_current_span()
            if _is_noop_span(current):
                return await original_async(
                    self, messages=messages, sender=sender, **kwargs
                )

            agent_name = _get_agent_name(self)
            sender_name = _get_agent_name(sender) if sender else "unknown"
            tracer = get_tracer()

            attrs: dict[str, Any] = {
                "agentq.run_type": "task",
                "agentq.agent_name": agent_name,
                "agentq.framework": "autogen",
                "agentq.meta.sender": sender_name,
            }
            parent_agent = _current_agent.get()
            if parent_agent:
                attrs["agentq.parent_agent"] = parent_agent
            session_id = _current_session_id.get()
            if session_id:
                attrs["agentq.session.id"] = session_id

            span_name = f"{agent_name}.generate_reply"
            with tracer.start_as_current_span(span_name, attributes=attrs) as span:
                if messages and isinstance(messages, list) and len(messages) > 0:
                    last_msg = messages[-1]
                    try:
                        span.add_event(
                            "task_input",
                            attributes={"data": _preview_json(last_msg)},
                        )
                    except Exception:
                        logger.debug("autogen patch: failed to record input", exc_info=True)

                try:
                    result = await original_async(
                        self, messages=messages, sender=sender, **kwargs
                    )
                    if result is not None:
                        try:
                            span.add_event(
                                "task_output",
                                attributes={"data": _preview_json(result)},
                            )
                        except Exception:
                            logger.debug(
                                "autogen patch: failed to record output", exc_info=True
                            )
                    span.set_status(StatusCode.OK)
                    return result
                except Exception as exc:
                    span.set_status(StatusCode.ERROR, str(exc))
                    span.record_exception(exc)
                    raise

        ConversableAgent.a_generate_reply = _wrapped_a_generate_reply  # type: ignore[assignment]

    return True


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_agent_name(agent: Any) -> str:
    if agent is None:
        return "unknown"
    if hasattr(agent, "name") and agent.name:
        return str(agent.name)
    if hasattr(agent, "_name") and agent._name:
        return str(agent._name)
    return type(agent).__name__


def _extract_chat_result(result: Any) -> str:
    if result is None:
        return "(none)"
    if hasattr(result, "summary") and result.summary:
        return str(result.summary)
    if hasattr(result, "chat_history") and result.chat_history:
        history = result.chat_history
        if isinstance(history, list) and len(history) > 0:
            last = history[-1]
            if isinstance(last, dict):
                return str(last.get("content", ""))
            return str(last)
    return str(result)


def _add_chat_metadata(
    attrs: dict[str, Any], sender: Any, recipient: Any, kwargs: Any
) -> None:
    try:
        max_turns = kwargs.get("max_turns")
        if max_turns is not None:
            attrs["agentq.meta.max_turns"] = max_turns

        if kwargs.get("clear_history") is not None:
            attrs["agentq.meta.clear_history"] = kwargs["clear_history"]

        if kwargs.get("silent") is not None:
            attrs["agentq.meta.silent"] = kwargs["silent"]

        if hasattr(sender, "system_message") and sender.system_message:
            msg = str(sender.system_message)
            if len(msg) > 200:
                msg = msg[:200] + "..."
            attrs["agentq.meta.sender_system_message"] = msg

        if (
            recipient
            and hasattr(recipient, "system_message")
            and recipient.system_message
        ):
            msg = str(recipient.system_message)
            if len(msg) > 200:
                msg = msg[:200] + "..."
            attrs["agentq.meta.recipient_system_message"] = msg
    except Exception:
        logger.debug("autogen: failed to extract chat metadata", exc_info=True)
