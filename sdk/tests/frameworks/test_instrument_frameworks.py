"""Tests for agentq.frameworks.instrument_frameworks."""

from __future__ import annotations

from unittest.mock import patch, MagicMock

import pytest

from agentq.frameworks import instrument_frameworks


class TestInstrumentFrameworks:
    def test_returns_empty_when_no_frameworks(self):
        """When no frameworks are installed, should return empty list."""
        with (
            patch("agentq.frameworks.langchain_integration.patch", return_value=False),
            patch("agentq.frameworks.crewai_integration.patch", return_value=False),
            patch("agentq.frameworks.autogen_integration.patch", return_value=False),
            patch("agentq.frameworks.llamaindex_integration.patch", return_value=False),
            patch("agentq.frameworks.haystack_integration.patch", return_value=False),
        ):
            result = instrument_frameworks()
            assert result == []

    def test_returns_instrumented_frameworks(self):
        """Should return names of successfully instrumented frameworks."""
        with (
            patch("agentq.frameworks.langchain_integration.patch", return_value=True),
            patch("agentq.frameworks.crewai_integration.patch", return_value=False),
            patch("agentq.frameworks.autogen_integration.patch", return_value=True),
            patch("agentq.frameworks.llamaindex_integration.patch", return_value=False),
            patch("agentq.frameworks.haystack_integration.patch", return_value=False),
        ):
            result = instrument_frameworks()
            assert "langchain" in result
            assert "autogen" in result
            assert "crewai" not in result

    def test_handles_exceptions_gracefully(self):
        """If a framework's patch raises, it should be silently skipped."""
        with (
            patch("agentq.frameworks.langchain_integration.patch", side_effect=RuntimeError("boom")),
            patch("agentq.frameworks.crewai_integration.patch", return_value=True),
            patch("agentq.frameworks.autogen_integration.patch", return_value=False),
            patch("agentq.frameworks.llamaindex_integration.patch", return_value=False),
            patch("agentq.frameworks.haystack_integration.patch", return_value=False),
        ):
            result = instrument_frameworks()
            assert "langchain" not in result
            assert "crewai" in result
