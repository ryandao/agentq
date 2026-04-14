"""Tests for agentq.frameworks.langchain_integration."""

from __future__ import annotations

import sys
from types import ModuleType
from unittest.mock import MagicMock, patch

import pytest

from agentq.frameworks import langchain_integration


class TestLangChainPatch:
    def test_patch_skips_when_not_installed(self):
        with patch.dict(sys.modules, {
            "langchain_core": None,
            "langchain_core.callbacks": None,
            "langchain_core.callbacks.manager": None,
        }):
            langchain_integration._patched = False
            result = langchain_integration.patch()
            assert result is False

    def test_patch_idempotent(self):
        langchain_integration._patched = True
        result = langchain_integration.patch()
        assert result is True

    def test_unpatch_when_not_patched(self):
        langchain_integration._patched = False
        langchain_integration.unpatch()

    def test_patch_with_mock_langchain(self):
        """Patch/unpatch cycle with mocked langchain_core module."""
        MockBaseHandler = type("BaseCallbackHandler", (), {})

        original_init = MagicMock()
        MockCallbackManager = type("CallbackManager", (), {
            "__init__": original_init,
            "handlers": [],
            "add_handler": MagicMock(),
        })

        mock_callbacks = ModuleType("langchain_core.callbacks")
        mock_callbacks.BaseCallbackHandler = MockBaseHandler

        mock_manager = ModuleType("langchain_core.callbacks.manager")
        mock_manager.CallbackManager = MockCallbackManager

        mock_globals = ModuleType("langchain_core.globals")
        mock_globals._configure_hooks = None
        mock_globals.set_verbose = MagicMock()

        mock_lc = ModuleType("langchain_core")

        langchain_integration._patched = False
        langchain_integration._state.clear()

        with patch.dict(sys.modules, {
            "langchain_core": mock_lc,
            "langchain_core.callbacks": mock_callbacks,
            "langchain_core.callbacks.manager": mock_manager,
            "langchain_core.globals": mock_globals,
        }):
            result = langchain_integration.patch()
            assert result is True
            assert langchain_integration._patched is True

            # Verify handler was created
            assert "handler" in langchain_integration._state

            langchain_integration.unpatch()
            assert langchain_integration._patched is False


class TestLangChainCallbackHandler:
    """Tests for the AgentQCallbackHandler."""

    def test_handler_instantiation(self):
        from agentq.frameworks._langchain_handler import AgentQCallbackHandler
        handler = AgentQCallbackHandler()
        assert handler._spans == {}

    def test_chain_start_and_end(self, init_agentq):
        """chain start/end should create and close a span."""
        from agentq.frameworks._langchain_handler import AgentQCallbackHandler
        from uuid import uuid4

        handler = AgentQCallbackHandler()
        run_id = uuid4()

        handler.on_chain_start(
            {"name": "TestChain", "id": ["TestChain"]},
            {"input": "hello"},
            run_id=run_id,
        )
        assert run_id in handler._spans

        handler.on_chain_end(
            {"output": "world"},
            run_id=run_id,
        )
        assert run_id not in handler._spans

    def test_llm_start_and_end(self, init_agentq):
        from agentq.frameworks._langchain_handler import AgentQCallbackHandler
        from uuid import uuid4

        handler = AgentQCallbackHandler()
        run_id = uuid4()

        handler.on_llm_start(
            {"name": "gpt-4", "kwargs": {"model_name": "gpt-4"}},
            ["Hello, world!"],
            run_id=run_id,
        )
        assert run_id in handler._spans

        handler.on_llm_end(
            MagicMock(llm_output={"token_usage": {"prompt_tokens": 10, "completion_tokens": 5}}),
            run_id=run_id,
        )
        assert run_id not in handler._spans

    def test_tool_start_and_end(self, init_agentq):
        from agentq.frameworks._langchain_handler import AgentQCallbackHandler
        from uuid import uuid4

        handler = AgentQCallbackHandler()
        run_id = uuid4()

        handler.on_tool_start(
            {"name": "web_search"},
            "search query",
            run_id=run_id,
        )
        assert run_id in handler._spans

        handler.on_tool_end("search results", run_id=run_id)
        assert run_id not in handler._spans

    def test_error_handling(self, init_agentq):
        from agentq.frameworks._langchain_handler import AgentQCallbackHandler
        from uuid import uuid4

        handler = AgentQCallbackHandler()
        run_id = uuid4()

        handler.on_chain_start(
            {"name": "FailChain"},
            {},
            run_id=run_id,
        )
        handler.on_chain_error(
            ValueError("boom"),
            run_id=run_id,
        )
        assert run_id not in handler._spans

    def test_retriever_callbacks(self, init_agentq):
        from agentq.frameworks._langchain_handler import AgentQCallbackHandler
        from uuid import uuid4

        handler = AgentQCallbackHandler()
        run_id = uuid4()

        handler.on_retriever_start(
            {"name": "VectorRetriever"},
            "what is AI?",
            run_id=run_id,
        )
        assert run_id in handler._spans

        handler.on_retriever_end(["doc1", "doc2"], run_id=run_id)
        assert run_id not in handler._spans
