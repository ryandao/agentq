"""Auto-instrumentation for the ``openai-agents`` (OpenAI Agents SDK).

Patches the following entry points to auto-create agent spans:
- ``Runner.run`` (async) — creates an agent span for each agent run
- ``Runner.run_sync`` — synchronous variant
- ``Runner.run_streamed`` (async) — streamed variant

Usage::

    import agentq
    agentq.init(endpoint="http://localhost:3000")
    agentq.instrument()  # Automatically patches openai-agents if installed
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
        from agents import Runner  # noqa: F401
    except ImportError:
        logger.debug("openai-agents not installed – skipping patch")
        return

    any_patched = _patch_runner()
    if any_patched:
        _patched = True
        logger.debug("openai-agents auto-instrumentation activated")


def unpatch() -> None:
    global _patched
    if not _patched:
        return

    try:
        from agents import Runner

        for attr in ("run", "run_sync", "run_streamed"):
            key = f"Runner.{attr}"
            orig = _originals.get(key)
            if orig:
                setattr(Runner, attr, orig)
    except ImportError:
        pass

    _patched = False


# ---------------------------------------------------------------------------
# Runner.run / Runner.run_sync / Runner.run_streamed
# ---------------------------------------------------------------------------

def _patch_runner() -> bool:
    from agents import Runner

    patched = False

    # --- run (async classmethod/staticmethod) ---
    if hasattr(Runner, "run"):
        original_run = Runner.run
        _originals["Runner.run"] = original_run

        # Runner.run is typically an async classmethod/staticmethod
        _underlying_run = original_run.__func__ if hasattr(original_run, "__func__") else original_run

        @functools.wraps(_underlying_run)
        async def _wrapped_run(starting_agent: Any, input: Any = None, *args: Any, **kwargs: Any) -> Any:
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
                return await _underlying_run(starting_agent, input, *args, **kwargs)

            current = trace.get_current_span()
            if _is_noop_span(current):
                return await _underlying_run(starting_agent, input, *args, **kwargs)

            agent_name = _get_agent_name(starting_agent)
            tracer = get_tracer()
            attrs: dict[str, Any] = {
                "agentq.run_type": "agent",
                "agentq.agent_name": agent_name,
                "agentq.framework": "openai-agents",
            }
            parent_agent = _current_agent.get()
            if parent_agent:
                attrs["agentq.parent_agent"] = parent_agent
            session_id = _current_session_id.get()
            if session_id:
                attrs["agentq.session.id"] = session_id

            _add_agent_metadata(attrs, starting_agent)

            with tracer.start_as_current_span(agent_name, attributes=attrs) as span:
                if input is not None:
                    try:
                        span.add_event("agent_input", attributes={"data": _preview_json(input)})
                    except Exception:
                        logger.debug("openai-agents patch: failed to record input", exc_info=True)

                try:
                    result = await _underlying_run(starting_agent, input, *args, **kwargs)
                    try:
                        output = _extract_run_output(result)
                        span.add_event("agent_output", attributes={"data": _preview_json(output)})
                        span.set_status(StatusCode.OK)
                    except Exception:
                        logger.debug("openai-agents patch: failed to record output", exc_info=True)
                    return result
                except Exception as exc:
                    span.set_status(StatusCode.ERROR, str(exc))
                    span.record_exception(exc)
                    raise

        Runner.run = staticmethod(_wrapped_run)  # type: ignore[assignment]
        patched = True

    # --- run_sync ---
    if hasattr(Runner, "run_sync"):
        original_run_sync = Runner.run_sync
        _originals["Runner.run_sync"] = original_run_sync

        _underlying_run_sync = (
            original_run_sync.__func__
            if hasattr(original_run_sync, "__func__")
            else original_run_sync
        )

        @functools.wraps(_underlying_run_sync)
        def _wrapped_run_sync(starting_agent: Any, input: Any = None, *args: Any, **kwargs: Any) -> Any:
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
                return _underlying_run_sync(starting_agent, input, *args, **kwargs)

            current = trace.get_current_span()
            if _is_noop_span(current):
                return _underlying_run_sync(starting_agent, input, *args, **kwargs)

            agent_name = _get_agent_name(starting_agent)
            tracer = get_tracer()
            attrs: dict[str, Any] = {
                "agentq.run_type": "agent",
                "agentq.agent_name": agent_name,
                "agentq.framework": "openai-agents",
            }
            parent_agent = _current_agent.get()
            if parent_agent:
                attrs["agentq.parent_agent"] = parent_agent
            session_id = _current_session_id.get()
            if session_id:
                attrs["agentq.session.id"] = session_id

            _add_agent_metadata(attrs, starting_agent)

            with tracer.start_as_current_span(agent_name, attributes=attrs) as span:
                if input is not None:
                    try:
                        span.add_event("agent_input", attributes={"data": _preview_json(input)})
                    except Exception:
                        logger.debug("openai-agents patch: failed to record input", exc_info=True)

                try:
                    result = _underlying_run_sync(starting_agent, input, *args, **kwargs)
                    try:
                        output = _extract_run_output(result)
                        span.add_event("agent_output", attributes={"data": _preview_json(output)})
                        span.set_status(StatusCode.OK)
                    except Exception:
                        logger.debug("openai-agents patch: failed to record output", exc_info=True)
                    return result
                except Exception as exc:
                    span.set_status(StatusCode.ERROR, str(exc))
                    span.record_exception(exc)
                    raise

        Runner.run_sync = staticmethod(_wrapped_run_sync)  # type: ignore[assignment]
        patched = True

    # --- run_streamed (async) ---
    if hasattr(Runner, "run_streamed"):
        original_run_streamed = Runner.run_streamed
        _originals["Runner.run_streamed"] = original_run_streamed

        _underlying_run_streamed = (
            original_run_streamed.__func__
            if hasattr(original_run_streamed, "__func__")
            else original_run_streamed
        )

        @functools.wraps(_underlying_run_streamed)
        async def _wrapped_run_streamed(
            starting_agent: Any, input: Any = None, *args: Any, **kwargs: Any
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
                return await _underlying_run_streamed(starting_agent, input, *args, **kwargs)

            current = trace.get_current_span()
            if _is_noop_span(current):
                return await _underlying_run_streamed(starting_agent, input, *args, **kwargs)

            agent_name = _get_agent_name(starting_agent)
            tracer = get_tracer()
            attrs: dict[str, Any] = {
                "agentq.run_type": "agent",
                "agentq.agent_name": agent_name,
                "agentq.framework": "openai-agents",
                "agentq.meta.streaming": True,
            }
            parent_agent = _current_agent.get()
            if parent_agent:
                attrs["agentq.parent_agent"] = parent_agent
            session_id = _current_session_id.get()
            if session_id:
                attrs["agentq.session.id"] = session_id

            _add_agent_metadata(attrs, starting_agent)

            with tracer.start_as_current_span(agent_name, attributes=attrs) as span:
                if input is not None:
                    try:
                        span.add_event("agent_input", attributes={"data": _preview_json(input)})
                    except Exception:
                        logger.debug("openai-agents patch: failed to record input", exc_info=True)

                try:
                    result = await _underlying_run_streamed(
                        starting_agent, input, *args, **kwargs
                    )
                    span.set_status(StatusCode.OK)
                    return result
                except Exception as exc:
                    span.set_status(StatusCode.ERROR, str(exc))
                    span.record_exception(exc)
                    raise

        Runner.run_streamed = staticmethod(_wrapped_run_streamed)  # type: ignore[assignment]
        patched = True

    return patched


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_agent_name(agent: Any) -> str:
    if hasattr(agent, "name") and agent.name:
        return str(agent.name)
    if hasattr(agent, "model") and agent.model:
        return f"Agent({agent.model})"
    return "Agent"


def _extract_run_output(result: Any) -> str:
    if hasattr(result, "final_output") and result.final_output is not None:
        return str(result.final_output)
    if hasattr(result, "output") and result.output is not None:
        return str(result.output)
    return str(result)


def _add_agent_metadata(attrs: dict[str, Any], agent: Any) -> None:
    try:
        if hasattr(agent, "model") and agent.model:
            attrs["agentq.meta.model"] = str(agent.model)

        if hasattr(agent, "instructions") and agent.instructions:
            instructions = str(agent.instructions)
            if len(instructions) > 200:
                instructions = instructions[:200] + "..."
            attrs["agentq.meta.instructions"] = instructions

        if hasattr(agent, "tools") and agent.tools:
            tool_names = []
            for t in agent.tools:
                if hasattr(t, "name"):
                    tool_names.append(t.name)
                elif hasattr(t, "__name__"):
                    tool_names.append(t.__name__)
                else:
                    tool_names.append(type(t).__name__)
            attrs["agentq.meta.tools"] = str(tool_names)

        if hasattr(agent, "handoffs") and agent.handoffs:
            handoff_names = []
            for h in agent.handoffs:
                if hasattr(h, "agent_name"):
                    handoff_names.append(h.agent_name)
                elif hasattr(h, "name"):
                    handoff_names.append(h.name)
                else:
                    handoff_names.append(str(h))
            attrs["agentq.meta.handoffs"] = str(handoff_names)
    except Exception:
        logger.debug("openai-agents: failed to extract agent metadata", exc_info=True)
