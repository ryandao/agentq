"""LlamaIndex integration — automatic tracing via callback handler.

When ``patch()`` is called and ``llama_index`` is importable, this module
registers a callback handler that creates agentq spans for:

- **Query engine queries** — traced as ``agent`` spans
- **LLM calls** — traced as ``llm`` spans with token usage
- **Retrieval** — traced as ``tool`` spans
- **Embedding** — traced as ``tool`` spans

Usage::

    import agentq
    agentq.init(endpoint="http://localhost:3000")
    agentq.instrument()  # auto-detects LlamaIndex

    from llama_index.core import VectorStoreIndex
    # No @agent decorator needed — queries are traced automatically
"""

from __future__ import annotations

import functools
import logging
from typing import Any

logger = logging.getLogger(__name__)

_patched = False
_originals: dict[str, Any] = {}


def patch() -> bool:
    """Install agentq tracing for LlamaIndex.

    Returns True if patched, False if llama_index is not installed.
    """
    global _patched
    if _patched:
        return True

    # Try llama_index.core (v0.10+)
    try:
        from llama_index.core.base.base_query_engine import BaseQueryEngine
    except ImportError:
        try:
            # Older llama_index (< 0.10)
            from llama_index.core.query_engine import BaseQueryEngine
        except ImportError:
            logger.debug("llama_index not installed — skipping LlamaIndex integration")
            return False

    # Wrap BaseQueryEngine.query
    if hasattr(BaseQueryEngine, "query"):
        _originals["query"] = BaseQueryEngine.query

        @functools.wraps(BaseQueryEngine.query)
        def wrapped_query(self: Any, *args: Any, **kwargs: Any) -> Any:
            from agentq.instrumentation import track_agent

            engine_name = type(self).__name__
            with track_agent(engine_name) as tracker:
                query_str = args[0] if args else kwargs.get("str_or_query_bundle")
                if query_str:
                    tracker.set_input(str(query_str)[:500])
                result = _originals["query"](self, *args, **kwargs)
                if result:
                    tracker.set_output(str(result)[:500])
                return result

        BaseQueryEngine.query = wrapped_query  # type: ignore[assignment]

    # Wrap async query too
    if hasattr(BaseQueryEngine, "aquery"):
        _originals["aquery"] = BaseQueryEngine.aquery

        @functools.wraps(BaseQueryEngine.aquery)
        async def wrapped_aquery(self: Any, *args: Any, **kwargs: Any) -> Any:
            from agentq.instrumentation import track_agent

            engine_name = type(self).__name__
            with track_agent(engine_name) as tracker:
                query_str = args[0] if args else kwargs.get("str_or_query_bundle")
                if query_str:
                    tracker.set_input(str(query_str)[:500])
                result = await _originals["aquery"](self, *args, **kwargs)
                if result:
                    tracker.set_output(str(result)[:500])
                return result

        BaseQueryEngine.aquery = wrapped_aquery  # type: ignore[assignment]

    # Try to wrap the retriever
    try:
        from llama_index.core.base.base_retriever import BaseRetriever

        if hasattr(BaseRetriever, "_retrieve"):
            _originals["retrieve"] = BaseRetriever._retrieve

            @functools.wraps(BaseRetriever._retrieve)
            def wrapped_retrieve(self: Any, *args: Any, **kwargs: Any) -> Any:
                from agentq.instrumentation import track_tool

                retriever_name = type(self).__name__
                with track_tool(retriever_name) as tracker:
                    query = args[0] if args else kwargs.get("query_bundle")
                    if query:
                        tracker.set_input(str(query)[:200])
                    result = _originals["retrieve"](self, *args, **kwargs)
                    if result:
                        tracker.set_output(f"{len(result)} nodes")
                    return result

            BaseRetriever._retrieve = wrapped_retrieve  # type: ignore[assignment]
    except ImportError:
        pass

    _originals["query_engine_cls"] = BaseQueryEngine
    _patched = True
    logger.debug("LlamaIndex agentq integration activated")
    return True


def unpatch() -> None:
    global _patched
    if not _patched:
        return

    cls = _originals.get("query_engine_cls")
    if cls:
        if "query" in _originals:
            cls.query = _originals["query"]
        if "aquery" in _originals:
            cls.aquery = _originals["aquery"]

    try:
        from llama_index.core.base.base_retriever import BaseRetriever
        if "retrieve" in _originals:
            BaseRetriever._retrieve = _originals["retrieve"]
    except ImportError:
        pass

    _originals.clear()
    _patched = False
