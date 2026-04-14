"""Tests for agentq.integrations._extract (extract_usage)."""

from __future__ import annotations

from unittest.mock import MagicMock

import pytest

from agentq.integrations._extract import extract_usage, _has


class TestHas:
    def test_has_returns_true(self):
        obj = MagicMock()
        obj.some_attr = "value"
        assert _has(obj, "some_attr") is True

    def test_has_returns_false_for_none(self):
        obj = MagicMock()
        obj.some_attr = None
        assert _has(obj, "some_attr") is False

    def test_has_returns_false_for_missing(self):
        obj = MagicMock(spec=[])
        assert _has(obj, "nonexistent") is False


class TestExtractUsage:
    def test_none_response(self):
        assert extract_usage(None) is None

    def test_openai_response(self):
        """OpenAI-style response with usage.prompt_tokens."""
        response = MagicMock()
        response.usage.prompt_tokens = 100
        response.usage.completion_tokens = 50
        response.usage.total_tokens = 150
        response.model = "gpt-4"

        result = extract_usage(response)
        assert result is not None
        assert result["usage"]["prompt_tokens"] == 100
        assert result["usage"]["completion_tokens"] == 50
        assert result["usage"]["total_tokens"] == 150
        assert result["model"] == "gpt-4"

    def test_anthropic_response(self):
        """Anthropic-style response with usage.input_tokens."""
        response = MagicMock()
        response.usage.prompt_tokens = None  # Not present
        response.usage.input_tokens = 200
        response.usage.output_tokens = 80
        response.model = "claude-3-opus"

        # Remove prompt_tokens to trigger Anthropic branch
        del response.usage.prompt_tokens

        result = extract_usage(response)
        assert result is not None
        assert result["usage"]["prompt_tokens"] == 200
        assert result["usage"]["completion_tokens"] == 80
        assert result["usage"]["total_tokens"] == 280
        assert result["model"] == "claude-3-opus"

    def test_gemini_response(self):
        """Google GenAI-style response with usage_metadata."""
        response = MagicMock()
        response.usage = None
        response.usage_metadata.prompt_token_count = 300
        response.usage_metadata.candidates_token_count = 100
        response.usage_metadata.total_token_count = 400
        response.model_version = "gemini-1.5-pro"

        # Remove usage attribute to trigger Gemini branch
        del response.usage

        result = extract_usage(response)
        assert result is not None
        assert result["usage"]["prompt_tokens"] == 300
        assert result["usage"]["completion_tokens"] == 100
        assert result["usage"]["total_tokens"] == 400
        assert result["model"] == "gemini-1.5-pro"

    def test_empty_response(self):
        """Response with no relevant attributes should return None."""
        response = MagicMock(spec=[])
        result = extract_usage(response)
        assert result is None

    def test_no_model(self):
        """Result should omit 'model' key if not present."""
        response = MagicMock()
        response.usage.prompt_tokens = 10
        response.usage.completion_tokens = 5
        response.usage.total_tokens = 15
        response.model = None

        result = extract_usage(response)
        assert result is not None
        assert "model" not in result
