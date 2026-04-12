"""Tests for framework adapters.

Since the actual frameworks may not be installed in the test environment,
these tests use mock classes to verify the adapter patching and event
emission logic.
"""

import sys
from types import ModuleType
from unittest.mock import MagicMock, patch

import pytest

from agentq_sdk.adapters.base import AgentEvent, BaseAdapter, EventPayload
from agentq_sdk.adapters.langchain import LangChainAdapter
from agentq_sdk.adapters.crewai import CrewAIAdapter
from agentq_sdk.adapters.autogen import AutoGenAdapter
from agentq_sdk.adapters.llamaindex import LlamaIndexAdapter


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _collect_events(adapter: BaseAdapter) -> list[EventPayload]:
    """Register a handler that collects events and return the list."""
    events: list[EventPayload] = []
    adapter.on_event(lambda p: events.append(p))
    return events


def _make_fake_module(name: str, classes: dict[str, type] | None = None) -> ModuleType:
    """Create a fake module and register it in sys.modules."""
    mod = ModuleType(name)
    mod.__version__ = "0.0.0-fake"  # type: ignore[attr-defined]
    if classes:
        for cls_name, cls in classes.items():
            setattr(mod, cls_name, cls)
    sys.modules[name] = mod
    return mod


# ---------------------------------------------------------------------------
# BaseAdapter tests
# ---------------------------------------------------------------------------


class TestBaseAdapter:
    def test_event_emission(self):
        class ConcreteAdapter(BaseAdapter):
            def patch(self): pass
            def unpatch(self): pass
            def wrap_agent(self, agent, agent_id=None): return agent

        adapter = ConcreteAdapter()
        events = _collect_events(adapter)
        adapter.emit_event(AgentEvent.AGENT_START, "test-agent", "run-1", input="hello")
        assert len(events) == 1
        assert events[0].event == AgentEvent.AGENT_START
        assert events[0].agent_id == "test-agent"
        assert events[0].data["input"] == "hello"

    def test_agent_id_derivation(self):
        class ConcreteAdapter(BaseAdapter):
            def patch(self): pass
            def unpatch(self): pass
            def wrap_agent(self, agent, agent_id=None): return agent

        adapter = ConcreteAdapter()

        # Explicit id
        assert adapter._agent_id_for(object(), "my-id") == "my-id"

        # From agent.name attribute
        agent = MagicMock()
        agent.name = "agent-bob"
        assert adapter._agent_id_for(agent) == "agent-bob"

    def test_generate_run_id(self):
        rid = BaseAdapter.generate_run_id()
        assert isinstance(rid, str)
        assert len(rid) == 36  # UUID format

    def test_event_handler_exception_does_not_propagate(self):
        class ConcreteAdapter(BaseAdapter):
            def patch(self): pass
            def unpatch(self): pass
            def wrap_agent(self, agent, agent_id=None): return agent

        adapter = ConcreteAdapter()
        adapter.on_event(lambda p: (_ for _ in ()).throw(RuntimeError("boom")))
        # Should not raise
        adapter.emit_event(AgentEvent.AGENT_START, "a", "r")


# ---------------------------------------------------------------------------
# LangChain adapter tests
# ---------------------------------------------------------------------------


class TestLangChainAdapter:
    def test_patch_and_unpatch_with_mock(self):
        """Verify patching wraps the invoke method and unpatching restores it."""

        class FakeAgentExecutor:
            def invoke(self, input_data):
                return {"output": "result"}

            def ainvoke(self, input_data):
                return {"output": "result"}

        # Create mock modules
        fake_agents = _make_fake_module("langchain.agents")
        fake_agents.AgentExecutor = FakeAgentExecutor
        _make_fake_module("langchain")

        try:
            original_invoke = FakeAgentExecutor.invoke
            adapter = LangChainAdapter()
            events = _collect_events(adapter)

            adapter.patch()
            assert adapter.is_patched

            # After patching, invoke should be wrapped
            assert FakeAgentExecutor.invoke is not original_invoke

            # Call the wrapped method
            executor = FakeAgentExecutor()
            result = FakeAgentExecutor.invoke(executor, {"input": "test"})
            assert result == {"output": "result"}
            assert len(events) == 2  # AGENT_START + AGENT_END

            # Unpatch restores original
            adapter.unpatch()
            assert not adapter.is_patched
        finally:
            sys.modules.pop("langchain.agents", None)
            sys.modules.pop("langchain", None)

    def test_wrap_agent_tags_with_id(self):
        """wrap_agent should tag the agent with _agentq_id for tracking."""
        adapter = LangChainAdapter()

        class FakeAgent:
            name = "test-agent"

        agent = FakeAgent()
        result = adapter.wrap_agent(agent, agent_id="my-agent")
        assert result is agent
        assert agent._agentq_id == "my-agent"
        assert "my-agent" in adapter._wrapped_agents

    def test_error_handling(self):
        """Verify AGENT_ERROR event is emitted on exception."""

        class FailingExecutor:
            def invoke(self, input_data):
                raise ValueError("test error")

        fake_agents = _make_fake_module("langchain.agents")
        fake_agents.AgentExecutor = FailingExecutor
        _make_fake_module("langchain")

        try:
            adapter = LangChainAdapter()
            events = _collect_events(adapter)
            adapter.patch()

            executor = FailingExecutor()
            with pytest.raises(ValueError, match="test error"):
                FailingExecutor.invoke(executor, {"input": "test"})

            error_events = [e for e in events if e.event == AgentEvent.AGENT_ERROR]
            assert len(error_events) == 1
            assert "test error" in error_events[0].data["error"]

            adapter.unpatch()
        finally:
            sys.modules.pop("langchain.agents", None)
            sys.modules.pop("langchain", None)


# ---------------------------------------------------------------------------
# CrewAI adapter tests
# ---------------------------------------------------------------------------


class TestCrewAIAdapter:
    def test_patch_and_unpatch_with_mock(self):
        class FakeCrew:
            name = "test-crew"

            def kickoff(self):
                return "crew result"

        class FakeAgent:
            name = "test-agent"

            def execute_task(self, task):
                return "task result"

        class FakeTask:
            name = "test-task"

            def execute_sync(self):
                return "sync result"

        fake_crewai = _make_fake_module("crewai")
        fake_crewai.Crew = FakeCrew
        fake_crewai.Agent = FakeAgent
        fake_crewai.Task = FakeTask

        try:
            adapter = CrewAIAdapter()
            events = _collect_events(adapter)
            adapter.patch()
            assert adapter.is_patched

            crew = FakeCrew()
            result = FakeCrew.kickoff(crew)
            assert result == "crew result"
            assert any(e.event == AgentEvent.AGENT_START for e in events)
            assert any(e.event == AgentEvent.AGENT_END for e in events)

            adapter.unpatch()
            assert not adapter.is_patched
        finally:
            sys.modules.pop("crewai", None)


# ---------------------------------------------------------------------------
# AutoGen adapter tests
# ---------------------------------------------------------------------------


class TestAutoGenAdapter:
    def test_patch_and_unpatch_with_mock(self):
        class FakeConversableAgent:
            name = "test-agent"

            def initiate_chat(self, recipient, message):
                return "chat result"

            def generate_reply(self, messages=None, sender=None):
                return "reply"

        fake_autogen = _make_fake_module("autogen")
        fake_autogen.ConversableAgent = FakeConversableAgent
        fake_autogen.GroupChat = type("GroupChat", (), {})

        try:
            adapter = AutoGenAdapter()
            events = _collect_events(adapter)
            adapter.patch()
            assert adapter.is_patched

            agent = FakeConversableAgent()
            result = FakeConversableAgent.initiate_chat(agent, "other", "hello")
            assert result == "chat result"
            assert any(e.event == AgentEvent.AGENT_START for e in events)

            adapter.unpatch()
            assert not adapter.is_patched
        finally:
            sys.modules.pop("autogen", None)


# ---------------------------------------------------------------------------
# LlamaIndex adapter tests
# ---------------------------------------------------------------------------


class TestLlamaIndexAdapter:
    def test_patch_and_unpatch_with_mock(self):
        class FakeAgentRunner:
            name = "test-runner"

            def chat(self, message):
                return "chat response"

            def query(self, query_str):
                return "query response"

        class FakeReActAgent:
            name = "test-react"

            def chat(self, message):
                return "react chat"

        # Build nested module structure
        core_agent_runner = _make_fake_module("llama_index.core.agent.runner")
        core_agent_runner.AgentRunner = FakeAgentRunner

        core_agent = _make_fake_module("llama_index.core.agent")
        core_agent.ReActAgent = FakeReActAgent
        core_agent.runner = core_agent_runner

        _make_fake_module("llama_index.core")
        _make_fake_module("llama_index")

        try:
            adapter = LlamaIndexAdapter()
            events = _collect_events(adapter)
            adapter.patch()
            assert adapter.is_patched

            runner = FakeAgentRunner()
            result = FakeAgentRunner.chat(runner, "hello")
            assert result == "chat response"
            assert any(e.event == AgentEvent.AGENT_START for e in events)

            adapter.unpatch()
            assert not adapter.is_patched
        finally:
            for key in list(sys.modules.keys()):
                if key.startswith("llama_index"):
                    del sys.modules[key]


# ---------------------------------------------------------------------------
# Integration: all adapters have consistent interface
# ---------------------------------------------------------------------------


class TestAdapterInterface:
    """Verify all adapters share the expected interface."""

    @pytest.mark.parametrize(
        "adapter_cls",
        [LangChainAdapter, CrewAIAdapter, AutoGenAdapter, LlamaIndexAdapter],
    )
    def test_has_required_methods(self, adapter_cls):
        adapter = adapter_cls()
        assert hasattr(adapter, "patch")
        assert hasattr(adapter, "unpatch")
        assert hasattr(adapter, "wrap_agent")
        assert hasattr(adapter, "on_event")
        assert hasattr(adapter, "emit_event")
        assert hasattr(adapter, "is_patched")
        assert adapter.is_patched is False

    @pytest.mark.parametrize(
        "adapter_cls",
        [LangChainAdapter, CrewAIAdapter, AutoGenAdapter, LlamaIndexAdapter],
    )
    def test_is_base_adapter_subclass(self, adapter_cls):
        assert issubclass(adapter_cls, BaseAdapter)
