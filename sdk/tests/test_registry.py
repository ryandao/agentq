"""Tests for agentq.registry (init, instrument, is_initialized)."""

from __future__ import annotations

from unittest.mock import patch, MagicMock

import pytest

import agentq.registry as registry


class TestInit:
    """Tests for agentq.init()."""

    def test_init_sets_initialized_flag(self, memory_exporter):
        """init() should set _initialized = True."""
        assert registry._initialized is False
        with patch.object(registry, "setup_tracing"):
            registry.init(endpoint="http://localhost:4318")
        assert registry._initialized is True
        registry._initialized = False

    def test_init_calls_setup_tracing_with_params(self):
        """init() should forward endpoint, headers, service_name to setup_tracing."""
        with patch.object(registry, "setup_tracing") as mock_setup:
            registry.init(
                endpoint="http://example.com",
                headers={"Authorization": "Bearer tok"},
                service_name="my-svc",
            )
            mock_setup.assert_called_once_with(
                endpoint="http://example.com",
                headers={"Authorization": "Bearer tok"},
                service_name="my-svc",
            )
        registry._initialized = False

    def test_init_default_service_name(self):
        """init() should default service_name to 'agentq'."""
        with patch.object(registry, "setup_tracing") as mock_setup:
            registry.init()
            mock_setup.assert_called_once_with(
                endpoint=None,
                headers=None,
                service_name="agentq",
            )
        registry._initialized = False


class TestIsInitialized:
    """Tests for is_initialized()."""

    def test_false_by_default(self):
        assert registry.is_initialized() is False

    def test_true_after_init(self):
        with patch.object(registry, "setup_tracing"):
            registry.init()
        assert registry.is_initialized() is True
        registry._initialized = False


class TestInstrument:
    """Tests for agentq.instrument()."""

    def test_instrument_calls_all_patches(self):
        """instrument() should call patch() on each integration."""
        with (
            patch("agentq.integrations.openai_patch.patch") as mock_openai,
            patch("agentq.integrations.anthropic_patch.patch") as mock_anthropic,
            patch("agentq.integrations.gemini_patch.patch") as mock_gemini,
            patch("agentq.integrations.celery_patch.patch") as mock_celery,
        ):
            registry.instrument()
            mock_openai.assert_called_once()
            mock_anthropic.assert_called_once()
            mock_gemini.assert_called_once()
            mock_celery.assert_called_once()
