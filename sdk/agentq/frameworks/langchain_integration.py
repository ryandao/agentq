"""LangChain integration — automatic tracing via callback handler.

When ``patch()`` is called and ``langchain_core`` is importable, this module
registers a global callback handler that creates agentq spans for:

- **Chains** — each chain invocation becomes an ``agent`` span
- **LLM calls** — each LLM call becomes an ``llm`` span with token usage
- **Tool calls** — each tool invocation becomes a ``tool`` span
- **Retriever** — each retriever invocation becomes a ``tool`` span

Usage::

    import agentq
    agentq.init(endpoint="http://localhost:3000")
    agentq.instrument()  # auto-detects LangChain

    # No @agent decorator needed — LangChain chains are traced automatically
    from langchain_openai import ChatOpenAI
    chain = prompt | ChatOpenAI(model="gpt-4")
    chain.invoke({"input": "hello"})
"""

from __future__ import annotations

import json
import logging
import uuid
from typing import Any

logger = logging.getLogger(__name__)

_patched = False


def patch() -> bool:
    """Install the AgentQ callback handler as a LangChain global callback.

    Returns True if successfully patched, False if langchain is not available.
    """
    global _patched
    if _patched:
        return True

    try:
        from langchain_core.callbacks import BaseCallbackHandler
        from langchain_core.callbacks.manager import CallbackManager
    except ImportError:
        logger.debug("langchain_core not installed — skipping LangChain integration")
        return False

    from agentq.frameworks._langchain_handler import AgentQCallbackHandler

    try:
        # Try to register as a global callback
        import langchain_core.globals as lc_globals

        existing = getattr(lc_globals, "_configure_hooks", None)
        if existing is None:
            # Older langchain_core versions: try via callbacks module
            try:
                from langchain_core.callbacks.manager import (
                    configure as lc_configure,
                )
            except ImportError:
                pass

        # Set as a default callback on the module level
        handler = AgentQCallbackHandler()

        # Store for unpatch
        _state["handler"] = handler

        # Register via set_handler_config or direct patching
        _register_global_handler(handler)

        _patched = True
        logger.debug("LangChain agentq integration activated")
        return True
    except Exception:
        logger.debug("Failed to register LangChain callback handler", exc_info=True)
        return False


def unpatch() -> None:
    global _patched
    if not _patched:
        return
    handler = _state.get("handler")
    if handler:
        _unregister_global_handler(handler)
    _state.clear()
    _patched = False


_state: dict[str, Any] = {}


def _register_global_handler(handler: Any) -> None:
    """Register handler using langchain_core's global callback mechanism."""
    try:
        # langchain_core >= 0.2: use set_llm_cache / configure hooks
        from langchain_core.globals import set_verbose

        # The most reliable approach: patch the CallbackManager constructor
        from langchain_core.callbacks.manager import CallbackManager

        original_init = CallbackManager.__init__

        def patched_init(self: Any, *args: Any, **kwargs: Any) -> None:
            original_init(self, *args, **kwargs)
            # Add our handler if not already present
            if handler not in self.handlers:
                self.add_handler(handler)

        CallbackManager.__init__ = patched_init  # type: ignore[assignment]
        _state["original_init"] = original_init
        _state["callback_manager_cls"] = CallbackManager
    except Exception:
        logger.debug("Could not patch CallbackManager.__init__", exc_info=True)


def _unregister_global_handler(handler: Any) -> None:
    """Remove the globally registered handler."""
    original_init = _state.get("original_init")
    cls = _state.get("callback_manager_cls")
    if original_init and cls:
        cls.__init__ = original_init
