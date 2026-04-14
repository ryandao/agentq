"""Tests for agentq.integrations.anthropic_patch."""

from __future__ import annotations

import sys
from types import ModuleType
from unittest.mock import MagicMock, patch

import pytest

from agentq.integrations import anthropic_patch


class TestAnthropicPatch:
    def test_patch_skips_when_not_installed(self):
        """If anthropic is not installed, patch() should be a no-op."""
        with patch.dict(sys.modules, {"anthropic": None, "anthropic.resources.messages": None}):
            anthropic_patch._patched = False
            anthropic_patch.patch()
            assert anthropic_patch._patched is False

    def test_patch_idempotent(self):
        anthropic_patch._patched = True
        anthropic_patch.patch()
        assert anthropic_patch._patched is True

    def test_unpatch_when_not_patched(self):
        anthropic_patch._patched = False
        anthropic_patch._original_create = None
        anthropic_patch.unpatch()

    def test_patch_and_unpatch_with_mock_module(self):
        """Full patch/unpatch cycle with mocked anthropic module."""
        original_create = MagicMock()
        mock_messages_cls = type("Messages", (), {"create": original_create})

        mock_anthropic_mod = ModuleType("anthropic")
        mock_resources = ModuleType("anthropic.resources")
        mock_messages_mod = ModuleType("anthropic.resources.messages")
        mock_messages_mod.Messages = mock_messages_cls

        anthropic_patch._patched = False
        anthropic_patch._original_create = None

        with patch.dict(sys.modules, {
            "anthropic": mock_anthropic_mod,
            "anthropic.resources": mock_resources,
            "anthropic.resources.messages": mock_messages_mod,
        }):
            anthropic_patch.patch()
            assert anthropic_patch._patched is True
            assert anthropic_patch._original_create is original_create
            assert mock_messages_mod.Messages.create is not original_create

            anthropic_patch.unpatch()
            assert anthropic_patch._patched is False
            assert mock_messages_mod.Messages.create is original_create
