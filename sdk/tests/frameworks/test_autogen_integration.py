"""Tests for agentq.frameworks.autogen_integration."""

from __future__ import annotations

import sys
from types import ModuleType
from unittest.mock import MagicMock, patch

import pytest

from agentq.frameworks import autogen_integration


class TestAutoGenPatch:
    def test_patch_skips_when_not_installed(self):
        with patch.dict(sys.modules, {"autogen": None, "autogen_agentchat": None, "autogen_agentchat.agents": None}):
            autogen_integration._patched = False
            result = autogen_integration.patch()
            assert result is False

    def test_patch_idempotent(self):
        autogen_integration._patched = True
        result = autogen_integration.patch()
        assert result is True

    def test_unpatch_when_not_patched(self):
        autogen_integration._patched = False
        autogen_integration.unpatch()

    def test_patch_with_mock_autogen(self):
        original_reply = MagicMock()
        original_chat = MagicMock()

        MockAgent = type("ConversableAgent", (), {
            "generate_reply": original_reply,
            "initiate_chat": original_chat,
        })

        mock_autogen = ModuleType("autogen")
        mock_autogen.ConversableAgent = MockAgent

        autogen_integration._patched = False
        autogen_integration._originals.clear()

        with patch.dict(sys.modules, {"autogen": mock_autogen}):
            result = autogen_integration.patch()
            assert result is True
            assert MockAgent.generate_reply is not original_reply
            assert MockAgent.initiate_chat is not original_chat

            autogen_integration.unpatch()
            assert MockAgent.generate_reply is original_reply
            assert MockAgent.initiate_chat is original_chat

    def test_patch_with_autogen_agentchat(self):
        """Should also work with autogen-agentchat package."""
        original_reply = MagicMock()

        MockAgent = type("ConversableAgent", (), {
            "generate_reply": original_reply,
        })

        mock_agents_mod = ModuleType("autogen_agentchat.agents")
        mock_agents_mod.ConversableAgent = MockAgent
        mock_agentchat = ModuleType("autogen_agentchat")

        autogen_integration._patched = False
        autogen_integration._originals.clear()

        with patch.dict(sys.modules, {
            "autogen": None,
            "autogen_agentchat": mock_agentchat,
            "autogen_agentchat.agents": mock_agents_mod,
        }):
            result = autogen_integration.patch()
            assert result is True

            autogen_integration.unpatch()
