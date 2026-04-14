"""Tests for agentq.frameworks.llamaindex_integration."""

from __future__ import annotations

import sys
from types import ModuleType
from unittest.mock import MagicMock, patch

import pytest

from agentq.frameworks import llamaindex_integration


class TestLlamaIndexPatch:
    def test_patch_skips_when_not_installed(self):
        with patch.dict(sys.modules, {
            "llama_index": None,
            "llama_index.core": None,
            "llama_index.core.base": None,
            "llama_index.core.base.base_query_engine": None,
            "llama_index.core.query_engine": None,
        }):
            llamaindex_integration._patched = False
            result = llamaindex_integration.patch()
            assert result is False

    def test_patch_idempotent(self):
        llamaindex_integration._patched = True
        result = llamaindex_integration.patch()
        assert result is True

    def test_unpatch_when_not_patched(self):
        llamaindex_integration._patched = False
        llamaindex_integration.unpatch()

    def test_patch_with_mock_llamaindex(self):
        original_query = MagicMock()

        MockQueryEngine = type("BaseQueryEngine", (), {
            "query": original_query,
        })

        mock_qe_mod = ModuleType("llama_index.core.base.base_query_engine")
        mock_qe_mod.BaseQueryEngine = MockQueryEngine
        mock_base = ModuleType("llama_index.core.base")
        mock_core = ModuleType("llama_index.core")
        mock_li = ModuleType("llama_index")

        llamaindex_integration._patched = False
        llamaindex_integration._originals.clear()

        with patch.dict(sys.modules, {
            "llama_index": mock_li,
            "llama_index.core": mock_core,
            "llama_index.core.base": mock_base,
            "llama_index.core.base.base_query_engine": mock_qe_mod,
        }):
            result = llamaindex_integration.patch()
            assert result is True
            assert MockQueryEngine.query is not original_query

            llamaindex_integration.unpatch()
            assert MockQueryEngine.query is original_query
