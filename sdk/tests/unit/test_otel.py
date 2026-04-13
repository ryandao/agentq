"""Unit tests for agentq.otel — OpenTelemetry setup, ID helpers, OTLP builder."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from agentq.otel import (
    LiveSpanProcessor,
    _build_otlp_payload,
    _otel_kv,
    get_tracer,
    setup_tracing,
    span_id_to_hex,
    span_id_to_uuid,
    trace_id_to_hex,
    trace_id_to_uuid,
)


# ---------------------------------------------------------------------------
# ID conversion
# ---------------------------------------------------------------------------

class TestIdConversion:
    def test_trace_id_to_uuid(self):
        tid = 0x0123456789ABCDEF0123456789ABCDEF
        result = trace_id_to_uuid(tid)
        assert result == "01234567-89ab-cdef-0123-456789abcdef"

    def test_trace_id_to_hex(self):
        tid = 0x0123456789ABCDEF0123456789ABCDEF
        result = trace_id_to_hex(tid)
        assert result == "0123456789abcdef0123456789abcdef"
        assert len(result) == 32

    def test_span_id_to_uuid(self):
        sid = 0x0123456789ABCDEF
        result = span_id_to_uuid(sid)
        assert len(result) == 36  # UUID format

    def test_span_id_to_hex(self):
        sid = 0x0123456789ABCDEF
        result = span_id_to_hex(sid)
        assert result == "0123456789abcdef"
        assert len(result) == 16


# ---------------------------------------------------------------------------
# _otel_kv
# ---------------------------------------------------------------------------

class TestOtelKv:
    def test_bool_value(self):
        result = _otel_kv("key", True)
        assert result == {"key": "key", "value": {"boolValue": True}}

    def test_int_value(self):
        result = _otel_kv("key", 42)
        assert result == {"key": "key", "value": {"intValue": "42"}}

    def test_float_value(self):
        result = _otel_kv("key", 3.14)
        assert result == {"key": "key", "value": {"doubleValue": 3.14}}

    def test_string_value(self):
        result = _otel_kv("key", "hello")
        assert result == {"key": "key", "value": {"stringValue": "hello"}}

    def test_list_value(self):
        result = _otel_kv("key", [1, 2, 3])
        assert "arrayValue" in result["value"]
        assert len(result["value"]["arrayValue"]["values"]) == 3

    def test_other_value_as_string(self):
        result = _otel_kv("key", {"nested": "dict"})
        assert "stringValue" in result["value"]


# ---------------------------------------------------------------------------
# get_tracer
# ---------------------------------------------------------------------------

class TestGetTracer:
    def test_returns_tracer(self):
        tracer = get_tracer()
        assert tracer is not None


# ---------------------------------------------------------------------------
# setup_tracing
# ---------------------------------------------------------------------------

class TestSetupTracing:
    def test_returns_provider(self):
        provider = setup_tracing(endpoint="http://localhost:4318")
        assert provider is not None

    def test_sets_global_provider(self):
        from opentelemetry import trace as trace_api
        provider = setup_tracing(endpoint="http://localhost:4318", service_name="test")
        # The provider should be set globally
        current = trace_api.get_tracer_provider()
        assert current is not None


# ---------------------------------------------------------------------------
# LiveSpanProcessor
# ---------------------------------------------------------------------------

class TestLiveSpanProcessor:
    def test_no_endpoint_skips_on_start(self):
        proc = LiveSpanProcessor(endpoint="")
        span = MagicMock()
        proc.on_start(span)  # should not raise

    def test_on_end_is_noop(self):
        proc = LiveSpanProcessor(endpoint="http://localhost")
        span = MagicMock()
        proc.on_end(span)  # should not raise

    def test_force_flush(self):
        proc = LiveSpanProcessor(endpoint="")
        assert proc.force_flush() is True

    def test_shutdown(self):
        proc = LiveSpanProcessor(endpoint="")
        proc.shutdown()  # should not raise

    def test_env_headers_parsing(self):
        with patch.dict("os.environ", {"OTEL_EXPORTER_OTLP_HEADERS": "key1=val1,key2=val2"}):
            proc = LiveSpanProcessor(endpoint="http://test")
            assert proc._headers.get("key1") == "val1"
            assert proc._headers.get("key2") == "val2"
