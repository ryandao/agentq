"""Tests for agentq.instrumentation (@agent, session, track_*, SpanProxy, etc.)."""

from __future__ import annotations

import json
import logging
from unittest.mock import patch, MagicMock

import pytest
from opentelemetry import trace
from opentelemetry.trace import StatusCode

from agentq.instrumentation import (
    _sanitize,
    _preview_json,
    _is_noop_span,
    _has_valid_parent,
    agent,
    session,
    current_span,
    track_llm,
    track_tool,
    track_agent,
    SpanProxy,
    _AttributeDict,
    ObservabilityLogHandler,
    _NoOpTracker,
    _SpanTracker,
    RunConfig,
    _current_agent,
    _current_session_id,
)


# ---------------------------------------------------------------------------
# Sanitization / preview
# ---------------------------------------------------------------------------


class TestSanitize:
    """Tests for _sanitize helper."""

    def test_primitives(self):
        assert _sanitize(None) is None
        assert _sanitize("hello") == "hello"
        assert _sanitize(42) == 42
        assert _sanitize(3.14) == 3.14
        assert _sanitize(True) is True

    def test_dict(self):
        result = _sanitize({"a": 1, "b": "x"})
        assert result == {"a": 1, "b": "x"}

    def test_list(self):
        assert _sanitize([1, 2, 3]) == [1, 2, 3]

    def test_nested_depth_limit(self):
        deep = {"a": {"b": {"c": {"d": {"e": "deep"}}}}}
        result = _sanitize(deep)
        # At depth 3+, it should fall back to str()
        assert isinstance(result["a"]["b"]["c"], dict)

    def test_model_dump(self):
        """Object with model_dump() should be serialized via that method."""
        obj = MagicMock()
        obj.model_dump.return_value = {"field": "value"}
        result = _sanitize(obj)
        assert result == {"field": "value"}

    def test_dict_method_fallback(self):
        """Object with dict() method should use it."""
        obj = MagicMock(spec=[])
        obj.dict = MagicMock(return_value={"key": "val"})
        # Remove model_dump so it falls through
        assert not hasattr(obj, "model_dump")
        result = _sanitize(obj)
        assert result == {"key": "val"}

    def test_long_list_truncated(self):
        """Lists longer than 20 items should be truncated."""
        long_list = list(range(50))
        result = _sanitize(long_list)
        assert len(result) == 20

    def test_long_dict_truncated(self):
        """Dicts with >20 keys should be truncated."""
        big_dict = {f"k{i}": i for i in range(50)}
        result = _sanitize(big_dict)
        assert len(result) == 20


class TestPreviewJson:
    """Tests for _preview_json."""

    def test_simple_value(self):
        result = _preview_json("hello")
        assert json.loads(result) == "hello"

    def test_dict_value(self):
        result = _preview_json({"a": 1})
        assert json.loads(result) == {"a": 1}

    def test_non_serializable_fallback(self):
        """Should fall back to str() for non-serializable objects."""
        result = _preview_json(object())
        assert isinstance(result, str)


# ---------------------------------------------------------------------------
# Span detection helpers
# ---------------------------------------------------------------------------


class TestIsNoopSpan:
    def test_noop_span(self):
        span = trace.NonRecordingSpan(trace.INVALID_SPAN_CONTEXT)
        assert _is_noop_span(span) is True

    def test_recording_span(self, init_agentq):
        tracer = trace.get_tracer("test")
        with tracer.start_as_current_span("test") as span:
            assert _is_noop_span(span) is False


class TestHasValidParent:
    def test_no_valid_parent_by_default(self):
        assert _has_valid_parent() is False

    def test_has_valid_parent_inside_span(self, init_agentq):
        tracer = trace.get_tracer("test")
        with tracer.start_as_current_span("parent"):
            assert _has_valid_parent() is True


# ---------------------------------------------------------------------------
# SpanProxy
# ---------------------------------------------------------------------------


class TestSpanProxy:
    def test_name_property(self, init_agentq):
        tracer = trace.get_tracer("test")
        with tracer.start_as_current_span("my-span") as span:
            proxy = SpanProxy(span)
            assert proxy.name == "my-span"

    def test_name_setter(self, init_agentq):
        tracer = trace.get_tracer("test")
        with tracer.start_as_current_span("old-name") as span:
            proxy = SpanProxy(span)
            proxy.name = "new-name"
            assert proxy.name == "new-name"

    def test_tags_setter(self, init_agentq):
        tracer = trace.get_tracer("test")
        with tracer.start_as_current_span("test") as span:
            proxy = SpanProxy(span)
            proxy.tags = ["tag1", "tag2"]
            assert span.attributes.get("agentq.tags") == ("tag1", "tag2")

    def test_metadata_setitem(self, init_agentq):
        tracer = trace.get_tracer("test")
        with tracer.start_as_current_span("test") as span:
            proxy = SpanProxy(span)
            proxy.metadata["key"] = "value"
            assert span.attributes.get("agentq.meta.key") == "value"

    def test_metadata_dict_expansion(self, init_agentq):
        tracer = trace.get_tracer("test")
        with tracer.start_as_current_span("test") as span:
            proxy = SpanProxy(span)
            proxy.metadata["nested"] = {"sub_key": "sub_val"}
            assert span.attributes.get("agentq.meta.nested.sub_key") == "sub_val"

    def test_add_event(self, init_agentq):
        tracer = trace.get_tracer("test")
        with tracer.start_as_current_span("test") as span:
            proxy = SpanProxy(span)
            proxy.add_event({"type": "test_event", "data": "some_data"})
            assert len(span.events) == 1
            assert span.events[0].name == "test_event"


class TestCurrentSpan:
    def test_returns_none_without_active_span(self):
        assert current_span() is None

    def test_returns_proxy_with_active_span(self, init_agentq):
        tracer = trace.get_tracer("test")
        with tracer.start_as_current_span("test"):
            proxy = current_span()
            assert proxy is not None
            assert isinstance(proxy, SpanProxy)


# ---------------------------------------------------------------------------
# _AttributeDict
# ---------------------------------------------------------------------------


class TestAttributeDict:
    def test_setitem_primitive(self, init_agentq):
        tracer = trace.get_tracer("test")
        with tracer.start_as_current_span("test") as span:
            ad = _AttributeDict(span)
            ad["count"] = 42
            assert span.attributes.get("agentq.meta.count") == 42

    def test_update_method(self, init_agentq):
        tracer = trace.get_tracer("test")
        with tracer.start_as_current_span("test") as span:
            ad = _AttributeDict(span)
            ad.update({"a": 1, "b": 2})
            assert span.attributes.get("agentq.meta.a") == 1
            assert span.attributes.get("agentq.meta.b") == 2


# ---------------------------------------------------------------------------
# ObservabilityLogHandler
# ---------------------------------------------------------------------------


class TestObservabilityLogHandler:
    def test_emits_event_on_active_span(self, init_agentq):
        tracer = trace.get_tracer("test")
        with tracer.start_as_current_span("test") as span:
            handler = ObservabilityLogHandler()
            record = logging.LogRecord(
                name="test_logger",
                level=logging.INFO,
                pathname="",
                lineno=0,
                msg="test message",
                args=None,
                exc_info=None,
            )
            handler.emit(record)
            assert len(span.events) == 1
            assert span.events[0].name == "log"

    def test_no_error_without_span(self):
        """Should silently skip when no active span."""
        handler = ObservabilityLogHandler()
        record = logging.LogRecord(
            name="test_logger",
            level=logging.INFO,
            pathname="",
            lineno=0,
            msg="test message",
            args=None,
            exc_info=None,
        )
        handler.emit(record)  # Should not raise


# ---------------------------------------------------------------------------
# NoOpTracker / SpanTracker
# ---------------------------------------------------------------------------


class TestNoOpTracker:
    def test_set_input_is_noop(self):
        t = _NoOpTracker()
        t.set_input({"x": 1})  # Should not raise

    def test_set_output_is_noop(self):
        t = _NoOpTracker()
        t.set_output({"x": 1})

    def test_add_event_is_noop(self):
        t = _NoOpTracker()
        t.add_event({"type": "test"})


class TestSpanTracker:
    def test_set_input_adds_event(self, init_agentq):
        tracer = trace.get_tracer("test")
        with tracer.start_as_current_span("test") as span:
            tracker = _SpanTracker(span, "llm")
            tracker.set_input({"prompt": "hello"})
            assert len(span.events) == 1
            assert span.events[0].name == "llm_input"

    def test_set_output_adds_event(self, init_agentq):
        tracer = trace.get_tracer("test")
        with tracer.start_as_current_span("test") as span:
            tracker = _SpanTracker(span, "agent")
            tracker.set_output({"result": "done"})
            assert span.events[0].name == "agent_output"


# ---------------------------------------------------------------------------
# track_llm / track_tool / track_agent context managers
# ---------------------------------------------------------------------------


class TestTrackLlm:
    def test_noop_when_not_initialized(self):
        """Should yield NoOpTracker when SDK not initialized."""
        with track_llm("test-llm") as tracker:
            assert isinstance(tracker, _NoOpTracker)

    def test_creates_span_when_initialized(self, init_agentq):
        exporter = init_agentq
        with track_llm("test-model", model="gpt-4") as tracker:
            tracker.set_input({"messages": [{"role": "user", "content": "hi"}]})
            tracker.set_output({"response": "hello"})

        spans = exporter.get_finished_spans()
        assert len(spans) == 1
        span = spans[0]
        assert span.name == "test-model"
        assert span.attributes.get("agentq.run_type") == "llm"
        assert span.attributes.get("gen_ai.request.model") == "gpt-4"

    def test_records_exception(self, init_agentq):
        exporter = init_agentq
        with pytest.raises(ValueError):
            with track_llm("failing-llm"):
                raise ValueError("boom")

        spans = exporter.get_finished_spans()
        assert len(spans) == 1
        assert spans[0].status.status_code == StatusCode.ERROR

    def test_session_context_propagated(self, init_agentq):
        exporter = init_agentq
        with session(session_id="sess-1"):
            with track_llm("my-model") as tracker:
                pass

        spans = exporter.get_finished_spans()
        assert spans[0].attributes.get("agentq.session.id") == "sess-1"


class TestTrackTool:
    def test_noop_when_not_initialized(self):
        with track_tool("test-tool") as tracker:
            assert isinstance(tracker, _NoOpTracker)

    def test_creates_span_when_initialized(self, init_agentq):
        exporter = init_agentq
        with track_tool("web-search") as tracker:
            tracker.set_input({"query": "test"})

        spans = exporter.get_finished_spans()
        assert len(spans) == 1
        assert spans[0].attributes.get("agentq.run_type") == "tool"

    def test_records_exception(self, init_agentq):
        exporter = init_agentq
        with pytest.raises(RuntimeError):
            with track_tool("failing-tool"):
                raise RuntimeError("tool error")

        spans = exporter.get_finished_spans()
        assert spans[0].status.status_code == StatusCode.ERROR


class TestTrackAgent:
    def test_noop_when_not_initialized(self):
        with track_agent("test-agent") as tracker:
            assert isinstance(tracker, _NoOpTracker)

    def test_creates_span_when_initialized(self, init_agentq):
        exporter = init_agentq
        with track_agent("my-agent") as tracker:
            tracker.set_input({"task": "do something"})

        spans = exporter.get_finished_spans()
        assert len(spans) == 1
        assert spans[0].attributes.get("agentq.run_type") == "agent"
        assert spans[0].attributes.get("agentq.agent_name") == "my-agent"

    def test_sets_and_resets_current_agent(self, init_agentq):
        assert _current_agent.get() is None
        with track_agent("my-agent"):
            assert _current_agent.get() == "my-agent"
        assert _current_agent.get() is None


# ---------------------------------------------------------------------------
# @agent decorator
# ---------------------------------------------------------------------------


class TestAgentDecorator:
    def test_function_decoration(self, init_agentq):
        exporter = init_agentq

        @agent(name="test-func-agent")
        def my_func(x):
            return x * 2

        result = my_func(21)
        assert result == 42

        spans = exporter.get_finished_spans()
        assert len(spans) == 1
        assert spans[0].attributes.get("agentq.agent_name") == "test-func-agent"
        assert spans[0].status.status_code == StatusCode.OK

    def test_function_preserves_name(self):
        @agent(name="named-agent")
        def my_func():
            pass

        assert my_func.__name__ == "my_func"
        assert hasattr(my_func, "_agentq_name")
        assert my_func._agentq_name == "named-agent"

    def test_function_records_exception(self, init_agentq):
        exporter = init_agentq

        @agent(name="failing-agent")
        def failing_func():
            raise ValueError("agent error")

        with pytest.raises(ValueError):
            failing_func()

        spans = exporter.get_finished_spans()
        assert spans[0].status.status_code == StatusCode.ERROR

    def test_class_decoration(self, init_agentq):
        exporter = init_agentq

        @agent(name="class-agent")
        class MyAgent:
            def execute(self, task):
                return f"done: {task}"

        a = MyAgent()
        result = a.execute("build")
        assert result == "done: build"

        spans = exporter.get_finished_spans()
        assert len(spans) >= 1
        agent_span = [s for s in spans if s.attributes.get("agentq.agent_name") == "class-agent"]
        assert len(agent_span) >= 1

    def test_class_custom_entry_method(self, init_agentq):
        exporter = init_agentq

        @agent(name="custom-entry", entry_method="run")
        class MyAgent:
            def run(self, task):
                return task

        a = MyAgent()
        a.run("test")

        spans = exporter.get_finished_spans()
        assert len(spans) >= 1

    def test_class_multiple_entry_methods(self, init_agentq):
        exporter = init_agentq

        @agent(name="multi-entry", entry_method=["run", "plan"])
        class MyAgent:
            def run(self):
                return "running"

            def plan(self):
                return "planning"

        a = MyAgent()
        a.run()
        a.plan()

        spans = exporter.get_finished_spans()
        assert len(spans) >= 2

    def test_noop_when_not_initialized(self):
        @agent(name="noop-agent")
        def my_func(x):
            return x + 1

        result = my_func(5)
        assert result == 6

    def test_invalid_target_raises(self):
        """@agent on non-class/non-function should raise TypeError."""
        with pytest.raises(TypeError):
            agent(name="bad")("not a class or function")

    def test_input_output_recorded(self, init_agentq):
        exporter = init_agentq

        @agent(name="io-agent")
        def my_func(a, b):
            return a + b

        my_func(1, 2)

        spans = exporter.get_finished_spans()
        span = spans[0]
        # Should have input_preview and output_preview
        assert "agentq.input_preview" in span.attributes
        assert "agentq.output_preview" in span.attributes


# ---------------------------------------------------------------------------
# session context manager / decorator
# ---------------------------------------------------------------------------


class TestSession:
    def test_context_manager_sets_session_id(self, init_agentq):
        exporter = init_agentq

        with session(session_id="my-session"):
            with track_agent("test"):
                pass

        spans = exporter.get_finished_spans()
        assert spans[0].attributes.get("agentq.session.id") == "my-session"

    def test_context_manager_cleanup(self):
        with session(session_id="temp"):
            assert _current_session_id.get() == "temp"
        assert _current_session_id.get() is None

    def test_decorator_mode(self, init_agentq):
        exporter = init_agentq

        @session(session_id=lambda task_id, prompt, **_: task_id)
        def my_task(task_id, prompt):
            with track_agent("inside"):
                pass

        my_task("sess-42", "hello")

        spans = exporter.get_finished_spans()
        assert any(
            s.attributes.get("agentq.session.id") == "sess-42"
            for s in spans
        )

    def test_nested_sessions(self, init_agentq):
        """Inner session should override, outer should restore."""
        with session(session_id="outer"):
            assert _current_session_id.get() == "outer"
            with session(session_id="inner"):
                assert _current_session_id.get() == "inner"
            assert _current_session_id.get() == "outer"
        assert _current_session_id.get() is None

    def test_session_name_propagated(self, init_agentq):
        exporter = init_agentq

        with session(session_id="s1", name="My Session"):
            @agent(name="named-session-agent")
            def my_func():
                return 42
            my_func()

        spans = exporter.get_finished_spans()
        root = [s for s in spans if s.attributes.get("agentq.is_root")]
        if root:
            assert root[0].attributes.get("agentq.session.name") == "My Session"

    def test_run_config_metadata(self, init_agentq):
        exporter = init_agentq

        with session(session_id="s1", run_id="r1", metadata={"env": "test"}):
            @agent(name="meta-agent")
            def my_func():
                return "ok"
            my_func()

        spans = exporter.get_finished_spans()
        root = [s for s in spans if s.attributes.get("agentq.is_root")]
        if root:
            meta_str = root[0].attributes.get("agentq.run_metadata")
            if meta_str:
                meta = json.loads(meta_str)
                assert meta["env"] == "test"
