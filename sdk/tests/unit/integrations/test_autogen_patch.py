"""Unit tests for agentq.integrations.autogen_patch."""

from __future__ import annotations

from unittest.mock import patch

from agentq.integrations import autogen_patch


class TestAutoGenPatchWithoutLib:
    def test_patch_skips_if_not_installed(self):
        autogen_patch._patched = False
        with patch.dict("sys.modules", {"autogen": None}):
            autogen_patch.patch()
        assert autogen_patch._patched is False

    def test_unpatch_when_not_patched(self):
        autogen_patch._patched = False
        autogen_patch.unpatch()  # should not raise
