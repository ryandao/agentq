"""Unit tests for agentq.integrations.langchain_patch."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from opentelemetry import trace

import agentq.registry as registry
from agentq.integrations import langchain_patch


class TestLangChainPatchWithoutLib:
    def test_patch_skips_if_not_installed(self):
        """patch() should silently skip if langchain-core is not installed."""
        langchain_patch._patched = False
        with patch.dict("sys.modules", {"langchain_core": None,
                                         "langchain_core.runnables": None,
                                         "langchain_core.runnables.base": None}):
            langchain_patch.patch()
        assert langchain_patch._patched is False

    def test_unpatch_when_not_patched(self):
        langchain_patch._patched = False
        langchain_patch.unpatch()  # should not raise


def _make_fake_obj(module: str, cls_name: str, **attrs):
    """Create a fake object with the given module and class name."""
    cls = type(cls_name, (), {"__module__": module})
    obj = cls()
    for k, v in attrs.items():
        setattr(obj, k, v)
    return obj


class TestLangChainDetection:
    def test_detect_run_type_agent(self):
        obj = _make_fake_obj("langchain.agents", "AgentExecutor")
        result = langchain_patch._detect_run_type(obj)
        assert result == "agent"

    def test_detect_run_type_tool(self):
        obj = _make_fake_obj("langchain.tools", "BaseTool")
        result = langchain_patch._detect_run_type(obj)
        assert result == "tool"

    def test_detect_run_type_llm(self):
        obj = _make_fake_obj("langchain.chat_models", "ChatOpenAI")
        result = langchain_patch._detect_run_type(obj)
        assert result == "llm"

    def test_detect_run_type_default(self):
        obj = _make_fake_obj("myapp", "CustomRunnable")
        result = langchain_patch._detect_run_type(obj)
        assert result == "agent"

    def test_detect_span_name_with_name(self):
        obj = _make_fake_obj("myapp", "Chain", name="MyChain")
        assert langchain_patch._detect_span_name(obj) == "MyChain"

    def test_detect_span_name_without_name(self):
        obj = _make_fake_obj("myapp", "CustomRunnable")
        assert langchain_patch._detect_span_name(obj) == "CustomRunnable"
