"""AutoGen integration — automatic tracing of agent conversations.

When ``patch()`` is called and ``autogen`` (or ``autogen-agentchat``) is
importable, this module wraps:

- **ConversableAgent.generate_reply()** — traced as an ``agent`` span
- **ConversableAgent.send()** — traced as a child span for message sends

Usage::

    import agentq
    agentq.init(endpoint="http://localhost:3000")
    agentq.instrument()  # auto-detects AutoGen

    import autogen
    # No @agent decorator needed — agent conversations are traced automatically
"""

from __future__ import annotations

import functools
import logging
from typing import Any

logger = logging.getLogger(__name__)

_patched = False
_originals: dict[str, Any] = {}


def patch() -> bool:
    """Monkey-patch AutoGen agent classes to add agentq tracing.

    Returns True if patched, False if autogen is not installed.
    """
    global _patched
    if _patched:
        return True

    ConversableAgent = None

    # Try pyautogen (older) or autogen-agentchat (newer)
    try:
        from autogen import ConversableAgent as CA
        ConversableAgent = CA
    except ImportError:
        try:
            from autogen_agentchat.agents import ConversableAgent as CA2
            ConversableAgent = CA2
        except ImportError:
            logger.debug("autogen not installed — skipping AutoGen integration")
            return False

    if ConversableAgent is None:
        return False

    _originals["agent_cls"] = ConversableAgent

    # Wrap generate_reply
    if hasattr(ConversableAgent, "generate_reply"):
        _originals["generate_reply"] = ConversableAgent.generate_reply

        @functools.wraps(ConversableAgent.generate_reply)
        def wrapped_generate_reply(self: Any, *args: Any, **kwargs: Any) -> Any:
            from agentq.instrumentation import track_agent

            agent_name = getattr(self, "name", None) or type(self).__name__
            with track_agent(agent_name) as tracker:
                messages = args[0] if args else kwargs.get("messages")
                if messages:
                    # Preview the last message
                    last = messages[-1] if isinstance(messages, list) and messages else messages
                    tracker.set_input(last)
                result = _originals["generate_reply"](self, *args, **kwargs)
                tracker.set_output(result)
                return result

        ConversableAgent.generate_reply = wrapped_generate_reply  # type: ignore[assignment]

    # Wrap initiate_chat for top-level conversation tracing
    if hasattr(ConversableAgent, "initiate_chat"):
        _originals["initiate_chat"] = ConversableAgent.initiate_chat

        @functools.wraps(ConversableAgent.initiate_chat)
        def wrapped_initiate_chat(self: Any, *args: Any, **kwargs: Any) -> Any:
            from agentq.instrumentation import track_agent

            agent_name = getattr(self, "name", None) or type(self).__name__
            recipient = args[0] if args else kwargs.get("recipient")
            recipient_name = getattr(recipient, "name", str(recipient)) if recipient else "unknown"

            with track_agent(f"{agent_name} → {recipient_name}") as tracker:
                message = kwargs.get("message") or (args[1] if len(args) > 1 else None)
                if message:
                    tracker.set_input(message)
                result = _originals["initiate_chat"](self, *args, **kwargs)
                tracker.set_output(result)
                return result

        ConversableAgent.initiate_chat = wrapped_initiate_chat  # type: ignore[assignment]

    _patched = True
    logger.debug("AutoGen agentq integration activated")
    return True


def unpatch() -> None:
    global _patched
    if not _patched:
        return

    cls = _originals.get("agent_cls")
    if cls:
        if "generate_reply" in _originals:
            cls.generate_reply = _originals["generate_reply"]
        if "initiate_chat" in _originals:
            cls.initiate_chat = _originals["initiate_chat"]

    _originals.clear()
    _patched = False
