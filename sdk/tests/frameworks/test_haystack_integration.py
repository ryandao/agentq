"""Tests for agentq.frameworks.haystack_integration."""

from __future__ import annotations

import sys
from types import ModuleType
from unittest.mock import MagicMock, patch

import pytest

from agentq.frameworks import haystack_integration


class TestHaystackPatch:
    def test_patch_skips_when_not_installed(self):
        with patch.dict(sys.modules, {"haystack": None, "haystack.pipeline": None}):
            haystack_integration._patched = False
            result = haystack_integration.patch()
            assert result is False

    def test_patch_idempotent(self):
        haystack_integration._patched = True
        result = haystack_integration.patch()
        assert result is True

    def test_unpatch_when_not_patched(self):
        haystack_integration._patched = False
        haystack_integration.unpatch()

    def test_patch_with_mock_haystack(self):
        original_run = MagicMock()

        MockPipeline = type("Pipeline", (), {
            "run": original_run,
        })

        mock_haystack = ModuleType("haystack")
        mock_haystack.Pipeline = MockPipeline

        haystack_integration._patched = False
        haystack_integration._originals.clear()

        with patch.dict(sys.modules, {"haystack": mock_haystack}):
            result = haystack_integration.patch()
            assert result is True
            assert MockPipeline.run is not original_run

            haystack_integration.unpatch()
            assert MockPipeline.run is original_run
