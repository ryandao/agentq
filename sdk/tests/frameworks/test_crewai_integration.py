"""Tests for agentq.frameworks.crewai_integration."""

from __future__ import annotations

import sys
from types import ModuleType
from unittest.mock import MagicMock, patch

import pytest

from agentq.frameworks import crewai_integration


class TestCrewAIPatch:
    def test_patch_skips_when_not_installed(self):
        with patch.dict(sys.modules, {"crewai": None}):
            crewai_integration._patched = False
            result = crewai_integration.patch()
            assert result is False
            assert crewai_integration._patched is False

    def test_patch_idempotent(self):
        crewai_integration._patched = True
        result = crewai_integration.patch()
        assert result is True

    def test_unpatch_when_not_patched(self):
        crewai_integration._patched = False
        crewai_integration.unpatch()  # Should not raise

    def test_patch_with_mock_crewai(self):
        """Full patch cycle with mocked crewai module."""
        original_kickoff = MagicMock()
        original_execute = MagicMock()

        MockCrew = type("Crew", (), {"kickoff": original_kickoff})
        MockAgent = type("Agent", (), {"execute_task": original_execute})
        MockTask = type("Task", (), {})

        mock_crewai = ModuleType("crewai")
        mock_crewai.Crew = MockCrew
        mock_crewai.Agent = MockAgent
        mock_crewai.Task = MockTask

        crewai_integration._patched = False
        crewai_integration._originals.clear()

        with patch.dict(sys.modules, {"crewai": mock_crewai}):
            result = crewai_integration.patch()
            assert result is True
            assert crewai_integration._patched is True

            # Verify methods were wrapped
            assert MockCrew.kickoff is not original_kickoff
            assert MockAgent.execute_task is not original_execute

            crewai_integration.unpatch()
            assert crewai_integration._patched is False
            assert MockCrew.kickoff is original_kickoff
            assert MockAgent.execute_task is original_execute


class TestCrewAIUnpatch:
    def test_unpatch_restores_originals(self):
        """After unpatch, original methods should be restored."""
        original_kickoff = MagicMock()
        MockCrew = type("Crew", (), {"kickoff": original_kickoff})
        MockAgent = type("Agent", (), {})
        MockTask = type("Task", (), {})

        mock_crewai = ModuleType("crewai")
        mock_crewai.Crew = MockCrew
        mock_crewai.Agent = MockAgent
        mock_crewai.Task = MockTask

        crewai_integration._patched = False
        crewai_integration._originals.clear()

        with patch.dict(sys.modules, {"crewai": mock_crewai}):
            crewai_integration.patch()
            assert MockCrew.kickoff is not original_kickoff

            crewai_integration.unpatch()
            assert MockCrew.kickoff is original_kickoff
