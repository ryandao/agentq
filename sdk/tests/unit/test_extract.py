"""Unit tests for agentq.integrations._extract — token usage extraction."""

from __future__ import annotations

from unittest.mock import MagicMock

from agentq.integrations._extract import extract_usage


class TestExtractUsage:
    def test_none_returns_none(self):
        assert extract_usage(None) is None

    def test_openai_response(self):
        resp = MagicMock()
        resp.usage.prompt_tokens = 10
        resp.usage.completion_tokens = 20
        resp.usage.total_tokens = 30
        resp.model = "gpt-4"
        result = extract_usage(resp)
        assert result is not None
        assert result["usage"]["prompt_tokens"] == 10
        assert result["usage"]["completion_tokens"] == 20
        assert result["usage"]["total_tokens"] == 30
        assert result["model"] == "gpt-4"

    def test_anthropic_response(self):
        resp = MagicMock()
        resp.usage.prompt_tokens = None  # anthropic doesn't have this
        resp.usage.input_tokens = 15
        resp.usage.output_tokens = 25
        resp.model = "claude-3"
        # Remove the prompt_tokens attr to force anthropic path
        del resp.usage.prompt_tokens
        result = extract_usage(resp)
        assert result is not None
        assert result["usage"]["prompt_tokens"] == 15
        assert result["usage"]["completion_tokens"] == 25
        assert result["usage"]["total_tokens"] == 40
        assert result["model"] == "claude-3"

    def test_gemini_response(self):
        resp = MagicMock()
        resp.usage = None  # no usage attr
        del resp.usage
        resp.usage_metadata.prompt_token_count = 12
        resp.usage_metadata.candidates_token_count = 18
        resp.usage_metadata.total_token_count = 30
        resp.model_version = "gemini-1.5"
        result = extract_usage(resp)
        assert result is not None
        assert result["usage"]["prompt_tokens"] == 12
        assert result["usage"]["completion_tokens"] == 18
        assert result["model"] == "gemini-1.5"

    def test_unknown_response_returns_none(self):
        resp = MagicMock(spec=[])  # no attributes
        assert extract_usage(resp) is None

    def test_no_model_omits_model_key(self):
        resp = MagicMock()
        resp.usage.prompt_tokens = 5
        resp.usage.completion_tokens = 10
        resp.usage.total_tokens = 15
        resp.model = None
        result = extract_usage(resp)
        assert result is not None
        assert "model" not in result
