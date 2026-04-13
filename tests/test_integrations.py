"""Tests for framework integration classes.

Since the actual frameworks (langchain, crewai, etc.) are not installed
in the test environment, these tests verify the integration classes'
structure, activation/deactivation logic, and mock the framework imports.
"""

import sys
import types
from unittest.mock import MagicMock, patch

import pytest

from agentq.core import AgentQContext, AgentRun, AgentStatus
from agentq.integrations.base import FrameworkIntegration


# ---------------------------------------------------------------------------
# Base class tests
# ---------------------------------------------------------------------------

class TestFrameworkIntegrationBase:
    def test_abstract_methods(self):
        """FrameworkIntegration cannot be instantiated directly."""
        with pytest.raises(TypeError):
            FrameworkIntegration()

    def test_concrete_subclass(self):
        class MyIntegration(FrameworkIntegration):
            framework_name = "test"

            def _install_hooks(self):
                pass

            def _remove_hooks(self):
                pass

        integration = MyIntegration()
        assert not integration.active
        assert integration.framework_name == "test"

    def test_activate_deactivate(self):
        class MyIntegration(FrameworkIntegration):
            framework_name = "test"
            hooks_installed = False
            hooks_removed = False

            def _install_hooks(self):
                self.hooks_installed = True

            def _remove_hooks(self):
                self.hooks_removed = True

        ctx = AgentQContext()
        integration = MyIntegration()
        integration.activate(ctx)
        assert integration.active
        assert integration.hooks_installed

        integration.deactivate()
        assert not integration.active
        assert integration.hooks_removed

    def test_double_activate(self):
        class MyIntegration(FrameworkIntegration):
            framework_name = "test"
            install_count = 0

            def _install_hooks(self):
                self.install_count += 1

            def _remove_hooks(self):
                pass

        ctx = AgentQContext()
        integration = MyIntegration()
        integration.activate(ctx)
        integration.activate(ctx)  # should be no-op
        assert integration.install_count == 1

    def test_context_before_activation(self):
        class MyIntegration(FrameworkIntegration):
            framework_name = "test"

            def _install_hooks(self):
                pass

            def _remove_hooks(self):
                pass

        integration = MyIntegration()
        with pytest.raises(RuntimeError, match="used before activation"):
            _ = integration.context


# ---------------------------------------------------------------------------
# LangChain integration tests
# ---------------------------------------------------------------------------

class TestLangChainIntegration:
    def test_callback_handler_on_chain_lifecycle(self):
        from agentq.integrations.langchain_integration import (
            AgentQCallbackHandler,
            LangChainIntegration,
        )

        ctx = AgentQContext()
        ctx.init(auto_detect=False)
        integration = LangChainIntegration()
        integration._context = ctx
        integration._active = True

        handler = AgentQCallbackHandler(integration)

        # Simulate chain start
        handler.on_chain_start(
            serialized={"name": "test_chain", "id": ["chain", "test"]},
            inputs={"query": "hello"},
            run_id="run-1",
        )
        assert len(ctx.runs) == 1
        assert ctx.runs[0].agent_name == "test_chain"
        assert ctx.runs[0].framework == "langchain"

        # Simulate chain end
        handler.on_chain_end(outputs={"result": "world"}, run_id="run-1")
        assert ctx.runs[0].status == AgentStatus.COMPLETED

    def test_callback_handler_on_chain_error(self):
        from agentq.integrations.langchain_integration import (
            AgentQCallbackHandler,
            LangChainIntegration,
        )

        ctx = AgentQContext()
        ctx.init(auto_detect=False)
        integration = LangChainIntegration()
        integration._context = ctx
        integration._active = True

        handler = AgentQCallbackHandler(integration)
        handler.on_chain_start(
            serialized={"name": "fail_chain"},
            inputs={},
            run_id="run-2",
        )
        handler.on_chain_error(error=ValueError("oops"), run_id="run-2")
        assert ctx.runs[0].status == AgentStatus.ERRORED
        assert ctx.runs[0].error == "oops"

    def test_callback_handler_agent_action_step(self):
        from agentq.integrations.langchain_integration import (
            AgentQCallbackHandler,
            LangChainIntegration,
        )

        ctx = AgentQContext()
        ctx.init(auto_detect=False)
        steps = []
        ctx.on("on_step", lambda r, data: steps.append(data))

        integration = LangChainIntegration()
        integration._context = ctx
        integration._active = True

        handler = AgentQCallbackHandler(integration)
        handler.on_chain_start(
            serialized={"name": "agent"},
            inputs={},
            run_id="run-3",
        )

        action = MagicMock()
        action.tool = "search"
        action.tool_input = "query"
        handler.on_agent_action(action, run_id="run-3")

        assert len(steps) == 1
        assert steps[0]["tool"] == "search"


# ---------------------------------------------------------------------------
# CrewAI integration tests (mocked)
# ---------------------------------------------------------------------------

class TestCrewAIIntegration:
    def _setup_mock_crewai(self):
        """Create mock crewai module."""
        mock_crewai = types.ModuleType("crewai")

        class MockCrew:
            def __init__(self, name="TestCrew", agents=None, tasks=None):
                self.name = name
                self.agents = agents or []
                self.tasks = tasks or []

            def kickoff(self):
                return "crew_result"

        class MockAgent:
            def __init__(self, role="tester"):
                self.role = role

            def execute_task(self, task):
                return "task_done"

        mock_crewai.Crew = MockCrew
        mock_crewai.Agent = MockAgent
        sys.modules["crewai"] = mock_crewai
        return MockCrew, MockAgent

    def teardown_method(self):
        sys.modules.pop("crewai", None)

    def test_crew_kickoff_tracking(self):
        MockCrew, MockAgent = self._setup_mock_crewai()

        from agentq.integrations.crewai_integration import CrewAIIntegration

        ctx = AgentQContext()
        ctx.init(auto_detect=False)
        integration = CrewAIIntegration()
        integration.activate(ctx)

        crew = MockCrew(name="MyCrew", agents=[MockAgent("researcher")])
        result = crew.kickoff()

        assert result == "crew_result"
        assert len(ctx.runs) >= 1
        crew_runs = [r for r in ctx.runs if r.agent_name == "MyCrew"]
        assert len(crew_runs) == 1
        assert crew_runs[0].status == AgentStatus.COMPLETED

        integration.deactivate()

    def test_agent_execute_task_tracking(self):
        MockCrew, MockAgent = self._setup_mock_crewai()

        from agentq.integrations.crewai_integration import CrewAIIntegration

        ctx = AgentQContext()
        ctx.init(auto_detect=False)
        integration = CrewAIIntegration()
        integration.activate(ctx)

        agent = MockAgent(role="writer")
        mock_task = MagicMock()
        mock_task.description = "Write a report"
        result = agent.execute_task(mock_task)

        assert result == "task_done"
        agent_runs = [r for r in ctx.runs if "writer" in r.agent_name]
        assert len(agent_runs) == 1
        assert agent_runs[0].status == AgentStatus.COMPLETED

        integration.deactivate()

    def test_deactivate_restores_methods(self):
        MockCrew, MockAgent = self._setup_mock_crewai()
        original_kickoff = MockCrew.kickoff

        from agentq.integrations.crewai_integration import CrewAIIntegration

        ctx = AgentQContext()
        ctx.init(auto_detect=False)
        integration = CrewAIIntegration()
        integration.activate(ctx)
        assert MockCrew.kickoff is not original_kickoff

        integration.deactivate()
        assert MockCrew.kickoff is original_kickoff


# ---------------------------------------------------------------------------
# AutoGen integration tests (mocked)
# ---------------------------------------------------------------------------

class TestAutoGenIntegration:
    def _setup_mock_autogen(self):
        mock_autogen = types.ModuleType("autogen")

        class MockConversableAgent:
            def __init__(self, name="agent"):
                self.name = name

            def initiate_chat(self, recipient, message="hi"):
                return "chat_result"

            def generate_reply(self, messages=None, sender=None):
                return "reply"

        mock_autogen.ConversableAgent = MockConversableAgent
        sys.modules["autogen"] = mock_autogen
        return MockConversableAgent

    def teardown_method(self):
        sys.modules.pop("autogen", None)
        sys.modules.pop("pyautogen", None)

    def test_initiate_chat_tracking(self):
        MockAgent = self._setup_mock_autogen()

        from agentq.integrations.autogen_integration import AutoGenIntegration

        ctx = AgentQContext()
        ctx.init(auto_detect=False)
        integration = AutoGenIntegration()
        integration.activate(ctx)

        sender = MockAgent(name="assistant")
        recipient = MockAgent(name="user_proxy")
        result = sender.initiate_chat(recipient, message="Hello!")

        assert result == "chat_result"
        chat_runs = [r for r in ctx.runs if "assistant->user_proxy" in r.agent_name]
        assert len(chat_runs) == 1
        assert chat_runs[0].status == AgentStatus.COMPLETED

        integration.deactivate()

    def test_generate_reply_tracking(self):
        MockAgent = self._setup_mock_autogen()

        from agentq.integrations.autogen_integration import AutoGenIntegration

        ctx = AgentQContext()
        ctx.init(auto_detect=False)
        integration = AutoGenIntegration()
        integration.activate(ctx)

        agent = MockAgent(name="coder")
        result = agent.generate_reply()

        assert result == "reply"
        reply_runs = [r for r in ctx.runs if "coder" in r.agent_name]
        assert len(reply_runs) == 1

        integration.deactivate()

    def test_deactivate_restores(self):
        MockAgent = self._setup_mock_autogen()
        original = MockAgent.initiate_chat

        from agentq.integrations.autogen_integration import AutoGenIntegration

        ctx = AgentQContext()
        ctx.init(auto_detect=False)
        integration = AutoGenIntegration()
        integration.activate(ctx)
        integration.deactivate()
        assert MockAgent.initiate_chat is original


# ---------------------------------------------------------------------------
# LlamaIndex integration tests (mocked)
# ---------------------------------------------------------------------------

class TestLlamaIndexIntegration:
    def _setup_mock_llamaindex(self):
        # Build mock module hierarchy: llama_index.core.agent, llama_index.core.base.base_query_engine
        mock_li = types.ModuleType("llama_index")
        mock_li_core = types.ModuleType("llama_index.core")
        mock_li_core_agent = types.ModuleType("llama_index.core.agent")
        mock_li_core_base = types.ModuleType("llama_index.core.base")
        mock_li_core_base_bqe = types.ModuleType("llama_index.core.base.base_query_engine")

        class MockAgentRunner:
            _agent_name = "TestLlamaAgent"

            def chat(self, message, *args, **kwargs):
                return f"chat:{message}"

            def query(self, query, *args, **kwargs):
                return f"query:{query}"

        class MockBaseQueryEngine:
            def query(self, query, *args, **kwargs):
                return f"qe:{query}"

        mock_li_core_agent.AgentRunner = MockAgentRunner
        mock_li_core_base_bqe.BaseQueryEngine = MockBaseQueryEngine

        sys.modules["llama_index"] = mock_li
        sys.modules["llama_index.core"] = mock_li_core
        sys.modules["llama_index.core.agent"] = mock_li_core_agent
        sys.modules["llama_index.core.base"] = mock_li_core_base
        sys.modules["llama_index.core.base.base_query_engine"] = mock_li_core_base_bqe

        return MockAgentRunner, MockBaseQueryEngine

    def teardown_method(self):
        for mod in [
            "llama_index",
            "llama_index.core",
            "llama_index.core.agent",
            "llama_index.core.base",
            "llama_index.core.base.base_query_engine",
            "llama_index.core.callbacks",
        ]:
            sys.modules.pop(mod, None)

    def test_agent_chat_tracking(self):
        MockRunner, _ = self._setup_mock_llamaindex()

        from agentq.integrations.llamaindex_integration import LlamaIndexIntegration

        ctx = AgentQContext()
        ctx.init(auto_detect=False)
        integration = LlamaIndexIntegration()
        integration.activate(ctx)

        runner = MockRunner()
        result = runner.chat("hello world")

        assert result == "chat:hello world"
        assert len(ctx.runs) >= 1
        chat_runs = [r for r in ctx.runs if r.metadata.get("method") == "chat"]
        assert len(chat_runs) == 1
        assert chat_runs[0].status == AgentStatus.COMPLETED

        integration.deactivate()

    def test_agent_query_tracking(self):
        MockRunner, _ = self._setup_mock_llamaindex()

        from agentq.integrations.llamaindex_integration import LlamaIndexIntegration

        ctx = AgentQContext()
        ctx.init(auto_detect=False)
        integration = LlamaIndexIntegration()
        integration.activate(ctx)

        runner = MockRunner()
        result = runner.query("what is agentq?")

        assert result == "query:what is agentq?"
        query_runs = [r for r in ctx.runs if r.metadata.get("method") == "query"]
        assert len(query_runs) == 1

        integration.deactivate()

    def test_query_engine_tracking(self):
        _, MockQE = self._setup_mock_llamaindex()

        from agentq.integrations.llamaindex_integration import LlamaIndexIntegration

        ctx = AgentQContext()
        ctx.init(auto_detect=False)
        integration = LlamaIndexIntegration()
        integration.activate(ctx)

        qe = MockQE()
        result = qe.query("test query")

        assert result == "qe:test query"
        qe_runs = [r for r in ctx.runs if "llamaindex-query" in r.agent_name]
        assert len(qe_runs) == 1

        integration.deactivate()

    def test_deactivate_restores(self):
        MockRunner, MockQE = self._setup_mock_llamaindex()
        original_chat = MockRunner.chat

        from agentq.integrations.llamaindex_integration import LlamaIndexIntegration

        ctx = AgentQContext()
        ctx.init(auto_detect=False)
        integration = LlamaIndexIntegration()
        integration.activate(ctx)
        integration.deactivate()
        assert MockRunner.chat is original_chat


# ---------------------------------------------------------------------------
# OpenAI Agents SDK integration tests (mocked)
# ---------------------------------------------------------------------------

class TestOpenAIAgentsIntegration:
    def _setup_mock_openai_agents(self):
        mock_agents = types.ModuleType("agents")

        class MockRunner:
            @staticmethod
            async def run(agent, *args, **kwargs):
                return "async_run_result"

            @staticmethod
            def run_sync(agent, *args, **kwargs):
                return "sync_run_result"

        mock_agents.Runner = MockRunner
        sys.modules["agents"] = mock_agents
        return MockRunner

    def teardown_method(self):
        sys.modules.pop("agents", None)

    def test_run_sync_tracking(self):
        MockRunner = self._setup_mock_openai_agents()

        from agentq.integrations.openai_agents_integration import OpenAIAgentsIntegration

        ctx = AgentQContext()
        ctx.init(auto_detect=False)
        integration = OpenAIAgentsIntegration()
        integration.activate(ctx)

        mock_agent = MagicMock()
        mock_agent.name = "research_agent"
        mock_agent.model = "gpt-4"
        mock_agent.tools = []

        result = MockRunner.run_sync(mock_agent)

        assert result == "sync_run_result"
        runs = [r for r in ctx.runs if r.framework == "openai_agents"]
        assert len(runs) == 1
        assert runs[0].agent_name == "research_agent"
        assert runs[0].status == AgentStatus.COMPLETED

        integration.deactivate()

    @pytest.mark.asyncio
    async def test_run_async_tracking(self):
        MockRunner = self._setup_mock_openai_agents()

        from agentq.integrations.openai_agents_integration import OpenAIAgentsIntegration

        ctx = AgentQContext()
        ctx.init(auto_detect=False)
        integration = OpenAIAgentsIntegration()
        integration.activate(ctx)

        mock_agent = MagicMock()
        mock_agent.name = "async_agent"
        mock_agent.model = "gpt-4"
        mock_agent.tools = []

        result = await MockRunner.run(mock_agent)

        assert result == "async_run_result"
        runs = [r for r in ctx.runs if r.framework == "openai_agents"]
        assert len(runs) == 1
        assert runs[0].agent_name == "async_agent"

        integration.deactivate()

    def test_deactivate_restores(self):
        MockRunner = self._setup_mock_openai_agents()
        original_run_sync = MockRunner.run_sync

        from agentq.integrations.openai_agents_integration import OpenAIAgentsIntegration

        ctx = AgentQContext()
        ctx.init(auto_detect=False)
        integration = OpenAIAgentsIntegration()
        integration.activate(ctx)
        integration.deactivate()
        assert MockRunner.run_sync is original_run_sync
