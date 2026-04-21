"""Tests for agentq.otel (setup_tracing, LiveSpanProcessor, ID helpers)."""

from __future__ import annotations

import json
import os
from unittest.mock import patch, MagicMock, ANY

import pytest
from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider, ReadableSpan

from agentq.otel import (
    get_tracer,
    setup_tracing,
    trace_id_to_uuid,
    span_id_to_uuid,
    trace_id_to_hex,
    span_id_to_hex,
    LiveSpanProcessor,
    _build_otlp_payload,
    _otel_kv,
)


class TestIDConversion:
    """Tests for trace/span ID conversion helpers."""

    def test_trace_id_to_uuid(self):
        tid = 0x0123456789ABCDEF0123456789ABCDEF
        result = trace_id_to_uuid(tid)
        assert result == "01234567-89ab-cdef-0123-456789abcdef"

    def test_trace_id_to_uuid_zero(self):
        result = trace_id_to_uuid(0)
        assert result == "00000000-0000-0000-0000-000000000000"

    def test_span_id_to_uuid(self):
        sid = 0x0123456789ABCDEF
        result = span_id_to_uuid(sid)
        # padded to 128-bit
        assert result == "00000000-0000-0000-0123-456789abcdef"

    def test_trace_id_to_hex(self):
        result = trace_id_to_hex(0xFF)
        assert result == "000000000000000000000000000000ff"
        assert len(result) == 32

    def test_span_id_to_hex(self):
        result = span_id_to_hex(0xFF)
        assert result == "00000000000000ff"
        assert len(result) == 16


class TestOtelKV:
    """Tests for _otel_kv helper."""

    def test_string_value(self):
        assert _otel_kv("k", "v") == {"key": "k", "value": {"stringValue": "v"}}

    def test_bool_value(self):
        assert _otel_kv("k", True) == {"key": "k", "value": {"boolValue": True}}

    def test_int_value(self):
        assert _otel_kv("k", 42) == {"key": "k", "value": {"intValue": "42"}}

    def test_float_value(self):
        assert _otel_kv("k", 3.14) == {"key": "k", "value": {"doubleValue": 3.14}}

    def test_list_value(self):
        result = _otel_kv("k", ["a", "b"])
        assert result["key"] == "k"
        assert result["value"]["arrayValue"]["values"] == [
            {"stringValue": "a"},
            {"stringValue": "b"},
        ]


class TestSetupTracing:
    """Tests for setup_tracing()."""

    def test_returns_tracer_provider(self):
        provider = setup_tracing(service_name="test-svc")
        assert isinstance(provider, TracerProvider)

    def test_sets_global_provider(self, memory_exporter):
        """setup_tracing should install a TracerProvider globally."""
        # The memory_exporter fixture already force-sets a provider,
        # so we just verify setup_tracing returns a TracerProvider
        # and stores it in the module global.
        from agentq import otel
        provider = setup_tracing(service_name="test-svc")
        assert otel._tracer_provider is provider

    def test_endpoint_gets_v1_traces_suffix(self):
        """Endpoint should get /v1/traces appended if not present."""
        with patch("agentq.otel.OTLPSpanExporter") as MockExporter:
            setup_tracing(endpoint="http://localhost:4318")
            MockExporter.assert_called_once()
            call_kwargs = MockExporter.call_args[1]
            assert call_kwargs["endpoint"] == "http://localhost:4318/v1/traces"

    def test_endpoint_already_has_v1_traces(self):
        """Endpoint that already ends with /v1/traces should not be doubled."""
        with patch("agentq.otel.OTLPSpanExporter") as MockExporter:
            setup_tracing(endpoint="http://localhost:4318/v1/traces")
            call_kwargs = MockExporter.call_args[1]
            assert call_kwargs["endpoint"] == "http://localhost:4318/v1/traces"

    def test_env_headers_fallback(self):
        """Should parse OTEL_EXPORTER_OTLP_HEADERS env var."""
        with (
            patch.dict(os.environ, {"OTEL_EXPORTER_OTLP_HEADERS": "key1=val1,key2=val2"}),
            patch("agentq.otel.OTLPSpanExporter") as MockExporter,
        ):
            setup_tracing(endpoint="http://localhost:4318")
            call_kwargs = MockExporter.call_args[1]
            assert call_kwargs["headers"]["key1"] == "val1"
            assert call_kwargs["headers"]["key2"] == "val2"


class TestGetTracer:
    """Tests for get_tracer()."""

    def test_returns_tracer(self):
        tracer = get_tracer()
        assert tracer is not None


class TestLiveSpanProcessor:
    """Tests for LiveSpanProcessor."""

    def test_no_endpoint_does_nothing(self):
        """If no endpoint, on_start should be a no-op."""
        with patch.dict(os.environ, {}, clear=True):
            proc = LiveSpanProcessor(endpoint=None)
            # Should not fail
            mock_span = MagicMock()
            proc.on_start(mock_span)

    def test_endpoint_normalization(self):
        proc = LiveSpanProcessor(endpoint="http://localhost:4318")
        assert proc._endpoint == "http://localhost:4318/v1/traces"

    def test_endpoint_already_has_suffix(self):
        proc = LiveSpanProcessor(endpoint="http://localhost:4318/v1/traces")
        assert proc._endpoint == "http://localhost:4318/v1/traces"

    def test_on_end_is_noop(self):
        """on_end should do nothing (final spans handled by BatchSpanProcessor)."""
        proc = LiveSpanProcessor(endpoint="http://localhost:4318")
        mock_span = MagicMock()
        # Should not raise
        proc.on_end(mock_span)

    def test_force_flush(self):
        proc = LiveSpanProcessor(endpoint="http://localhost:4318")
        assert proc.force_flush() is True

    def test_shutdown(self):
        proc = LiveSpanProcessor(endpoint="http://localhost:4318")
        proc.shutdown()
        # Should not raise


class TestBuildOtlpPayload:
    """Tests for _build_otlp_payload."""

    def test_invalid_span_returns_empty(self):
        """Non-recording span should return empty dict."""
        span = MagicMock()
        ctx = MagicMock()
        ctx.is_valid = False
        span.get_span_context.return_value = ctx
        result = _build_otlp_payload(span, is_partial=True)
        assert result == {}
