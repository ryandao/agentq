"""Auto-instrumentation for LangChain / LangGraph agent frameworks.

Patches the following entry points to auto-create agent spans:
- ``RunnableSequence.invoke`` / ``RunnableSequence.ainvoke`` (langchain-core)
- ``AgentExecutor.invoke`` / ``AgentExecutor.ainvoke`` (langchain agents)
- ``CompiledStateGraph.invoke`` / ``CompiledStateGraph.ainvoke`` / ``CompiledStateGraph.stream`` (langgraph)

Usage::

    import agentq
    agentq.init(endpoint="http://localhost:3000")
    agentq.instrument()  # Automatically patches LangChain/LangGraph if installed
"""

from __future__ import annotations

import functools
import logging
from typing import Any

logger = logging.getLogger(__name__)

_originals: dict[str, Any] = {}
_patched = False


def patch() -> None:
    global _patched
    if _patched:
        return

    any_patched = False
    any_patched = _patch_langchain_core() or any_patched
    any_patched = _patch_langchain_agents() or any_patched
    any_patched = _patch_langgraph() or any_patched

    if any_patched:
        _patched = True


def unpatch() -> None:
    global _patched
    if not _patched:
        return
    _unpatch_langchain_core()
    _unpatch_langchain_agents()
    _unpatch_langgraph()
    _patched = False


# ---------------------------------------------------------------------------
# LangChain Core: RunnableSequence.invoke / ainvoke
# ---------------------------------------------------------------------------

def _patch_langchain_core() -> bool:
    try:
        from langchain_core.runnables.base import RunnableSequence
    except ImportError:
        logger.debug("langchain-core not installed – skipping patch")
        return False

    original_invoke = RunnableSequence.invoke
    _originals["RunnableSequence.invoke"] = original_invoke

    @functools.wraps(original_invoke)
    def _wrapped_invoke(self: Any, input: Any, config: Any = None, **kwargs: Any) -> Any:
        from opentelemetry import trace
        from opentelemetry.trace import StatusCode

        from agentq.instrumentation import (
            _current_agent,
            _current_session_id,
            _is_noop_span,
            _preview_json,
        )
        from agentq.otel import get_tracer
        from agentq.registry import is_initialized

        if not is_initialized():
            return original_invoke(self, input, config=config, **kwargs)

        current = trace.get_current_span()
        if _is_noop_span(current):
            return original_invoke(self, input, config=config, **kwargs)

        chain_name = _get_chain_name(self)
        tracer = get_tracer()
        attrs: dict[str, Any] = {
            "agentq.run_type": "chain",
            "agentq.agent_name": chain_name,
            "agentq.framework": "langchain",
        }
        agent_name = _current_agent.get()
        if agent_name:
            attrs["agentq.parent_agent"] = agent_name
        session_id = _current_session_id.get()
        if session_id:
            attrs["agentq.session.id"] = session_id

        # Extract metadata from config
        if config and isinstance(config, dict):
            if "run_name" in config:
                attrs["agentq.meta.run_name"] = config["run_name"]
            if "tags" in config:
                attrs["agentq.meta.tags"] = str(config["tags"])

        with tracer.start_as_current_span(chain_name, attributes=attrs) as span:
            try:
                span.add_event("chain_input", attributes={"data": _preview_json(input)})
            except Exception:
                logger.debug("langchain patch: failed to record input", exc_info=True)

            try:
                result = original_invoke(self, input, config=config, **kwargs)
                try:
                    span.add_event("chain_output", attributes={"data": _preview_json(result)})
                    span.set_status(StatusCode.OK)
                except Exception:
                    logger.debug("langchain patch: failed to record output", exc_info=True)
                return result
            except Exception as exc:
                span.set_status(StatusCode.ERROR, str(exc))
                span.record_exception(exc)
                raise

    RunnableSequence.invoke = _wrapped_invoke  # type: ignore[assignment]

    # --- ainvoke ---
    original_ainvoke = RunnableSequence.ainvoke
    _originals["RunnableSequence.ainvoke"] = original_ainvoke

    @functools.wraps(original_ainvoke)
    async def _wrapped_ainvoke(self: Any, input: Any, config: Any = None, **kwargs: Any) -> Any:
        from opentelemetry import trace
        from opentelemetry.trace import StatusCode

        from agentq.instrumentation import (
            _current_agent,
            _current_session_id,
            _is_noop_span,
            _preview_json,
        )
        from agentq.otel import get_tracer
        from agentq.registry import is_initialized

        if not is_initialized():
            return await original_ainvoke(self, input, config=config, **kwargs)

        current = trace.get_current_span()
        if _is_noop_span(current):
            return await original_ainvoke(self, input, config=config, **kwargs)

        chain_name = _get_chain_name(self)
        tracer = get_tracer()
        attrs: dict[str, Any] = {
            "agentq.run_type": "chain",
            "agentq.agent_name": chain_name,
            "agentq.framework": "langchain",
        }
        agent_name = _current_agent.get()
        if agent_name:
            attrs["agentq.parent_agent"] = agent_name
        session_id = _current_session_id.get()
        if session_id:
            attrs["agentq.session.id"] = session_id

        with tracer.start_as_current_span(chain_name, attributes=attrs) as span:
            try:
                span.add_event("chain_input", attributes={"data": _preview_json(input)})
            except Exception:
                logger.debug("langchain patch: failed to record input", exc_info=True)

            try:
                result = await original_ainvoke(self, input, config=config, **kwargs)
                try:
                    span.add_event("chain_output", attributes={"data": _preview_json(result)})
                    span.set_status(StatusCode.OK)
                except Exception:
                    logger.debug("langchain patch: failed to record output", exc_info=True)
                return result
            except Exception as exc:
                span.set_status(StatusCode.ERROR, str(exc))
                span.record_exception(exc)
                raise

    RunnableSequence.ainvoke = _wrapped_ainvoke  # type: ignore[assignment]

    logger.debug("langchain-core auto-instrumentation activated")
    return True


def _unpatch_langchain_core() -> None:
    try:
        from langchain_core.runnables.base import RunnableSequence

        orig = _originals.get("RunnableSequence.invoke")
        if orig:
            RunnableSequence.invoke = orig
        orig = _originals.get("RunnableSequence.ainvoke")
        if orig:
            RunnableSequence.ainvoke = orig
    except ImportError:
        pass


# ---------------------------------------------------------------------------
# LangChain Agents: AgentExecutor.invoke / ainvoke
# ---------------------------------------------------------------------------

def _patch_langchain_agents() -> bool:
    try:
        from langchain.agents import AgentExecutor
    except ImportError:
        logger.debug("langchain agents not installed – skipping AgentExecutor patch")
        return False

    original_invoke = AgentExecutor.invoke
    _originals["AgentExecutor.invoke"] = original_invoke

    @functools.wraps(original_invoke)
    def _wrapped_invoke(self: Any, input: Any, config: Any = None, **kwargs: Any) -> Any:
        from opentelemetry import trace
        from opentelemetry.trace import StatusCode

        from agentq.instrumentation import (
            _current_agent,
            _current_session_id,
            _is_noop_span,
            _preview_json,
        )
        from agentq.otel import get_tracer
        from agentq.registry import is_initialized

        if not is_initialized():
            return original_invoke(self, input, config=config, **kwargs)

        current = trace.get_current_span()
        if _is_noop_span(current):
            return original_invoke(self, input, config=config, **kwargs)

        agent_name = _get_agent_executor_name(self)
        tracer = get_tracer()
        attrs: dict[str, Any] = {
            "agentq.run_type": "agent",
            "agentq.agent_name": agent_name,
            "agentq.framework": "langchain",
        }
        parent_agent = _current_agent.get()
        if parent_agent:
            attrs["agentq.parent_agent"] = parent_agent
        session_id = _current_session_id.get()
        if session_id:
            attrs["agentq.session.id"] = session_id

        # Extract tool names
        if hasattr(self, "tools") and self.tools:
            tool_names = [getattr(t, "name", str(t)) for t in self.tools]
            attrs["agentq.meta.tools"] = str(tool_names)

        with tracer.start_as_current_span(agent_name, attributes=attrs) as span:
            try:
                span.add_event("agent_input", attributes={"data": _preview_json(input)})
            except Exception:
                logger.debug("langchain patch: failed to record input", exc_info=True)

            try:
                result = original_invoke(self, input, config=config, **kwargs)
                try:
                    span.add_event("agent_output", attributes={"data": _preview_json(result)})
                    span.set_status(StatusCode.OK)
                except Exception:
                    logger.debug("langchain patch: failed to record output", exc_info=True)
                return result
            except Exception as exc:
                span.set_status(StatusCode.ERROR, str(exc))
                span.record_exception(exc)
                raise

    AgentExecutor.invoke = _wrapped_invoke  # type: ignore[assignment]

    # --- ainvoke ---
    original_ainvoke = AgentExecutor.ainvoke
    _originals["AgentExecutor.ainvoke"] = original_ainvoke

    @functools.wraps(original_ainvoke)
    async def _wrapped_ainvoke(self: Any, input: Any, config: Any = None, **kwargs: Any) -> Any:
        from opentelemetry import trace
        from opentelemetry.trace import StatusCode

        from agentq.instrumentation import (
            _current_agent,
            _current_session_id,
            _is_noop_span,
            _preview_json,
        )
        from agentq.otel import get_tracer
        from agentq.registry import is_initialized

        if not is_initialized():
            return await original_ainvoke(self, input, config=config, **kwargs)

        current = trace.get_current_span()
        if _is_noop_span(current):
            return await original_ainvoke(self, input, config=config, **kwargs)

        agent_name = _get_agent_executor_name(self)
        tracer = get_tracer()
        attrs: dict[str, Any] = {
            "agentq.run_type": "agent",
            "agentq.agent_name": agent_name,
            "agentq.framework": "langchain",
        }
        parent_agent = _current_agent.get()
        if parent_agent:
            attrs["agentq.parent_agent"] = parent_agent
        session_id = _current_session_id.get()
        if session_id:
            attrs["agentq.session.id"] = session_id

        if hasattr(self, "tools") and self.tools:
            tool_names = [getattr(t, "name", str(t)) for t in self.tools]
            attrs["agentq.meta.tools"] = str(tool_names)

        with tracer.start_as_current_span(agent_name, attributes=attrs) as span:
            try:
                span.add_event("agent_input", attributes={"data": _preview_json(input)})
            except Exception:
                logger.debug("langchain patch: failed to record input", exc_info=True)

            try:
                result = await original_ainvoke(self, input, config=config, **kwargs)
                try:
                    span.add_event("agent_output", attributes={"data": _preview_json(result)})
                    span.set_status(StatusCode.OK)
                except Exception:
                    logger.debug("langchain patch: failed to record output", exc_info=True)
                return result
            except Exception as exc:
                span.set_status(StatusCode.ERROR, str(exc))
                span.record_exception(exc)
                raise

    AgentExecutor.ainvoke = _wrapped_ainvoke  # type: ignore[assignment]

    logger.debug("langchain AgentExecutor auto-instrumentation activated")
    return True


def _unpatch_langchain_agents() -> None:
    try:
        from langchain.agents import AgentExecutor

        orig = _originals.get("AgentExecutor.invoke")
        if orig:
            AgentExecutor.invoke = orig
        orig = _originals.get("AgentExecutor.ainvoke")
        if orig:
            AgentExecutor.ainvoke = orig
    except ImportError:
        pass


# ---------------------------------------------------------------------------
# LangGraph: CompiledStateGraph.invoke / ainvoke / stream
# ---------------------------------------------------------------------------

def _patch_langgraph() -> bool:
    try:
        from langgraph.graph.state import CompiledStateGraph
    except ImportError:
        logger.debug("langgraph not installed – skipping patch")
        return False

    # --- invoke ---
    original_invoke = CompiledStateGraph.invoke
    _originals["CompiledStateGraph.invoke"] = original_invoke

    @functools.wraps(original_invoke)
    def _wrapped_invoke(self: Any, input: Any, config: Any = None, **kwargs: Any) -> Any:
        from opentelemetry import trace
        from opentelemetry.trace import StatusCode

        from agentq.instrumentation import (
            _current_agent,
            _current_session_id,
            _is_noop_span,
            _preview_json,
        )
        from agentq.otel import get_tracer
        from agentq.registry import is_initialized

        if not is_initialized():
            return original_invoke(self, input, config=config, **kwargs)

        current = trace.get_current_span()
        if _is_noop_span(current):
            return original_invoke(self, input, config=config, **kwargs)

        graph_name = _get_graph_name(self)
        tracer = get_tracer()
        attrs: dict[str, Any] = {
            "agentq.run_type": "agent",
            "agentq.agent_name": graph_name,
            "agentq.framework": "langgraph",
        }
        agent_name = _current_agent.get()
        if agent_name:
            attrs["agentq.parent_agent"] = agent_name
        session_id = _current_session_id.get()
        if session_id:
            attrs["agentq.session.id"] = session_id

        _add_graph_metadata(attrs, self)

        with tracer.start_as_current_span(graph_name, attributes=attrs) as span:
            try:
                span.add_event("agent_input", attributes={"data": _preview_json(input)})
            except Exception:
                logger.debug("langgraph patch: failed to record input", exc_info=True)

            try:
                result = original_invoke(self, input, config=config, **kwargs)
                try:
                    span.add_event("agent_output", attributes={"data": _preview_json(result)})
                    span.set_status(StatusCode.OK)
                except Exception:
                    logger.debug("langgraph patch: failed to record output", exc_info=True)
                return result
            except Exception as exc:
                span.set_status(StatusCode.ERROR, str(exc))
                span.record_exception(exc)
                raise

    CompiledStateGraph.invoke = _wrapped_invoke  # type: ignore[assignment]

    # --- ainvoke ---
    original_ainvoke = CompiledStateGraph.ainvoke
    _originals["CompiledStateGraph.ainvoke"] = original_ainvoke

    @functools.wraps(original_ainvoke)
    async def _wrapped_ainvoke(self: Any, input: Any, config: Any = None, **kwargs: Any) -> Any:
        from opentelemetry import trace
        from opentelemetry.trace import StatusCode

        from agentq.instrumentation import (
            _current_agent,
            _current_session_id,
            _is_noop_span,
            _preview_json,
        )
        from agentq.otel import get_tracer
        from agentq.registry import is_initialized

        if not is_initialized():
            return await original_ainvoke(self, input, config=config, **kwargs)

        current = trace.get_current_span()
        if _is_noop_span(current):
            return await original_ainvoke(self, input, config=config, **kwargs)

        graph_name = _get_graph_name(self)
        tracer = get_tracer()
        attrs: dict[str, Any] = {
            "agentq.run_type": "agent",
            "agentq.agent_name": graph_name,
            "agentq.framework": "langgraph",
        }
        agent_name = _current_agent.get()
        if agent_name:
            attrs["agentq.parent_agent"] = agent_name
        session_id = _current_session_id.get()
        if session_id:
            attrs["agentq.session.id"] = session_id

        _add_graph_metadata(attrs, self)

        with tracer.start_as_current_span(graph_name, attributes=attrs) as span:
            try:
                span.add_event("agent_input", attributes={"data": _preview_json(input)})
            except Exception:
                logger.debug("langgraph patch: failed to record input", exc_info=True)

            try:
                result = await original_ainvoke(self, input, config=config, **kwargs)
                try:
                    span.add_event("agent_output", attributes={"data": _preview_json(result)})
                    span.set_status(StatusCode.OK)
                except Exception:
                    logger.debug("langgraph patch: failed to record output", exc_info=True)
                return result
            except Exception as exc:
                span.set_status(StatusCode.ERROR, str(exc))
                span.record_exception(exc)
                raise

    CompiledStateGraph.ainvoke = _wrapped_ainvoke  # type: ignore[assignment]

    # --- stream ---
    original_stream = CompiledStateGraph.stream
    _originals["CompiledStateGraph.stream"] = original_stream

    @functools.wraps(original_stream)
    def _wrapped_stream(self: Any, input: Any, config: Any = None, **kwargs: Any) -> Any:
        from opentelemetry import trace
        from opentelemetry.trace import StatusCode

        from agentq.instrumentation import (
            _current_agent,
            _current_session_id,
            _is_noop_span,
            _preview_json,
        )
        from agentq.otel import get_tracer
        from agentq.registry import is_initialized

        if not is_initialized():
            yield from original_stream(self, input, config=config, **kwargs)
            return

        current = trace.get_current_span()
        if _is_noop_span(current):
            yield from original_stream(self, input, config=config, **kwargs)
            return

        graph_name = _get_graph_name(self)
        tracer = get_tracer()
        attrs: dict[str, Any] = {
            "agentq.run_type": "agent",
            "agentq.agent_name": graph_name,
            "agentq.framework": "langgraph",
            "agentq.meta.streaming": True,
        }
        agent_name = _current_agent.get()
        if agent_name:
            attrs["agentq.parent_agent"] = agent_name
        session_id = _current_session_id.get()
        if session_id:
            attrs["agentq.session.id"] = session_id

        _add_graph_metadata(attrs, self)

        with tracer.start_as_current_span(graph_name, attributes=attrs) as span:
            try:
                span.add_event("agent_input", attributes={"data": _preview_json(input)})
            except Exception:
                logger.debug("langgraph patch: failed to record input", exc_info=True)

            try:
                chunks = 0
                last_chunk = None
                for chunk in original_stream(self, input, config=config, **kwargs):
                    chunks += 1
                    last_chunk = chunk
                    yield chunk

                span.set_attribute("agentq.meta.chunks_count", chunks)
                if last_chunk is not None:
                    try:
                        span.add_event(
                            "agent_output",
                            attributes={"data": _preview_json(last_chunk)},
                        )
                    except Exception:
                        pass
                span.set_status(StatusCode.OK)
            except Exception as exc:
                span.set_status(StatusCode.ERROR, str(exc))
                span.record_exception(exc)
                raise

    CompiledStateGraph.stream = _wrapped_stream  # type: ignore[assignment]

    logger.debug("langgraph auto-instrumentation activated")
    return True


def _unpatch_langgraph() -> None:
    try:
        from langgraph.graph.state import CompiledStateGraph

        for attr in ("invoke", "ainvoke", "stream"):
            orig = _originals.get(f"CompiledStateGraph.{attr}")
            if orig:
                setattr(CompiledStateGraph, attr, orig)
    except ImportError:
        pass


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_chain_name(chain: Any) -> str:
    if hasattr(chain, "name") and chain.name:
        return str(chain.name)
    if hasattr(chain, "get_name"):
        try:
            return chain.get_name()
        except Exception:
            pass
    return type(chain).__name__


def _get_agent_executor_name(executor: Any) -> str:
    if hasattr(executor, "agent") and hasattr(executor.agent, "name"):
        return str(executor.agent.name)
    if hasattr(executor, "name") and executor.name:
        return str(executor.name)
    return "AgentExecutor"


def _get_graph_name(graph: Any) -> str:
    if hasattr(graph, "name") and graph.name:
        return str(graph.name)
    if hasattr(graph, "builder") and hasattr(graph.builder, "name"):
        return str(graph.builder.name)
    return "CompiledStateGraph"


def _add_graph_metadata(attrs: dict[str, Any], graph: Any) -> None:
    try:
        if hasattr(graph, "builder"):
            builder = graph.builder
            if hasattr(builder, "nodes") and builder.nodes:
                attrs["agentq.meta.graph_nodes"] = str(list(builder.nodes.keys()))
            if hasattr(builder, "edges") and builder.edges:
                attrs["agentq.meta.graph_edges_count"] = len(builder.edges)
    except Exception:
        logger.debug("langgraph: failed to extract graph metadata", exc_info=True)
