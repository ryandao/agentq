"""Auto-instrumentation for the ``crewai`` framework.

Patches the following entry points to auto-create agent/task spans:
- ``Crew.kickoff`` / ``Crew.kickoff_async`` — top-level crew run
- ``Agent.execute_task`` — individual agent task execution

Usage::

    import agentq
    agentq.init(endpoint="http://localhost:3000")
    agentq.instrument()  # Automatically patches CrewAI if installed
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
        import crewai  # noqa: F401
    except ImportError:
        logger.debug("crewai not installed – skipping patch")
        return

    any_patched = False
    any_patched = _patch_crew_kickoff() or any_patched
    any_patched = _patch_agent_execute_task() or any_patched

    if any_patched:
        _patched = True
        logger.debug("crewai auto-instrumentation activated")


def unpatch() -> None:
    global _patched
    if not _patched:
        return

    try:
        from crewai import Crew

        orig = _originals.get("Crew.kickoff")
        if orig:
            Crew.kickoff = orig
        orig = _originals.get("Crew.kickoff_async")
        if orig:
            Crew.kickoff_async = orig
    except ImportError:
        pass

    try:
        from crewai import Agent

        orig = _originals.get("Agent.execute_task")
        if orig:
            Agent.execute_task = orig
    except ImportError:
        pass

    _patched = False


# ---------------------------------------------------------------------------
# Crew.kickoff / Crew.kickoff_async
# ---------------------------------------------------------------------------

def _patch_crew_kickoff() -> bool:
    try:
        from crewai import Crew
    except ImportError:
        return False

    # --- kickoff (sync) ---
    original_kickoff = Crew.kickoff
    _originals["Crew.kickoff"] = original_kickoff

    @functools.wraps(original_kickoff)
    def _wrapped_kickoff(self: Any, inputs: Any = None, **kwargs: Any) -> Any:
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
            return original_kickoff(self, inputs=inputs, **kwargs)

        current = trace.get_current_span()
        if _is_noop_span(current):
            return original_kickoff(self, inputs=inputs, **kwargs)

        crew_name = _get_crew_name(self)
        tracer = get_tracer()
        attrs: dict[str, Any] = {
            "agentq.run_type": "agent",
            "agentq.agent_name": crew_name,
            "agentq.framework": "crewai",
        }
        agent_name = _current_agent.get()
        if agent_name:
            attrs["agentq.parent_agent"] = agent_name
        session_id = _current_session_id.get()
        if session_id:
            attrs["agentq.session.id"] = session_id

        _add_crew_metadata(attrs, self)

        with tracer.start_as_current_span(crew_name, attributes=attrs) as span:
            if inputs is not None:
                try:
                    span.add_event("agent_input", attributes={"data": _preview_json(inputs)})
                except Exception:
                    logger.debug("crewai patch: failed to record input", exc_info=True)

            try:
                result = original_kickoff(self, inputs=inputs, **kwargs)
                try:
                    output = _extract_crew_output(result)
                    span.add_event("agent_output", attributes={"data": _preview_json(output)})
                    span.set_status(StatusCode.OK)
                except Exception:
                    logger.debug("crewai patch: failed to record output", exc_info=True)
                return result
            except Exception as exc:
                span.set_status(StatusCode.ERROR, str(exc))
                span.record_exception(exc)
                raise

    Crew.kickoff = _wrapped_kickoff  # type: ignore[assignment]

    # --- kickoff_async ---
    if hasattr(Crew, "kickoff_async"):
        original_kickoff_async = Crew.kickoff_async
        _originals["Crew.kickoff_async"] = original_kickoff_async

        @functools.wraps(original_kickoff_async)
        async def _wrapped_kickoff_async(self: Any, inputs: Any = None, **kwargs: Any) -> Any:
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
                return await original_kickoff_async(self, inputs=inputs, **kwargs)

            current = trace.get_current_span()
            if _is_noop_span(current):
                return await original_kickoff_async(self, inputs=inputs, **kwargs)

            crew_name = _get_crew_name(self)
            tracer = get_tracer()
            attrs: dict[str, Any] = {
                "agentq.run_type": "agent",
                "agentq.agent_name": crew_name,
                "agentq.framework": "crewai",
            }
            agent_name = _current_agent.get()
            if agent_name:
                attrs["agentq.parent_agent"] = agent_name
            session_id = _current_session_id.get()
            if session_id:
                attrs["agentq.session.id"] = session_id

            _add_crew_metadata(attrs, self)

            with tracer.start_as_current_span(crew_name, attributes=attrs) as span:
                if inputs is not None:
                    try:
                        span.add_event(
                            "agent_input", attributes={"data": _preview_json(inputs)}
                        )
                    except Exception:
                        logger.debug("crewai patch: failed to record input", exc_info=True)

                try:
                    result = await original_kickoff_async(self, inputs=inputs, **kwargs)
                    try:
                        output = _extract_crew_output(result)
                        span.add_event(
                            "agent_output", attributes={"data": _preview_json(output)}
                        )
                        span.set_status(StatusCode.OK)
                    except Exception:
                        logger.debug("crewai patch: failed to record output", exc_info=True)
                    return result
                except Exception as exc:
                    span.set_status(StatusCode.ERROR, str(exc))
                    span.record_exception(exc)
                    raise

        Crew.kickoff_async = _wrapped_kickoff_async  # type: ignore[assignment]

    return True


# ---------------------------------------------------------------------------
# Agent.execute_task
# ---------------------------------------------------------------------------

def _patch_agent_execute_task() -> bool:
    try:
        from crewai import Agent
    except ImportError:
        return False

    original_execute_task = Agent.execute_task
    _originals["Agent.execute_task"] = original_execute_task

    @functools.wraps(original_execute_task)
    def _wrapped_execute_task(
        self: Any, task: Any, context: Any = None, tools: Any = None
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
            return original_execute_task(self, task, context=context, tools=tools)

        current = trace.get_current_span()
        if _is_noop_span(current):
            return original_execute_task(self, task, context=context, tools=tools)

        agent_role = _get_agent_name(self)
        tracer = get_tracer()
        task_desc = _get_task_description(task)

        attrs: dict[str, Any] = {
            "agentq.run_type": "task",
            "agentq.agent_name": agent_role,
            "agentq.framework": "crewai",
        }
        parent_agent = _current_agent.get()
        if parent_agent:
            attrs["agentq.parent_agent"] = parent_agent
        session_id = _current_session_id.get()
        if session_id:
            attrs["agentq.session.id"] = session_id

        # Agent metadata
        if hasattr(self, "role") and self.role:
            attrs["agentq.meta.agent_role"] = str(self.role)
        if hasattr(self, "goal") and self.goal:
            attrs["agentq.meta.agent_goal"] = str(self.goal)[:200]
        if hasattr(task, "expected_output") and task.expected_output:
            attrs["agentq.meta.expected_output"] = str(task.expected_output)[:200]
        if tools:
            tool_names = [getattr(t, "name", str(t)) for t in tools]
            attrs["agentq.meta.tools"] = str(tool_names)

        span_name = f"{agent_role}.execute_task"
        with tracer.start_as_current_span(span_name, attributes=attrs) as span:
            try:
                span.add_event("task_input", attributes={"data": _preview_json(task_desc)})
            except Exception:
                logger.debug("crewai patch: failed to record input", exc_info=True)

            try:
                result = original_execute_task(self, task, context=context, tools=tools)
                try:
                    span.add_event("task_output", attributes={"data": _preview_json(result)})
                    span.set_status(StatusCode.OK)
                except Exception:
                    logger.debug("crewai patch: failed to record output", exc_info=True)
                return result
            except Exception as exc:
                span.set_status(StatusCode.ERROR, str(exc))
                span.record_exception(exc)
                raise

    Agent.execute_task = _wrapped_execute_task  # type: ignore[assignment]
    return True


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_crew_name(crew: Any) -> str:
    if hasattr(crew, "name") and crew.name:
        return str(crew.name)
    if hasattr(crew, "agents") and crew.agents:
        roles = [getattr(a, "role", "?") for a in crew.agents[:3]]
        return f"Crew({', '.join(roles)})"
    return "Crew"


def _get_agent_name(agent: Any) -> str:
    if hasattr(agent, "role") and agent.role:
        return str(agent.role)
    if hasattr(agent, "name") and agent.name:
        return str(agent.name)
    return "Agent"


def _get_task_description(task: Any) -> str:
    if hasattr(task, "description") and task.description:
        return str(task.description)
    return str(task)


def _extract_crew_output(result: Any) -> str:
    if hasattr(result, "raw"):
        return str(result.raw)
    if hasattr(result, "result"):
        return str(result.result)
    return str(result)


def _add_crew_metadata(attrs: dict[str, Any], crew: Any) -> None:
    try:
        if hasattr(crew, "agents") and crew.agents:
            roles = [getattr(a, "role", "?") for a in crew.agents]
            attrs["agentq.meta.crew_agents"] = str(roles)
            attrs["agentq.meta.crew_agent_count"] = len(crew.agents)
        if hasattr(crew, "tasks") and crew.tasks:
            attrs["agentq.meta.crew_task_count"] = len(crew.tasks)
        if hasattr(crew, "process") and crew.process:
            attrs["agentq.meta.crew_process"] = str(crew.process)
    except Exception:
        logger.debug("crewai: failed to extract crew metadata", exc_info=True)
