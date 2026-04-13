"""Unit tests for agentq.integrations.crewai_patch."""

from __future__ import annotations

from unittest.mock import patch

from agentq.integrations import crewai_patch


class TestCrewAIPatchWithoutLib:
    def test_patch_skips_if_not_installed(self):
        crewai_patch._patched = False
        with patch.dict("sys.modules", {"crewai": None}):
            crewai_patch.patch()
        assert crewai_patch._patched is False

    def test_unpatch_when_not_patched(self):
        crewai_patch._patched = False
        crewai_patch.unpatch()  # should not raise
