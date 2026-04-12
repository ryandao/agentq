"""CrewAI adapter for AgentQ SDK.

Integrates with CrewAI's Crew.kickoff() and Agent task execution
by hooking into the Crew orchestration lifecycle.
"""

from __future__ import annotations

import functools
import logging
from typing import Any, Optional

from agentq_sdk.adapters.base import AgentEvent, BaseAdapter

logger = logging.getLogger(__name__)


class CrewAIAdapter(BaseAdapter):
    """Adapter for CrewAI agents and crews.

    Hooks into:
    - `Crew.kickoff()` — the main orchestration entry point
    - `Agent.execute_task()` — individual agent task execution

    CrewAI organizes agents into crews that execute tasks. This adapter
    tracks both the crew-level lifecycle and individual agent steps.
    """

    _original_methods: dict[str, tuple[type, str, Any]] = {}

    def patch(self) -> None:
        if self._patched:
            return

        try:
            import crewai
        except ImportError:
            logger.debug("crewai not available, skipping patch")
            return

        # Patch Crew.kickoff
        if hasattr(crewai, "Crew"):
            self._patch_class(crewai.Crew, "kickoff", self._wrap_kickoff)

        # Patch Agent.execute_task if available
        if hasattr(crewai, "Agent") and hasattr(crewai.Agent, "execute_task"):
            self._patch_class(crewai.Agent, "execute_task", self._wrap_execute_task)

        self._patched = True
        logger.info("CrewAI adapter patched successfully")

    def unpatch(self) -> None:
        if not self._patched:
            return

        for _key, (cls, method_name, original) in self._original_methods.items():
            setattr(cls, method_name, original)

        self._original_methods.clear()
        self._patched = False
        logger.info("CrewAI adapter unpatched")

    def wrap_agent(self, agent: Any, agent_id: Optional[str] = None) -> Any:
        """Tag a CrewAI Agent instance with an AgentQ tracking ID."""
        aid = self._agent_id_for(agent, agent_id)
        agent._agentq_id = aid  # type: ignore[attr-defined]
        self._wrapped_agents[aid] = agent
        logger.debug("Wrapped CrewAI agent: %s", aid)
        return agent

    # -- Internal --

    def _patch_class(self, cls: type, method_name: str, wrapper_factory: Any) -> None:
        key = f"{cls.__module__}.{cls.__qualname__}.{method_name}"
        original = getattr(cls, method_name, None)
        if original is None:
            return
        self._original_methods[key] = (cls, method_name, original)
        setattr(cls, method_name, wrapper_factory(original))

    def _wrap_kickoff(self, original: Any) -> Any:
        adapter = self

        @functools.wraps(original)
        def wrapped(self_crew: Any, *args: Any, **kwargs: Any) -> Any:
            agent_id = getattr(self_crew, "_agentq_id", "crew")
            run_id = adapter.generate_run_id()

            # Track all agents in the crew
            agents = getattr(self_crew, "agents", [])
            agent_names = [getattr(a, "role", str(a)) for a in agents]

            adapter.emit_event(
                AgentEvent.AGENT_START,
                agent_id=agent_id,
                run_id=run_id,
                agents=agent_names,
                framework="crewai",
            )
            try:
                result = original(self_crew, *args, **kwargs)
                adapter.emit_event(
                    AgentEvent.AGENT_END,
                    agent_id=agent_id,
                    run_id=run_id,
                    output=repr(result)[:1000] if result else None,
                )
                return result
            except Exception as exc:
                adapter.emit_event(
                    AgentEvent.AGENT_ERROR,
                    agent_id=agent_id,
                    run_id=run_id,
                    error=str(exc),
                )
                raise

        return wrapped

    def _wrap_execute_task(self, original: Any) -> Any:
        adapter = self

        @functools.wraps(original)
        def wrapped(self_agent: Any, *args: Any, **kwargs: Any) -> Any:
            agent_id = getattr(
                self_agent,
                "_agentq_id",
                getattr(self_agent, "role", type(self_agent).__name__),
            )
            run_id = adapter.generate_run_id()

            adapter.emit_event(
                AgentEvent.STEP_START,
                agent_id=agent_id,
                run_id=run_id,
                framework="crewai",
            )
            try:
                result = original(self_agent, *args, **kwargs)
                adapter.emit_event(
                    AgentEvent.STEP_END,
                    agent_id=agent_id,
                    run_id=run_id,
                )
                return result
            except Exception as exc:
                adapter.emit_event(
                    AgentEvent.AGENT_ERROR,
                    agent_id=agent_id,
                    run_id=run_id,
                    error=str(exc),
                )
                raise

        return wrapped


def _resolve_class(path: str, module: Any) -> Optional[type]:
    """Try to resolve a class from a dotted path within a module."""
    parts = path.split(".")
    obj = module
    for part in parts:
        obj = getattr(obj, part, None)
        if obj is None:
            return None
    return obj if isinstance(obj, type) else None
