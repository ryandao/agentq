"""
CrewAI integration.

Hooks into CrewAI's ``Crew.kickoff()`` and agent task execution so that
crew runs and individual agent tasks are automatically tracked by AgentQ.

Supports:
- crewai >= 0.1

The integration monkey-patches ``Crew.kickoff`` (and its async variant)
to wrap each execution in an AgentRun.
"""

from __future__ import annotations

import functools
import logging
from typing import Any, Optional

from agentq.core import AgentRun
from agentq.integrations.base import FrameworkIntegration

logger = logging.getLogger("agentq")


class CrewAIIntegration(FrameworkIntegration):
    """Auto-detect integration for CrewAI."""

    name = "crewai"
    display_name = "CrewAI"

    def __init__(self) -> None:
        super().__init__()
        self._original_kickoff: Any = None
        self._original_kickoff_async: Any = None
        self._original_execute_task: Any = None

    def _install_hooks(self) -> None:
        try:
            from crewai import Crew

            # Patch Crew.kickoff
            self._original_kickoff = Crew.kickoff
            integration = self

            @functools.wraps(Crew.kickoff)
            def patched_kickoff(crew_self: Any, *args: Any, **kwargs: Any) -> Any:
                crew_name = getattr(crew_self, "name", None) or "CrewAI Crew"
                agents = getattr(crew_self, "agents", [])
                agent_names = [
                    getattr(a, "role", getattr(a, "name", str(a)))
                    for a in agents
                ]
                run = AgentRun(
                    agent_name=str(crew_name),
                    framework="crewai",
                    metadata={
                        "crew_agents": agent_names,
                        "num_agents": len(agents),
                    },
                )
                run.start()
                try:
                    integration.context.track_run(run)
                except RuntimeError:
                    pass

                try:
                    result = integration._original_kickoff(crew_self, *args, **kwargs)
                    try:
                        integration.context.complete_run(run)
                    except RuntimeError:
                        pass
                    return result
                except Exception as exc:
                    try:
                        integration.context.fail_run(run, str(exc))
                    except RuntimeError:
                        pass
                    raise

            Crew.kickoff = patched_kickoff  # type: ignore[assignment]

            # Patch Crew.kickoff_async if it exists
            if hasattr(Crew, "kickoff_async"):
                self._original_kickoff_async = Crew.kickoff_async

                @functools.wraps(Crew.kickoff_async)
                async def patched_kickoff_async(
                    crew_self: Any, *args: Any, **kwargs: Any
                ) -> Any:
                    crew_name = getattr(crew_self, "name", None) or "CrewAI Crew"
                    agents = getattr(crew_self, "agents", [])
                    agent_names = [
                        getattr(a, "role", getattr(a, "name", str(a)))
                        for a in agents
                    ]
                    run = AgentRun(
                        agent_name=str(crew_name),
                        framework="crewai",
                        metadata={
                            "crew_agents": agent_names,
                            "num_agents": len(agents),
                        },
                    )
                    run.start()
                    try:
                        integration.context.track_run(run)
                    except RuntimeError:
                        pass

                    try:
                        result = await integration._original_kickoff_async(
                            crew_self, *args, **kwargs
                        )
                        try:
                            integration.context.complete_run(run)
                        except RuntimeError:
                            pass
                        return result
                    except Exception as exc:
                        try:
                            integration.context.fail_run(run, str(exc))
                        except RuntimeError:
                            pass
                        raise

                Crew.kickoff_async = patched_kickoff_async  # type: ignore[assignment]

            # Patch individual Agent.execute_task if available
            try:
                from crewai import Agent as CrewAgent

                if hasattr(CrewAgent, "execute_task"):
                    self._original_execute_task = CrewAgent.execute_task

                    @functools.wraps(CrewAgent.execute_task)
                    def patched_execute_task(
                        agent_self: Any, *args: Any, **kwargs: Any
                    ) -> Any:
                        agent_name = getattr(
                            agent_self,
                            "role",
                            getattr(agent_self, "name", "CrewAI Agent"),
                        )
                        run = AgentRun(
                            agent_name=str(agent_name),
                            framework="crewai",
                            metadata={"type": "agent_task"},
                        )
                        run.start()
                        try:
                            integration.context.track_run(run)
                        except RuntimeError:
                            pass

                        try:
                            result = integration._original_execute_task(
                                agent_self, *args, **kwargs
                            )
                            try:
                                integration.context.complete_run(run)
                            except RuntimeError:
                                pass
                            return result
                        except Exception as exc:
                            try:
                                integration.context.fail_run(run, str(exc))
                            except RuntimeError:
                                pass
                            raise

                    CrewAgent.execute_task = patched_execute_task  # type: ignore[assignment]
            except ImportError:
                pass

            logger.debug("Installed CrewAI monkey-patches")

        except ImportError:
            logger.warning("CrewAI detected but could not install hooks")

    def _remove_hooks(self) -> None:
        try:
            from crewai import Crew

            if self._original_kickoff is not None:
                Crew.kickoff = self._original_kickoff  # type: ignore[assignment]
            if self._original_kickoff_async is not None:
                Crew.kickoff_async = self._original_kickoff_async  # type: ignore[assignment]
        except ImportError:
            pass

        try:
            from crewai import Agent as CrewAgent

            if self._original_execute_task is not None:
                CrewAgent.execute_task = self._original_execute_task  # type: ignore[assignment]
        except ImportError:
            pass

        self._original_kickoff = None
        self._original_kickoff_async = None
        self._original_execute_task = None
