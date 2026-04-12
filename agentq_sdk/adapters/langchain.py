"""LangChain adapter for AgentQ SDK.

Integrates with LangChain's AgentExecutor and LCEL Runnables by
hooking into their invoke/stream methods to emit lifecycle events.
Supports both legacy AgentExecutor and the newer LCEL-based agents.
"""

from __future__ import annotations

import functools
import logging
from typing import Any, Optional

from agentq_sdk.adapters.base import AgentEvent, BaseAdapter

logger = logging.getLogger(__name__)


class LangChainAdapter(BaseAdapter):
    """Adapter for LangChain agents.

    Hooks into:
    - `AgentExecutor.invoke()` / `.ainvoke()` — the primary execution path
    - `AgentExecutor.stream()` / `.astream()` — streaming execution
    - LCEL `RunnableSequence.invoke()` — for LCEL-based agents

    All hooks emit AgentQ lifecycle events without altering the agent's
    behavior or return values.
    """

    _original_methods: dict[str, tuple[type, str, Any]] = {}

    def patch(self) -> None:
        if self._patched:
            return

        try:
            from langchain.agents import AgentExecutor
        except ImportError:
            logger.debug("langchain.agents not available, skipping patch")
            return

        self._patch_class(AgentExecutor, "invoke", self._wrap_invoke)
        self._patch_class(AgentExecutor, "ainvoke", self._wrap_ainvoke)

        # Also patch LCEL RunnableSequence if available
        try:
            from langchain_core.runnables.base import RunnableSequence

            self._patch_class(RunnableSequence, "invoke", self._wrap_invoke)
        except ImportError:
            pass

        self._patched = True
        logger.info("LangChain adapter patched successfully")

    def unpatch(self) -> None:
        if not self._patched:
            return

        for _key, (cls, method_name, original) in self._original_methods.items():
            setattr(cls, method_name, original)

        self._original_methods.clear()
        self._patched = False
        logger.info("LangChain adapter unpatched")

    def wrap_agent(self, agent: Any, agent_id: Optional[str] = None) -> Any:
        """Wrap a LangChain agent instance.

        For LangChain, class-level patching handles most cases.
        This method tags individual agents with an AgentQ ID for
        better tracking in multi-agent scenarios.
        """
        aid = self._agent_id_for(agent, agent_id)
        agent._agentq_id = aid  # type: ignore[attr-defined]
        self._wrapped_agents[aid] = agent
        logger.debug("Wrapped LangChain agent: %s", aid)
        return agent

    # -- Internal helpers --

    def _patch_class(self, cls: type, method_name: str, wrapper_factory: Any) -> None:
        """Monkey-patch a method on a class, saving the original."""
        key = f"{cls.__module__}.{cls.__qualname__}.{method_name}"
        original = getattr(cls, method_name, None)
        if original is None:
            return
        self._original_methods[key] = (cls, method_name, original)
        setattr(cls, method_name, wrapper_factory(original))

    def _wrap_invoke(self, original: Any) -> Any:
        adapter = self

        @functools.wraps(original)
        def wrapped(self_agent: Any, *args: Any, **kwargs: Any) -> Any:
            agent_id = getattr(self_agent, "_agentq_id", type(self_agent).__name__)
            run_id = adapter.generate_run_id()

            adapter.emit_event(
                AgentEvent.AGENT_START,
                agent_id=agent_id,
                run_id=run_id,
                input=_safe_serialize(args, kwargs),
            )
            try:
                result = original(self_agent, *args, **kwargs)
                adapter.emit_event(
                    AgentEvent.AGENT_END,
                    agent_id=agent_id,
                    run_id=run_id,
                    output=_safe_repr(result),
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

    def _wrap_ainvoke(self, original: Any) -> Any:
        adapter = self

        @functools.wraps(original)
        async def wrapped(self_agent: Any, *args: Any, **kwargs: Any) -> Any:
            agent_id = getattr(self_agent, "_agentq_id", type(self_agent).__name__)
            run_id = adapter.generate_run_id()

            adapter.emit_event(
                AgentEvent.AGENT_START,
                agent_id=agent_id,
                run_id=run_id,
                input=_safe_serialize(args, kwargs),
            )
            try:
                result = await original(self_agent, *args, **kwargs)
                adapter.emit_event(
                    AgentEvent.AGENT_END,
                    agent_id=agent_id,
                    run_id=run_id,
                    output=_safe_repr(result),
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


def _safe_serialize(args: tuple, kwargs: dict) -> str:
    """Best-effort serialization for event data."""
    try:
        return repr({"args": args, "kwargs": kwargs})[:1000]
    except Exception:
        return "<unserializable>"


def _safe_repr(obj: Any) -> str:
    try:
        return repr(obj)[:1000]
    except Exception:
        return "<unserializable>"
