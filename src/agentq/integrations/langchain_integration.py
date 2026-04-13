"""
LangChain / LangGraph integration.

Hooks into LangChain's callback system to automatically track agent runs.
Works with both LangChain agents and LangGraph graphs without requiring
the @agent decorator.

Detection: Checks for `langchain`, `langchain_core`, or `langgraph` packages.

Integration approach:
- Installs a global LangChain callback handler via `langchain_core.callbacks`
- The callback handler creates AgentRun objects for each agent invocation
- Tracks individual chain steps via the on_step hook
"""

from __future__ import annotations

import logging
from typing import Any, Optional

from agentq.core import AgentRun
from agentq.integrations.base import FrameworkIntegration

logger = logging.getLogger("agentq")


class AgentQCallbackHandler:
    """
    LangChain callback handler that reports agent activity to AgentQ.

    This handler implements the LangChain BaseCallbackHandler interface
    methods as plain methods (duck-typing), so it works even if
    langchain_core is not installed at import time.
    """

    def __init__(self, integration: LangChainIntegration) -> None:
        self._integration = integration
        self._active_runs: dict[str, AgentRun] = {}

    def on_chain_start(
        self,
        serialized: dict[str, Any],
        inputs: dict[str, Any],
        *,
        run_id: Any = None,
        **kwargs: Any,
    ) -> None:
        chain_name = serialized.get("name", serialized.get("id", ["unknown"])[-1])
        run = AgentRun(
            agent_name=chain_name,
            framework="langchain",
            metadata={"chain_type": serialized.get("id", [])},
        )
        run.start()
        run_key = str(run_id) if run_id else run.run_id
        self._active_runs[run_key] = run
        self._integration.context.track_run(run)

    def on_chain_end(
        self, outputs: dict[str, Any], *, run_id: Any = None, **kwargs: Any
    ) -> None:
        run_key = str(run_id) if run_id else None
        run = self._active_runs.pop(run_key, None) if run_key else None
        if run:
            self._integration.context.complete_run(run)

    def on_chain_error(
        self, error: BaseException, *, run_id: Any = None, **kwargs: Any
    ) -> None:
        run_key = str(run_id) if run_id else None
        run = self._active_runs.pop(run_key, None) if run_key else None
        if run:
            self._integration.context.fail_run(run, str(error))

    def on_agent_action(self, action: Any, *, run_id: Any = None, **kwargs: Any) -> None:
        run_key = str(run_id) if run_id else None
        run = self._active_runs.get(run_key) if run_key else None
        if run:
            self._integration.context.record_step(
                run,
                {
                    "type": "agent_action",
                    "tool": getattr(action, "tool", "unknown"),
                    "tool_input": getattr(action, "tool_input", ""),
                },
            )

    def on_tool_start(
        self,
        serialized: dict[str, Any],
        input_str: str,
        *,
        run_id: Any = None,
        **kwargs: Any,
    ) -> None:
        pass  # Tracked via on_agent_action

    def on_tool_end(self, output: str, *, run_id: Any = None, **kwargs: Any) -> None:
        pass

    def on_llm_start(self, serialized: dict[str, Any], prompts: list[str], **kwargs: Any) -> None:
        pass

    def on_llm_end(self, response: Any, **kwargs: Any) -> None:
        pass


class LangChainIntegration(FrameworkIntegration):
    """Auto-integration for LangChain and LangGraph."""

    framework_name = "langchain"

    def __init__(self) -> None:
        super().__init__()
        self._callback_handler: Optional[AgentQCallbackHandler] = None
        self._original_callbacks: Any = None

    def _install_hooks(self) -> None:
        """
        Install a global callback handler into LangChain's callback manager.

        This approach means *any* LangChain chain/agent/graph execution will
        automatically be tracked by AgentQ — no decorator needed.
        """
        self._callback_handler = AgentQCallbackHandler(self)

        try:
            from langchain_core.callbacks import manager as cb_manager

            # Store original default callbacks so we can restore on deactivate
            if hasattr(cb_manager, "_default_callbacks"):
                self._original_callbacks = cb_manager._default_callbacks
            # Append our handler to the global defaults
            if not hasattr(cb_manager, "_default_callbacks") or cb_manager._default_callbacks is None:
                cb_manager._default_callbacks = []
            cb_manager._default_callbacks.append(self._callback_handler)
            logger.debug("Installed LangChain global callback handler")
        except ImportError:
            # Fallback: try older langchain module path
            try:
                import langchain.callbacks as lc_callbacks

                if hasattr(lc_callbacks, "set_handler"):
                    lc_callbacks.set_handler(self._callback_handler)
                    logger.debug(
                        "Installed LangChain callback handler (legacy path)"
                    )
            except (ImportError, AttributeError):
                logger.warning(
                    "LangChain detected but could not install callback handler. "
                    "Agent runs will not be auto-tracked."
                )

    def _remove_hooks(self) -> None:
        """Remove the global callback handler."""
        if self._callback_handler is None:
            return
        try:
            from langchain_core.callbacks import manager as cb_manager

            if hasattr(cb_manager, "_default_callbacks") and cb_manager._default_callbacks:
                cb_manager._default_callbacks = [
                    h
                    for h in cb_manager._default_callbacks
                    if h is not self._callback_handler
                ]
        except ImportError:
            pass
        self._callback_handler = None
