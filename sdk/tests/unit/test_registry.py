"""Unit tests for agentq.registry — init, is_initialized, instrument."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

import agentq.registry as registry


class TestInit:
    def test_is_initialized_false_by_default(self):
        assert registry.is_initialized() is False

    def test_init_sets_initialized(self):
        with patch("agentq.registry.setup_tracing") as mock_setup:
            registry.init(endpoint="http://localhost:4318")
            assert registry.is_initialized() is True
            mock_setup.assert_called_once_with(
                endpoint="http://localhost:4318",
                headers=None,
                service_name="agentq",
            )

    def test_init_custom_service_name(self):
        with patch("agentq.registry.setup_tracing"):
            registry.init(service_name="my-service")
            assert registry.is_initialized() is True

    def test_init_with_headers(self):
        with patch("agentq.registry.setup_tracing") as mock_setup:
            headers = {"Authorization": "Bearer token"}
            registry.init(endpoint="http://x", headers=headers)
            mock_setup.assert_called_once_with(
                endpoint="http://x",
                headers=headers,
                service_name="agentq",
            )


class TestInstrument:
    def test_instrument_calls_all_patches(self):
        with (
            patch("agentq.integrations.openai_patch.patch") as openai_p,
            patch("agentq.integrations.anthropic_patch.patch") as anthropic_p,
            patch("agentq.integrations.gemini_patch.patch") as gemini_p,
            patch("agentq.integrations.celery_patch.patch") as celery_p,
            patch("agentq.integrations.langchain_patch.patch") as langchain_p,
            patch("agentq.integrations.crewai_patch.patch") as crewai_p,
            patch("agentq.integrations.autogen_patch.patch") as autogen_p,
            patch("agentq.integrations.llamaindex_patch.patch") as llamaindex_p,
        ):
            registry.instrument()
            openai_p.assert_called_once()
            anthropic_p.assert_called_once()
            gemini_p.assert_called_once()
            celery_p.assert_called_once()
            langchain_p.assert_called_once()
            crewai_p.assert_called_once()
            autogen_p.assert_called_once()
            llamaindex_p.assert_called_once()
