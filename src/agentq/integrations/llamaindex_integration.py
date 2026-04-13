"""
LlamaIndex integration.

Hooks into LlamaIndex's agent runner and query engine classes so that
agent and query executions are automatically tracked by AgentQ.

Supports:
- llama-index >= 0.10 (new-style llama_index namespace)

The integration monkey-patches ``AgentRunner.chat``, ``AgentRunner.query``,
and ``BaseQueryEngine.query`` to wrap each execution in an AgentRun.
"""

from __future__ import annotations

import functools
import logging
from typing import Any, Optional

from agentq.core import AgentRun
from agentq.integrations.base import FrameworkIntegration

logger = logging.getLogger("agentq")


class LlamaIndexIntegration(FrameworkIntegration):
    """Auto-detect integration for LlamaIndex."""

    name = "llamaindex"
    display_name = "LlamaIndex"

    def __init__(self) -> None:
        super().__init__()
        self._original_agent_chat: Any = None
        self._original_agent_query: Any = None
        self._original_qe_query: Any = None
        self._agent_runner_class: Any = None
        self._base_qe_class: Any = None

    def _install_hooks(self) -> None:
        integration = self

        # Patch AgentRunner.chat and AgentRunner.query
        try:
            from llama_index.core.agent import AgentRunner

            self._agent_runner_class = AgentRunner

            if hasattr(AgentRunner, "chat"):
                self._original_agent_chat = AgentRunner.chat

                @functools.wraps(AgentRunner.chat)
                def patched_chat(agent_self: Any, *args: Any, **kwargs: Any) -> Any:
                    agent_name = getattr(agent_self, "_agent_name", "llamaindex-agent")
                    run = AgentRun(
                        agent_name=str(agent_name),
                        framework="llamaindex",
                        metadata={"method": "chat"},
                    )
                    run.start()
                    try:
                        integration.context.track_run(run)
                    except RuntimeError:
                        pass

                    try:
                        result = integration._original_agent_chat(
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

                AgentRunner.chat = patched_chat  # type: ignore[assignment]

            if hasattr(AgentRunner, "query"):
                self._original_agent_query = AgentRunner.query

                @functools.wraps(AgentRunner.query)
                def patched_agent_query(
                    agent_self: Any, *args: Any, **kwargs: Any
                ) -> Any:
                    agent_name = getattr(agent_self, "_agent_name", "llamaindex-agent")
                    run = AgentRun(
                        agent_name=str(agent_name),
                        framework="llamaindex",
                        metadata={"method": "query"},
                    )
                    run.start()
                    try:
                        integration.context.track_run(run)
                    except RuntimeError:
                        pass

                    try:
                        result = integration._original_agent_query(
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

                AgentRunner.query = patched_agent_query  # type: ignore[assignment]

            logger.debug("Installed LlamaIndex AgentRunner monkey-patches")
        except ImportError:
            logger.debug("llama_index.core.agent.AgentRunner not available")

        # Patch BaseQueryEngine.query
        try:
            from llama_index.core.base.base_query_engine import BaseQueryEngine

            self._base_qe_class = BaseQueryEngine

            if hasattr(BaseQueryEngine, "query"):
                self._original_qe_query = BaseQueryEngine.query

                @functools.wraps(BaseQueryEngine.query)
                def patched_qe_query(
                    qe_self: Any, *args: Any, **kwargs: Any
                ) -> Any:
                    qe_name = getattr(
                        qe_self, "_name", "llamaindex-query"
                    )
                    run = AgentRun(
                        agent_name=str(qe_name),
                        framework="llamaindex",
                        metadata={"method": "query", "type": "query_engine"},
                    )
                    run.start()
                    try:
                        integration.context.track_run(run)
                    except RuntimeError:
                        pass

                    try:
                        result = integration._original_qe_query(
                            qe_self, *args, **kwargs
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

                BaseQueryEngine.query = patched_qe_query  # type: ignore[assignment]

            logger.debug("Installed LlamaIndex BaseQueryEngine monkey-patches")
        except ImportError:
            logger.debug(
                "llama_index.core.base.base_query_engine.BaseQueryEngine not available"
            )

    def _remove_hooks(self) -> None:
        if self._agent_runner_class is not None:
            if self._original_agent_chat is not None:
                self._agent_runner_class.chat = self._original_agent_chat  # type: ignore[assignment]
            if self._original_agent_query is not None:
                self._agent_runner_class.query = self._original_agent_query  # type: ignore[assignment]

        if self._base_qe_class is not None and self._original_qe_query is not None:
            self._base_qe_class.query = self._original_qe_query  # type: ignore[assignment]

        self._original_agent_chat = None
        self._original_agent_query = None
        self._original_qe_query = None
        self._agent_runner_class = None
        self._base_qe_class = None
