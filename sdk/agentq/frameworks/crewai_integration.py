"""CrewAI integration — automatic tracing of Crew, Agent, and Task execution.

When ``patch()`` is called and ``crewai`` is importable, this module wraps:

- **Crew.kickoff()** — traced as an ``agent`` span (the crew's overall run)
- **Agent.execute_task()** — traced as an ``agent`` span per agent
- **Task._execute_core()** — traced as an ``agent`` span per task

Usage::

    import agentq
    agentq.init(endpoint="http://localhost:3000")
    agentq.instrument()  # auto-detects CrewAI

    from crewai import Agent, Task, Crew
    # No @agent decorator needed — Crew runs are traced automatically
"""

from __future__ import annotations

import functools
import logging
from typing import Any

logger = logging.getLogger(__name__)

_patched = False
_originals: dict[str, Any] = {}


def patch() -> bool:
    """Monkey-patch CrewAI classes to add agentq tracing.

    Returns True if patched, False if crewai is not installed.
    """
    global _patched
    if _patched:
        return True

    try:
        from crewai import Crew, Agent, Task
    except ImportError:
        logger.debug("crewai not installed — skipping CrewAI integration")
        return False

    # Wrap Crew.kickoff
    _originals["crew_kickoff"] = Crew.kickoff

    @functools.wraps(Crew.kickoff)
    def wrapped_kickoff(self: Any, *args: Any, **kwargs: Any) -> Any:
        from agentq.instrumentation import track_agent, _preview_json
        crew_name = getattr(self, "name", None) or "CrewAI"
        with track_agent(crew_name) as tracker:
            tracker.set_input({
                "agents": [getattr(a, "role", str(a)) for a in (self.agents or [])],
                "tasks": [getattr(t, "description", str(t))[:100] for t in (self.tasks or [])],
            })
            result = _originals["crew_kickoff"](self, *args, **kwargs)
            tracker.set_output(result)
            return result

    Crew.kickoff = wrapped_kickoff  # type: ignore[assignment]

    # Wrap Agent.execute_task
    if hasattr(Agent, "execute_task"):
        _originals["agent_execute_task"] = Agent.execute_task

        @functools.wraps(Agent.execute_task)
        def wrapped_agent_execute(self: Any, *args: Any, **kwargs: Any) -> Any:
            from agentq.instrumentation import track_agent
            agent_name = getattr(self, "role", None) or getattr(self, "name", "Agent")
            with track_agent(agent_name) as tracker:
                task = args[0] if args else kwargs.get("task")
                if task:
                    tracker.set_input(getattr(task, "description", str(task))[:200])
                result = _originals["agent_execute_task"](self, *args, **kwargs)
                tracker.set_output(result)
                return result

        Agent.execute_task = wrapped_agent_execute  # type: ignore[assignment]

    _patched = True
    logger.debug("CrewAI agentq integration activated")
    return True


def unpatch() -> None:
    global _patched
    if not _patched:
        return

    try:
        from crewai import Crew, Agent

        if "crew_kickoff" in _originals:
            Crew.kickoff = _originals["crew_kickoff"]
        if "agent_execute_task" in _originals:
            Agent.execute_task = _originals["agent_execute_task"]
    except ImportError:
        pass

    _originals.clear()
    _patched = False
