"""Unit tests for agentq.integrations.llamaindex_patch."""

from __future__ import annotations

from unittest.mock import patch

from agentq.integrations import llamaindex_patch


class TestLlamaIndexPatchWithoutLib:
    def test_patch_skips_if_not_installed(self):
        llamaindex_patch._patched = False
        with patch.dict("sys.modules", {
            "llama_index": None,
            "llama_index.core": None,
            "llama_index.core.base": None,
            "llama_index.core.base.base_query_engine": None,
            "llama_index.core.base.base_chat_engine": None,
        }):
            llamaindex_patch.patch()
        assert llamaindex_patch._patched is False

    def test_unpatch_when_not_patched(self):
        llamaindex_patch._patched = False
        llamaindex_patch.unpatch()  # should not raise
