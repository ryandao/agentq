"""Unit tests for agentq.instrumentation — @agent decorator, session, tracking."""

from __future__ import annotations

import logging
from unittest.mock import patch

import pytest

from opentelemetry import trace

import agentq.registry as registry
from agentq.instrumentation import (
    ObservabilityLogHandler,
    SpanProxy,
    _AttributeDict,
    _NoOpTracker,
    _SpanTracker,
    _preview_json,
    _sanitize,
    agent,
    current_span,
    session,
    track_agent,
    track_llm,
    track_tool,
)


# ---------------------------------------------------------------------------
# _sanitize / _preview_json
# ---------------------------------------------------------------------------

class TestSanitize:
    def test_none(self):
        assert _sanitize(None) is None

    def test_primitives(self):
        assert _sanitize("hello") == "hello"
        assert _sanitize(42) == 42
        assert _sanitize(3.14) == 3.14
        assert _sanitize(True) is True

    def test_dict(self):
        result = _sanitize({"key": "value"})
        assert result == {"key": "value"}

    def test_list(self):
        result = _sanitize([1, 2, 3])
        assert result == [1, 2, 3]

    def test_nested_depth_limit(self):
        deep = {"a": {"b": {"c": {"d": {"e": "too deep"}}}}}
        result = _sanitize(deep)
        # Should not exceed depth 3
        assert isinstance(result, dict)

    def test_model_dump_object(self):
        class FakeModel:
            def model_dump(self):
                return {"field": "value"}
        result = _sanitize(FakeModel())
        assert result == {"field": "value"}

    def test_dict_method_object(self):
        class OldModel:
            def dict(self):
                return {"old": "style"}
        result = _sanitize(OldModel())
        assert result == {"old": "style"}

    def test_object_with_dict(self):
        class Obj:
            def __init__(self):
                self.x = 1
                self.y = "hello"
                self._private = "hidden"
        result = _sanitize(Obj())
        assert "x" in result
        assert "y" in result
        assert "_private" not in result

    def test_truncation_of_large_lists(self):
        big = list(range(100))
        result = _sanitize(big)
        assert len(result) == 20

    def test_truncation_of_large_dicts(self):
        big = {f"k{i}": i for i in range(100)}
        result = _sanitize(big)
        assert len(result) == 20


class TestPreviewJson:
    def test_simple(self):
        result = _preview_json({"key": "value"})
        assert '"key"' in result
        assert '"value"' in result

    def test_handles_non_serializable(self):
        result = _preview_json(object())
        assert isinstance(result, str)


# ---------------------------------------------------------------------------
# current_span
# ---------------------------------------------------------------------------

class TestCurrentSpan:
    def test_returns_none_without_tracing(self):
        # Without proper setup, should return None (NonRecordingSpan)
        result = current_span()
        assert result is None

    def test_returns_span_proxy_with_active_span(self, initialized_sdk, tracer_provider, memory_exporter):
        tracer = trace.get_tracer("test")
        with tracer.start_as_current_span("test-span"):
            proxy = current_span()
            assert proxy is not None
            assert isinstance(proxy, SpanProxy)


# ---------------------------------------------------------------------------
# SpanProxy
# ---------------------------------------------------------------------------

class TestSpanProxy:
    def test_name_getter(self, initialized_sdk, tracer_provider):
        tracer = trace.get_tracer("test")
        with tracer.start_as_current_span("my-span") as span:
            proxy = SpanProxy(span)
            assert proxy.name == "my-span"

    def test_name_setter(self, initialized_sdk, tracer_provider):
        tracer = trace.get_tracer("test")
        with tracer.start_as_current_span("original") as span:
            proxy = SpanProxy(span)
            proxy.name = "renamed"
            # update_name should be called

    def test_metadata_returns_attribute_dict(self, initialized_sdk, tracer_provider):
        tracer = trace.get_tracer("test")
        with tracer.start_as_current_span("span") as span:
            proxy = SpanProxy(span)
            meta = proxy.metadata
            assert isinstance(meta, _AttributeDict)

    def test_tags_setter(self, initialized_sdk, tracer_provider):
        tracer = trace.get_tracer("test")
        with tracer.start_as_current_span("span") as span:
            proxy = SpanProxy(span)
            proxy.tags = ["tag1", "tag2"]

    def test_add_event(self, initialized_sdk, tracer_provider):
        tracer = trace.get_tracer("test")
        with tracer.start_as_current_span("span") as span:
            proxy = SpanProxy(span)
            proxy.add_event({"type": "custom", "data": "value"})


# ---------------------------------------------------------------------------
# _NoOpTracker / _SpanTracker
# ---------------------------------------------------------------------------

class TestNoOpTracker:
    def test_methods_dont_raise(self):
        t = _NoOpTracker()
        t.set_input({"x": 1})
        t.set_output({"y": 2})
        t.add_event({"type": "test"})


class TestSpanTracker:
    def test_set_input(self, initialized_sdk, tracer_provider, memory_exporter):
        tracer = trace.get_tracer("test")
        with tracer.start_as_current_span("span") as span:
            tracker = _SpanTracker(span, "agent")
            tracker.set_input({"query": "hello"})
        spans = memory_exporter.get_finished_spans()
        assert len(spans) == 1
        events = spans[0].events
        assert any(e.name == "agent_input" for e in events)

    def test_set_output(self, initialized_sdk, tracer_provider, memory_exporter):
        tracer = trace.get_tracer("test")
        with tracer.start_as_current_span("span") as span:
            tracker = _SpanTracker(span, "llm")
            tracker.set_output({"answer": "world"})
        spans = memory_exporter.get_finished_spans()
        events = spans[0].events
        assert any(e.name == "llm_output" for e in events)


# ---------------------------------------------------------------------------
# ObservabilityLogHandler
# ---------------------------------------------------------------------------

class TestObservabilityLogHandler:
    def test_emit_with_active_span(self, initialized_sdk, tracer_provider, memory_exporter):
        handler = ObservabilityLogHandler()
        handler.setFormatter(logging.Formatter("%(message)s"))
        logger = logging.getLogger("test-obs")
        logger.addHandler(handler)
        logger.setLevel(logging.INFO)

        tracer = trace.get_tracer("test")
        with tracer.start_as_current_span("span"):
            logger.info("test message")

        spans = memory_exporter.get_finished_spans()
        events = spans[0].events
        assert any(e.name == "log" for e in events)
        logger.removeHandler(handler)

    def test_emit_without_active_span(self):
        handler = ObservabilityLogHandler()
        record = logging.LogRecord("test", logging.INFO, "", 0, "msg", (), None)
        handler.emit(record)  # Should not raise


# ---------------------------------------------------------------------------
# track_llm / track_tool / track_agent
# ---------------------------------------------------------------------------

class TestTrackContextManagers:
    def test_track_llm_when_not_initialized(self):
        with track_llm("model") as tracker:
            assert isinstance(tracker, _NoOpTracker)

    def test_track_llm_creates_span(self, initialized_sdk, tracer_provider, memory_exporter):
        with track_llm("gpt-4", model="gpt-4") as tracker:
            assert isinstance(tracker, _SpanTracker)
            tracker.set_input({"messages": [{"role": "user", "content": "hi"}]})
            tracker.set_output({"text": "hello"})

        spans = memory_exporter.get_finished_spans()
        assert len(spans) == 1
        assert spans[0].attributes["agentq.run_type"] == "llm"
        assert spans[0].attributes["gen_ai.request.model"] == "gpt-4"

    def test_track_tool_when_not_initialized(self):
        with track_tool("search") as tracker:
            assert isinstance(tracker, _NoOpTracker)

    def test_track_tool_creates_span(self, initialized_sdk, tracer_provider, memory_exporter):
        with track_tool("web-search") as tracker:
            assert isinstance(tracker, _SpanTracker)

        spans = memory_exporter.get_finished_spans()
        assert len(spans) == 1
        assert spans[0].attributes["agentq.run_type"] == "tool"

    def test_track_agent_when_not_initialized(self):
        with track_agent("my-agent") as tracker:
            assert isinstance(tracker, _NoOpTracker)

    def test_track_agent_creates_span(self, initialized_sdk, tracer_provider, memory_exporter):
        with track_agent("my-agent") as tracker:
            assert isinstance(tracker, _SpanTracker)

        spans = memory_exporter.get_finished_spans()
        assert len(spans) == 1
        assert spans[0].attributes["agentq.run_type"] == "agent"
        assert spans[0].attributes["agentq.agent_name"] == "my-agent"

    def test_track_llm_on_exception_records_error(self, initialized_sdk, tracer_provider, memory_exporter):
        with pytest.raises(ValueError):
            with track_llm("model") as tracker:
                raise ValueError("boom")

        spans = memory_exporter.get_finished_spans()
        assert spans[0].status.status_code.name == "ERROR"

    def test_extra_metadata(self, initialized_sdk, tracer_provider, memory_exporter):
        with track_llm("model", custom_key="custom_val"):
            pass
        spans = memory_exporter.get_finished_spans()
        assert spans[0].attributes.get("agentq.meta.custom_key") == "custom_val"


# ---------------------------------------------------------------------------
# session context manager / decorator
# ---------------------------------------------------------------------------

class TestSession:
    def test_session_as_context_manager(self, initialized_sdk, tracer_provider, memory_exporter):
        with session(session_id="sess-1"):
            with track_agent("my-agent") as tracker:
                pass

        spans = memory_exporter.get_finished_spans()
        assert spans[0].attributes.get("agentq.session.id") == "sess-1"

    def test_session_as_decorator(self, initialized_sdk, tracer_provider, memory_exporter):
        @session(session_id="sess-2")
        def my_func():
            with track_agent("decorated-agent"):
                pass

        my_func()
        spans = memory_exporter.get_finished_spans()
        assert spans[0].attributes.get("agentq.session.id") == "sess-2"

    def test_session_with_callable_resolvers(self, initialized_sdk, tracer_provider, memory_exporter):
        @session(session_id=lambda task_id, **_: task_id)
        def my_func(task_id: str):
            with track_agent("resolved-agent"):
                pass

        my_func("dynamic-id")
        spans = memory_exporter.get_finished_spans()
        assert spans[0].attributes.get("agentq.session.id") == "dynamic-id"


# ---------------------------------------------------------------------------
# @agent decorator
# ---------------------------------------------------------------------------

class TestAgentDecorator:
    def test_agent_function_when_not_initialized(self):
        @agent(name="my-agent")
        def my_func(x):
            return x * 2

        result = my_func(5)
        assert result == 10

    def test_agent_function_creates_span(self, initialized_sdk, tracer_provider, memory_exporter):
        @agent(name="traced-agent")
        def my_func(x):
            return x + 1

        # Need an active parent span for non-root to be recorded
        with session(session_id="s1"):
            result = my_func(5)

        assert result == 6
        spans = memory_exporter.get_finished_spans()
        agent_spans = [s for s in spans if s.attributes.get("agentq.agent_name") == "traced-agent"]
        assert len(agent_spans) >= 1

    def test_agent_class_decorator(self, initialized_sdk, tracer_provider, memory_exporter):
        @agent(name="class-agent", entry_method="execute")
        class MyAgent:
            def execute(self, prompt: str) -> str:
                return f"Result: {prompt}"

        a = MyAgent()
        with session(session_id="s2"):
            result = a.execute("hello")

        assert result == "Result: hello"

    def test_agent_decorator_on_non_callable_raises(self):
        with pytest.raises(TypeError, match="expects a class or function"):
            agent(name="bad")(42)

    def test_agent_function_failure_records_error(self, initialized_sdk, tracer_provider, memory_exporter):
        @agent(name="failing-agent")
        def failing_func():
            raise RuntimeError("intentional failure")

        with session(session_id="s3"):
            with pytest.raises(RuntimeError, match="intentional failure"):
                failing_func()

    def test_agent_preserves_function_attributes(self):
        @agent(name="named")
        def documented_func():
            """My docstring."""
            pass

        assert documented_func.__name__ == "documented_func"
        assert documented_func.__doc__ == "My docstring."
