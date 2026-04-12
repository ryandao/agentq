"""LlamaIndex adapter for AgentQ SDK.

Integrates with LlamaIndex's agent framework (ReActAgent, AgentRunner)
by hooking into the query and chat execution paths.
"""

from __future__ import annotations

import functools
import logging
from typing import Any, Optional

from agentq_sdk.adapters.base import AgentEvent, BaseAdapter

logger = logging.getLogger(__name__)


class LlamaIndexAdapter(BaseAdapter):
    """Adapter for LlamaIndex agents.

    Hooks into:
    - `ReActAgent.chat()` / `.query()` — the main execution methods
    - `AgentRunner.chat()` / `.query()` — the lower-level runner
    - Tool execution callbacks

    LlamaIndex agents use a step-based execution model. This adapter
    tracks the overall agent lifecycle and individual reasoning steps.
    """

    _original_methods: dict[str, tuple[type, str, Any]] = {}

    def patch(self) -> None:
        if self._patched:
            return

        try:
            from llama_index.core.agent import ReActAgent
        except ImportError:
            try:
                # Older llama_index versions
                from llama_index.agent import ReActAgent  # type: ignore[import]
            except ImportError:
                logger.debug("llama_index agent module not available, skipping patch")
                return

        for method_name in ("chat", "query"):
            if hasattr(ReActAgent, method_name):
                self._patch_class(ReActAgent, method_name, self._wrap_chat_or_query)

        # Also patch AgentRunner if available
        try:
            from llama_index.core.agent.runner import AgentRunner

            for method_name in ("chat", "query"):
                if hasattr(AgentRunner, method_name):
                    self._patch_class(AgentRunner, method_name, self._wrap_chat_or_query)
        except ImportError:
            pass

        self._patched = True
        logger.info("LlamaIndex adapter patched successfully")

    def unpatch(self) -> None:
        if not self._patched:
            return

        for _key, (cls, method_name, original) in self._original_methods.items():
            setattr(cls, method_name, original)

        self._original_methods.clear()
        self._patched = False
        logger.info("LlamaIndex adapter unpatched")

    def wrap_agent(self, agent: Any, agent_id: Optional[str] = None) -> Any:
        """Tag a LlamaIndex agent with an AgentQ tracking ID."""
        aid = self._agent_id_for(agent, agent_id)
        agent._agentq_id = aid  # type: ignore[attr-defined]
        self._wrapped_agents[aid] = agent
        logger.debug("Wrapped LlamaIndex agent: %s", aid)
        return agent

    # -- Internal --

    def _patch_class(self, cls: type, method_name: str, wrapper_factory: Any) -> None:
        key = f"{cls.__module__}.{cls.__qualname__}.{method_name}"
        original = getattr(cls, method_name, None)
        if original is None:
            return
        self._original_methods[key] = (cls, method_name, original)
        setattr(cls, method_name, wrapper_factory(original))

    def _wrap_chat_or_query(self, original: Any) -> Any:
        adapter = self

        @functools.wraps(original)
        def wrapped(self_agent: Any, *args: Any, **kwargs: Any) -> Any:
            agent_id = getattr(self_agent, "_agentq_id", type(self_agent).__name__)
            run_id = adapter.generate_run_id()
            method_name = original.__name__

            adapter.emit_event(
                AgentEvent.AGENT_START,
                agent_id=agent_id,
                run_id=run_id,
                framework="llamaindex",
                method=method_name,
                input=repr(args[:1])[:500] if args else None,
            )
            try:
                result = original(self_agent, *args, **kwargs)
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


def _resolve_llama_class(cls_path: str) -> Optional[type]:
    """Resolve a LlamaIndex class from its module path."""
    parts = cls_path.rsplit(".", 1)
    if len(parts) != 2:
        return None
    mod_path, cls_name = parts
    # Try sys.modules first (works with mock modules in tests)
    import sys as _sys

    mod = _sys.modules.get(mod_path)
    if mod is None:
        try:
            import importlib

            mod = importlib.import_module(mod_path)
        except ImportError:
            return None
    cls = getattr(mod, cls_name, None)
    return cls if isinstance(cls, type) else None
