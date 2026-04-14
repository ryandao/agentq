"""Tests for agentq.integrations.openai_patch."""

from __future__ import annotations

import sys
from types import ModuleType
from unittest.mock import MagicMock, patch

import pytest

from agentq.integrations import openai_patch


class TestOpenAIPatch:
    def test_patch_skips_when_not_installed(self):
        """If openai is not installed, patch() should be a no-op."""
        with patch.dict(sys.modules, {"openai": None, "openai.resources.chat.completions": None}):
            openai_patch._patched = False
            openai_patch.patch()
            assert openai_patch._patched is False

    def test_patch_idempotent(self):
        """Calling patch() twice should be safe."""
        openai_patch._patched = True
        openai_patch.patch()  # Should return early
        assert openai_patch._patched is True

    def test_unpatch_when_not_patched(self):
        """unpatch() when not patched should be safe."""
        openai_patch._patched = False
        openai_patch._original_create = None
        openai_patch.unpatch()  # Should not raise

    def test_patch_and_unpatch_with_mock_module(self):
        """Full patch/unpatch cycle with mocked openai module."""
        # Create mock openai module structure
        mock_completions = MagicMock()
        original_create = MagicMock()
        mock_completions.Completions = type("Completions", (), {"create": original_create})

        mock_openai_module = ModuleType("openai")
        mock_resources = ModuleType("openai.resources")
        mock_chat = ModuleType("openai.resources.chat")
        mock_completions_mod = ModuleType("openai.resources.chat.completions")
        mock_completions_mod.Completions = mock_completions.Completions

        openai_patch._patched = False
        openai_patch._original_create = None

        with patch.dict(sys.modules, {
            "openai": mock_openai_module,
            "openai.resources": mock_resources,
            "openai.resources.chat": mock_chat,
            "openai.resources.chat.completions": mock_completions_mod,
        }):
            openai_patch.patch()
            assert openai_patch._patched is True
            assert openai_patch._original_create is original_create

            # Verify create was replaced
            assert mock_completions_mod.Completions.create is not original_create

            openai_patch.unpatch()
            assert openai_patch._patched is False
            assert mock_completions_mod.Completions.create is original_create
