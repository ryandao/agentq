"""AutoGen adapter for AgentQ SDK.

Integrates with Microsoft AutoGen's ConversableAgent and GroupChat
by hooking into message-sending and chat initiation methods.
"""

from __future__ import annotations

import functools
import logging
from typing import Any, Optional

from agentq_sdk.adapters.base import AgentEvent, BaseAdapter

logger = logging.getLogger(__name__)


class AutoGenAdapter(BaseAdapter):
    """Adapter for Microsoft AutoGen agents.

    Hooks into:
    - `ConversableAgent.initiate_chat()` — conversation initiation
    - `ConversableAgent.generate_reply()` — reply generation
    - `GroupChat.run()` — group chat orchestration (if present)

    AutoGen uses a message-passing architecture between agents.
    This adapter intercepts the conversation lifecycle to provide
    AgentQ telemetry without modifying agent behavior.
    """

    _original_methods: dict[str, tuple[type, str, Any]] = {}

    def patch(self) -> None:
        if self._patched:
            return

        try:
            import autogen
        except ImportError:
            logger.debug("autogen not available, skipping patch")
            return

        # Patch ConversableAgent — the base class for all AutoGen agents
        if hasattr(autogen, "ConversableAgent"):
            self._patch_class(
                autogen.ConversableAgent, "initiate_chat", self._wrap_initiate_chat
            )
            self._patch_class(
                autogen.ConversableAgent, "generate_reply", self._wrap_generate_reply
            )

        # Patch GroupChat if available
        if hasattr(autogen, "GroupChat") and hasattr(autogen.GroupChat, "run"):
            self._patch_class(autogen.GroupChat, "run", self._wrap_group_run)

        self._patched = True
        logger.info("AutoGen adapter patched successfully")

    def unpatch(self) -> None:
        if not self._patched:
            return

        for _key, (cls, method_name, original) in self._original_methods.items():
            setattr(cls, method_name, original)

        self._original_methods.clear()
        self._patched = False
        logger.info("AutoGen adapter unpatched")

    def wrap_agent(self, agent: Any, agent_id: Optional[str] = None) -> Any:
        """Tag an AutoGen agent with an AgentQ tracking ID."""
        aid = self._agent_id_for(agent, agent_id)
        agent._agentq_id = aid  # type: ignore[attr-defined]
        self._wrapped_agents[aid] = agent
        logger.debug("Wrapped AutoGen agent: %s", aid)
        return agent

    # -- Internal --

    def _patch_class(self, cls: type, method_name: str, wrapper_factory: Any) -> None:
        key = f"{cls.__module__}.{cls.__qualname__}.{method_name}"
        original = getattr(cls, method_name, None)
        if original is None:
            return
        self._original_methods[key] = (cls, method_name, original)
        setattr(cls, method_name, wrapper_factory(original))

    def _wrap_initiate_chat(self, original: Any) -> Any:
        adapter = self

        @functools.wraps(original)
        def wrapped(self_agent: Any, *args: Any, **kwargs: Any) -> Any:
            agent_id = getattr(self_agent, "_agentq_id", getattr(self_agent, "name", "autogen-agent"))
            run_id = adapter.generate_run_id()

            recipient = args[0] if args else kwargs.get("recipient")
            recipient_name = getattr(recipient, "name", str(recipient)) if recipient else "unknown"

            adapter.emit_event(
                AgentEvent.AGENT_START,
                agent_id=agent_id,
                run_id=run_id,
                framework="autogen",
                recipient=recipient_name,
            )
            try:
                result = original(self_agent, *args, **kwargs)
                adapter.emit_event(
                    AgentEvent.AGENT_END,
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

    def _wrap_generate_reply(self, original: Any) -> Any:
        adapter = self

        @functools.wraps(original)
        def wrapped(self_agent: Any, *args: Any, **kwargs: Any) -> Any:
            agent_id = getattr(self_agent, "_agentq_id", getattr(self_agent, "name", "autogen-agent"))
            run_id = adapter.generate_run_id()

            adapter.emit_event(
                AgentEvent.LLM_START,
                agent_id=agent_id,
                run_id=run_id,
                framework="autogen",
            )
            try:
                result = original(self_agent, *args, **kwargs)
                adapter.emit_event(
                    AgentEvent.LLM_END,
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

    def _wrap_group_run(self, original: Any) -> Any:
        adapter = self

        @functools.wraps(original)
        def wrapped(self_chat: Any, *args: Any, **kwargs: Any) -> Any:
            run_id = adapter.generate_run_id()

            agents = getattr(self_chat, "agents", [])
            agent_names = [getattr(a, "name", str(a)) for a in agents]

            adapter.emit_event(
                AgentEvent.AGENT_START,
                agent_id="group-chat",
                run_id=run_id,
                framework="autogen",
                agents=agent_names,
            )
            try:
                result = original(self_chat, *args, **kwargs)
                adapter.emit_event(
                    AgentEvent.AGENT_END,
                    agent_id="group-chat",
                    run_id=run_id,
                )
                return result
            except Exception as exc:
                adapter.emit_event(
                    AgentEvent.AGENT_ERROR,
                    agent_id="group-chat",
                    run_id=run_id,
                    error=str(exc),
                )
                raise

        return wrapped


def _resolve_autogen_class(cls_path: str, autogen_mod: Any) -> Optional[type]:
    """Try to resolve an AutoGen class from its qualified name."""
    # Try direct attribute first
    parts = cls_path.split(".")
    cls_name = parts[-1]
    cls = getattr(autogen_mod, cls_name, None)
    return cls if isinstance(cls, type) else None
