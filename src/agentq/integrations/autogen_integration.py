"""
AutoGen integration.

Hooks into Microsoft AutoGen's ``ConversableAgent`` so that each agent
message exchange and group chat round is automatically tracked by AgentQ.

Supports:
- pyautogen >= 0.2
- autogen (namespace package)

The integration patches ``ConversableAgent.generate_reply`` and
``GroupChat.run`` to wrap executions in AgentRun tracking.
"""

from __future__ import annotations

import functools
import logging
from typing import Any, Optional

from agentq.core import AgentRun
from agentq.integrations.base import FrameworkIntegration

logger = logging.getLogger("agentq")


class AutoGenIntegration(FrameworkIntegration):
    """Auto-detect integration for Microsoft AutoGen."""

    name = "autogen"
    display_name = "AutoGen"

    def __init__(self) -> None:
        super().__init__()
        self._original_generate_reply: Any = None
        self._original_initiate_chat: Any = None
        self._agent_class: Any = None

    def _install_hooks(self) -> None:
        try:
            # Try pyautogen first, then autogen namespace
            try:
                from autogen import ConversableAgent
            except ImportError:
                from pyautogen import ConversableAgent  # type: ignore[no-redef]

            self._agent_class = ConversableAgent
            integration = self

            # Patch initiate_chat — this is the main entry point
            if hasattr(ConversableAgent, "initiate_chat"):
                self._original_initiate_chat = ConversableAgent.initiate_chat

                @functools.wraps(ConversableAgent.initiate_chat)
                def patched_initiate_chat(
                    agent_self: Any, *args: Any, **kwargs: Any
                ) -> Any:
                    sender_name = getattr(agent_self, "name", "AutoGen Agent")
                    recipient = args[0] if args else kwargs.get("recipient")
                    recipient_name = getattr(recipient, "name", "unknown") if recipient else "unknown"
                    # Use sender->recipient format for clarity
                    agent_name = f"{sender_name}->{recipient_name}"

                    run = AgentRun(
                        agent_name=str(agent_name),
                        framework="autogen",
                        metadata={
                            "type": "initiate_chat",
                            "sender": str(sender_name),
                            "recipient": str(recipient_name),
                        },
                    )
                    run.start()
                    try:
                        integration.context.track_run(run)
                    except RuntimeError:
                        pass

                    try:
                        result = integration._original_initiate_chat(
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

                ConversableAgent.initiate_chat = patched_initiate_chat  # type: ignore[assignment]

            # Patch generate_reply for step-level tracking
            if hasattr(ConversableAgent, "generate_reply"):
                self._original_generate_reply = ConversableAgent.generate_reply

                @functools.wraps(ConversableAgent.generate_reply)
                def patched_generate_reply(
                    agent_self: Any, *args: Any, **kwargs: Any
                ) -> Any:
                    agent_name = getattr(agent_self, "name", "AutoGen Agent")
                    run = AgentRun(
                        agent_name=str(agent_name),
                        framework="autogen",
                        metadata={"type": "generate_reply"},
                    )
                    run.start()
                    try:
                        integration.context.track_run(run)
                    except RuntimeError:
                        pass

                    try:
                        result = integration._original_generate_reply(
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

                ConversableAgent.generate_reply = patched_generate_reply  # type: ignore[assignment]

            logger.debug("Installed AutoGen monkey-patches")

        except ImportError:
            logger.warning("AutoGen detected but could not install hooks")

    def _remove_hooks(self) -> None:
        if self._agent_class is None:
            return

        if self._original_initiate_chat is not None:
            self._agent_class.initiate_chat = self._original_initiate_chat  # type: ignore[assignment]
        if self._original_generate_reply is not None:
            self._agent_class.generate_reply = self._original_generate_reply  # type: ignore[assignment]

        self._original_initiate_chat = None
        self._original_generate_reply = None
        self._agent_class = None
