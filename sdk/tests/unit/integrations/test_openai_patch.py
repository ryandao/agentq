"""Unit tests for agentq.integrations.openai_patch."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

from agentq.integrations.openai_patch import patch as openai_patch, unpatch


class TestOpenAIPatch:
    def test_patch_without_openai_installed(self):
        """patch() should silently skip if openai is not installed."""
        with patch.dict("sys.modules", {"openai": None, "openai.resources": None,
                                         "openai.resources.chat": None,
                                         "openai.resources.chat.completions": None}):
            openai_patch()  # should not raise

    def test_unpatch_when_not_patched(self):
        """unpatch() should be safe to call even if not patched."""
        unpatch()  # should not raise
