"""Tests for agentq.integrations.gemini_patch."""

from __future__ import annotations

import sys
from types import ModuleType
from unittest.mock import MagicMock, patch

import pytest

from agentq.integrations import gemini_patch


class TestGeminiPatch:
    def test_patch_skips_when_not_installed(self):
        with patch.dict(sys.modules, {"google": None, "google.genai": None, "google.genai.models": None}):
            gemini_patch._patched = False
            gemini_patch.patch()
            assert gemini_patch._patched is False

    def test_patch_idempotent(self):
        gemini_patch._patched = True
        gemini_patch.patch()
        assert gemini_patch._patched is True

    def test_unpatch_when_not_patched(self):
        gemini_patch._patched = False
        gemini_patch._original_generate = None
        gemini_patch.unpatch()

    def test_patch_and_unpatch_with_mock_module(self):
        original_generate = MagicMock()
        mock_models_cls = type("Models", (), {"generate_content": original_generate})

        mock_google = ModuleType("google")
        mock_genai = ModuleType("google.genai")
        mock_models_mod = ModuleType("google.genai.models")
        mock_models_mod.Models = mock_models_cls

        gemini_patch._patched = False
        gemini_patch._original_generate = None

        with patch.dict(sys.modules, {
            "google": mock_google,
            "google.genai": mock_genai,
            "google.genai.models": mock_models_mod,
        }):
            gemini_patch.patch()
            assert gemini_patch._patched is True
            assert gemini_patch._original_generate is original_generate
            assert mock_models_mod.Models.generate_content is not original_generate

            gemini_patch.unpatch()
            assert gemini_patch._patched is False
            assert mock_models_mod.Models.generate_content is original_generate
