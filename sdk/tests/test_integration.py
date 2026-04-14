"""Integration tests for agentq SDK — end-to-end flows."""

from __future__ import annotations

import json

import pytest
from opentelemetry import trace
from opentelemetry.trace import StatusCode

from agentq.instrumentation import (
    agent,
    session,
    track_llm,
    track_tool,
    track_agent,
    current_span,
    _current_agent,
    _current_session_id,
)


class TestEndToEndAgentRun:
    """Simulates a full agent run with nested LLM and tool calls."""

    def test_full_agent_workflow(self, init_agentq):
        """Agent -> LLM call -> Tool call -> return, all traced."""
        exporter = init_agentq

        @agent(name="planner-agent")
        def plan_and_execute(task):
            with track_llm("gpt-4", model="gpt-4") as llm:
                llm.set_input({"messages": [{"role": "user", "content": task}]})
                llm.set_output({"response": "Use web search"})

            with track_tool("web-search") as tool:
                tool.set_input({"query": task})
                tool.set_output({"results": ["result1", "result2"]})

            return "completed"

        result = plan_and_execute("find weather")
        assert result == "completed"

        spans = exporter.get_finished_spans()
        assert len(spans) == 3  # agent + llm + tool

        # Verify span hierarchy
        agent_span = [s for s in spans if s.attributes.get("agentq.run_type") == "agent"][0]
        llm_span = [s for s in spans if s.attributes.get("agentq.run_type") == "llm"][0]
        tool_span = [s for s in spans if s.attributes.get("agentq.run_type") == "tool"][0]

        # LLM and tool should be children of agent
        assert llm_span.parent.span_id == agent_span.context.span_id
        assert tool_span.parent.span_id == agent_span.context.span_id

        # All should be OK
        assert agent_span.status.status_code == StatusCode.OK
        assert llm_span.status.status_code == StatusCode.OK
        assert tool_span.status.status_code == StatusCode.OK

    def test_session_binds_to_all_spans(self, init_agentq):
        """Session context should propagate to all nested spans."""
        exporter = init_agentq

        with session(session_id="conversation-1", name="Chat Session"):
            @agent(name="chat-agent")
            def chat(msg):
                with track_llm("claude", model="claude-3"):
                    pass
                return "reply"

            chat("hello")

        spans = exporter.get_finished_spans()
        for span in spans:
            assert span.attributes.get("agentq.session.id") == "conversation-1"

    def test_nested_agents(self, init_agentq):
        """Agent calling another agent should create proper span hierarchy."""
        exporter = init_agentq

        @agent(name="inner-agent")
        def inner(task):
            return f"inner: {task}"

        @agent(name="outer-agent")
        def outer(task):
            return inner(task)

        result = outer("test")
        assert result == "inner: test"

        spans = exporter.get_finished_spans()
        assert len(spans) == 2

        inner_span = [s for s in spans if s.attributes.get("agentq.agent_name") == "inner-agent"][0]
        outer_span = [s for s in spans if s.attributes.get("agentq.agent_name") == "outer-agent"][0]

        assert inner_span.parent.span_id == outer_span.context.span_id

    def test_error_propagation(self, init_agentq):
        """Errors in agent should set span status and re-raise."""
        exporter = init_agentq

        @agent(name="error-agent")
        def failing_agent():
            with track_llm("gpt-4"):
                raise RuntimeError("API call failed")

        with pytest.raises(RuntimeError, match="API call failed"):
            failing_agent()

        spans = exporter.get_finished_spans()
        agent_span = [s for s in spans if s.attributes.get("agentq.run_type") == "agent"]
        llm_span = [s for s in spans if s.attributes.get("agentq.run_type") == "llm"]

        assert len(agent_span) == 1
        assert len(llm_span) == 1
        assert agent_span[0].status.status_code == StatusCode.ERROR
        assert llm_span[0].status.status_code == StatusCode.ERROR

    def test_current_span_enrichment(self, init_agentq):
        """current_span() inside an agent should allow enrichment."""
        exporter = init_agentq

        @agent(name="enrichment-agent")
        def enriched():
            span = current_span()
            assert span is not None
            span.metadata["custom_key"] = "custom_value"
            span.tags = ["production", "v2"]
            span.add_event({"type": "checkpoint", "step": 1})
            return "done"

        enriched()

        spans = exporter.get_finished_spans()
        agent_span = spans[0]
        assert agent_span.attributes.get("agentq.meta.custom_key") == "custom_value"

    def test_class_agent_with_session(self, init_agentq):
        """Class-based agent with session decorator."""
        exporter = init_agentq

        @agent(name="class-agent", entry_method="run")
        class MyAgent:
            def run(self, task):
                with track_llm("gpt-4", model="gpt-4"):
                    pass
                return f"result: {task}"

        a = MyAgent()

        with session(session_id="s1"):
            result = a.run("test")

        assert result == "result: test"
        spans = exporter.get_finished_spans()
        assert all(
            s.attributes.get("agentq.session.id") == "s1"
            for s in spans
        )

    def test_context_vars_clean_after_run(self, init_agentq):
        """Context variables should be properly reset after agent run."""
        @agent(name="ctx-agent")
        def my_agent():
            return "ok"

        with session(session_id="temp"):
            my_agent()

        assert _current_agent.get() is None

    def test_multiple_sequential_runs(self, init_agentq):
        """Multiple sequential agent runs should each create distinct traces."""
        exporter = init_agentq

        @agent(name="seq-agent")
        def my_agent(i):
            return i

        for i in range(3):
            my_agent(i)

        spans = exporter.get_finished_spans()
        assert len(spans) == 3
        # All should have different trace IDs (each is a root span)
        trace_ids = {s.context.trace_id for s in spans}
        assert len(trace_ids) == 3
