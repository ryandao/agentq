"""LangChain callback handler that creates agentq spans."""

from __future__ import annotations

import json
import logging
from typing import Any
from uuid import UUID

logger = logging.getLogger(__name__)

# Import BaseCallbackHandler so we inherit required attributes
# (raise_error, ignore_chain, etc.) that LangChain's CallbackManager expects.
try:
    from langchain_core.callbacks import BaseCallbackHandler as _Base
except ImportError:  # pragma: no cover
    _Base = object  # type: ignore[misc,assignment]


class AgentQCallbackHandler(_Base):  # type: ignore[misc]
    """LangChain callback handler that creates agentq OpenTelemetry spans.

    Automatically traces chains, LLM calls, tool calls, and retrievers
    as agentq spans without requiring the ``@agent`` decorator.

    Inherits from ``BaseCallbackHandler`` so LangChain's callback manager
    recognises it as a valid handler (provides ``raise_error``,
    ``ignore_chain``, and other required attributes).
    """

    def __init__(self) -> None:
        super().__init__()
        self._spans: dict[UUID, Any] = {}  # run_id -> (span, token)

    def _start_span(
        self,
        run_id: UUID,
        name: str,
        run_type: str,
        parent_run_id: UUID | None = None,
        inputs: Any = None,
        **extra_attrs: Any,
    ) -> None:
        from agentq.otel import get_tracer
        from agentq.registry import is_initialized
        from agentq.instrumentation import _preview_json, _current_agent

        if not is_initialized():
            return

        tracer = get_tracer()
        attrs: dict[str, Any] = {
            "agentq.run_type": run_type,
        }
        for k, v in extra_attrs.items():
            if isinstance(v, (str, int, float, bool)):
                attrs[k] = v

        agent_name = _current_agent.get()
        if agent_name:
            attrs["agentq.agent_name"] = agent_name

        if inputs:
            attrs["agentq.input_preview"] = _preview_json(inputs)

        span = tracer.start_span(name, attributes=attrs)
        self._spans[run_id] = span

    def _end_span(
        self,
        run_id: UUID,
        outputs: Any = None,
        error: Exception | None = None,
    ) -> None:
        from opentelemetry.trace import StatusCode
        from agentq.instrumentation import _preview_json

        span = self._spans.pop(run_id, None)
        if span is None:
            return

        if error:
            span.set_status(StatusCode.ERROR, str(error))
            span.record_exception(error)
        else:
            if outputs:
                span.set_attribute("agentq.output_preview", _preview_json(outputs))
            span.set_status(StatusCode.OK)

        span.end()

    # -- Chain callbacks ---------------------------------------------------

    def on_chain_start(
        self,
        serialized: dict[str, Any],
        inputs: dict[str, Any],
        *,
        run_id: UUID,
        parent_run_id: UUID | None = None,
        **kwargs: Any,
    ) -> None:
        serialized = serialized or {}
        name = (
            serialized.get("name")
            or (serialized.get("id", ["unknown"]) or ["unknown"])[-1]
            or kwargs.get("name", "chain")
        )
        self._start_span(
            run_id, name, "agent",
            parent_run_id=parent_run_id,
            inputs=inputs,
            **{"agentq.agent_name": name},
        )

    def on_chain_end(
        self,
        outputs: dict[str, Any],
        *,
        run_id: UUID,
        **kwargs: Any,
    ) -> None:
        self._end_span(run_id, outputs=outputs)

    def on_chain_error(
        self,
        error: BaseException,
        *,
        run_id: UUID,
        **kwargs: Any,
    ) -> None:
        self._end_span(run_id, error=error if isinstance(error, Exception) else Exception(str(error)))

    # -- LLM callbacks -----------------------------------------------------

    def on_llm_start(
        self,
        serialized: dict[str, Any],
        prompts: list[str],
        *,
        run_id: UUID,
        parent_run_id: UUID | None = None,
        **kwargs: Any,
    ) -> None:
        serialized = serialized or {}
        model = serialized.get("kwargs", {}).get("model_name") or serialized.get("name", "llm")
        self._start_span(
            run_id, model, "llm",
            parent_run_id=parent_run_id,
            inputs=prompts,
            **{"gen_ai.request.model": model, "gen_ai.system": "langchain"},
        )

    def on_llm_end(
        self,
        response: Any,
        *,
        run_id: UUID,
        **kwargs: Any,
    ) -> None:
        span = self._spans.get(run_id)
        if span and hasattr(response, "llm_output") and response.llm_output:
            usage = response.llm_output.get("token_usage", {})
            if usage:
                span.set_attribute("gen_ai.usage.input_tokens", usage.get("prompt_tokens", 0))
                span.set_attribute("gen_ai.usage.output_tokens", usage.get("completion_tokens", 0))
            model = response.llm_output.get("model_name")
            if model:
                span.set_attribute("gen_ai.response.model", model)
        self._end_span(run_id, outputs=response)

    def on_llm_error(
        self,
        error: BaseException,
        *,
        run_id: UUID,
        **kwargs: Any,
    ) -> None:
        self._end_span(run_id, error=error if isinstance(error, Exception) else Exception(str(error)))

    # -- Tool callbacks ----------------------------------------------------

    def on_tool_start(
        self,
        serialized: dict[str, Any],
        input_str: str,
        *,
        run_id: UUID,
        parent_run_id: UUID | None = None,
        **kwargs: Any,
    ) -> None:
        serialized = serialized or {}
        name = serialized.get("name", "tool")
        self._start_span(
            run_id, name, "tool",
            parent_run_id=parent_run_id,
            inputs=input_str,
        )

    def on_tool_end(
        self,
        output: str,
        *,
        run_id: UUID,
        **kwargs: Any,
    ) -> None:
        self._end_span(run_id, outputs=output)

    def on_tool_error(
        self,
        error: BaseException,
        *,
        run_id: UUID,
        **kwargs: Any,
    ) -> None:
        self._end_span(run_id, error=error if isinstance(error, Exception) else Exception(str(error)))

    # -- Retriever callbacks -----------------------------------------------

    def on_retriever_start(
        self,
        serialized: dict[str, Any],
        query: str,
        *,
        run_id: UUID,
        parent_run_id: UUID | None = None,
        **kwargs: Any,
    ) -> None:
        serialized = serialized or {}
        name = serialized.get("name", "retriever")
        self._start_span(
            run_id, name, "tool",
            parent_run_id=parent_run_id,
            inputs=query,
        )

    def on_retriever_end(
        self,
        documents: Any,
        *,
        run_id: UUID,
        **kwargs: Any,
    ) -> None:
        span = self._spans.get(run_id)
        if span:
            doc_count = len(documents) if documents else 0
            span.set_attribute("agentq.meta.document_count", doc_count)
        self._end_span(run_id, outputs=f"{len(documents) if documents else 0} documents")

    def on_retriever_error(
        self,
        error: BaseException,
        *,
        run_id: UUID,
        **kwargs: Any,
    ) -> None:
        self._end_span(run_id, error=error if isinstance(error, Exception) else Exception(str(error)))
