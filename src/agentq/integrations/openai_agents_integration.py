"""
OpenAI Agents SDK integration.

Hooks into the OpenAI Agents SDK (``agents`` package) so that each
agent run is automatically tracked by AgentQ.

Supports:
- openai-agents >= 0.1 (the ``agents`` package)

The integration patches ``Runner.run`` and ``Runner.run_sync`` to wrap
each execution in an AgentRun.
"""

from __future__ import annotations

import functools
import logging
from typing import Any, Optional

from agentq.core import AgentRun
from agentq.integrations.base import FrameworkIntegration

logger = logging.getLogger("agentq")


class OpenAIAgentsIntegration(FrameworkIntegration):
    """Auto-detect integration for OpenAI Agents SDK."""

    name = "openai_agents"
    display_name = "OpenAI Agents SDK"

    def __init__(self) -> None:
        super().__init__()
        self._original_run: Any = None
        self._original_run_sync: Any = None
        self._runner_class: Any = None

    def _install_hooks(self) -> None:
        try:
            from agents import Runner

            self._runner_class = Runner
            integration = self

            # Patch Runner.run (async)
            if hasattr(Runner, "run"):
                self._original_run = Runner.run

                @staticmethod  # type: ignore[misc]
                async def patched_run(
                    agent: Any, *args: Any, **kwargs: Any
                ) -> Any:
                    agent_name = getattr(agent, "name", None) or str(type(agent).__name__)
                    run = AgentRun(
                        agent_name=str(agent_name),
                        framework="openai_agents",
                        metadata={
                            "type": "run",
                            "agent_type": type(agent).__name__,
                        },
                    )
                    run.start()
                    try:
                        integration.context.track_run(run)
                    except RuntimeError:
                        pass

                    try:
                        result = await integration._original_run(agent, *args, **kwargs)
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

                Runner.run = patched_run  # type: ignore[assignment]

            # Patch Runner.run_sync (synchronous variant)
            if hasattr(Runner, "run_sync"):
                self._original_run_sync = Runner.run_sync

                @staticmethod  # type: ignore[misc]
                def patched_run_sync(
                    agent: Any, *args: Any, **kwargs: Any
                ) -> Any:
                    agent_name = getattr(agent, "name", None) or str(type(agent).__name__)
                    run = AgentRun(
                        agent_name=str(agent_name),
                        framework="openai_agents",
                        metadata={
                            "type": "run_sync",
                            "agent_type": type(agent).__name__,
                        },
                    )
                    run.start()
                    try:
                        integration.context.track_run(run)
                    except RuntimeError:
                        pass

                    try:
                        result = integration._original_run_sync(agent, *args, **kwargs)
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

                Runner.run_sync = patched_run_sync  # type: ignore[assignment]

            logger.debug("Installed OpenAI Agents SDK monkey-patches")

        except ImportError:
            logger.warning(
                "OpenAI Agents SDK detected but could not install hooks"
            )

    def _remove_hooks(self) -> None:
        if self._runner_class is None:
            return

        if self._original_run is not None:
            self._runner_class.run = self._original_run  # type: ignore[assignment]
        if self._original_run_sync is not None:
            self._runner_class.run_sync = self._original_run_sync  # type: ignore[assignment]

        self._original_run = None
        self._original_run_sync = None
        self._runner_class = None
