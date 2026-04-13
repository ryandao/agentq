"""Shared test fixtures for the AgentQ SDK test suite."""

from __future__ import annotations

import threading
from typing import Sequence

import pytest

from opentelemetry import trace
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import ReadableSpan, TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor, SpanExporter, SpanExportResult

import agentq.registry as registry


class InMemorySpanExporter(SpanExporter):
    """Simple in-memory exporter for testing (compatible with all OTel versions)."""

    def __init__(self) -> None:
        self._spans: list[ReadableSpan] = []
        self._lock = threading.Lock()

    def export(self, spans: Sequence[ReadableSpan]) -> SpanExportResult:
        with self._lock:
            self._spans.extend(spans)
        return SpanExportResult.SUCCESS

    def get_finished_spans(self) -> list[ReadableSpan]:
        with self._lock:
            return list(self._spans)

    def clear(self) -> None:
        with self._lock:
            self._spans.clear()

    def shutdown(self) -> None:
        self.clear()


# Module-level singleton: set the TracerProvider once for the whole test session
_test_exporter = InMemorySpanExporter()
_test_resource = Resource.create({"service.name": "agentq-test"})
_test_provider = TracerProvider(resource=_test_resource)
_test_provider.add_span_processor(SimpleSpanProcessor(_test_exporter))
trace.set_tracer_provider(_test_provider)


@pytest.fixture(autouse=True)
def _reset_registry():
    """Ensure registry is reset between tests and exporter is cleared."""
    registry._initialized = False
    _test_exporter.clear()
    yield
    registry._initialized = False


@pytest.fixture
def memory_exporter():
    """Return the shared in-memory span exporter."""
    _test_exporter.clear()
    return _test_exporter


@pytest.fixture
def tracer_provider():
    """Return the shared TracerProvider."""
    return _test_provider


@pytest.fixture
def initialized_sdk(tracer_provider):
    """Mark the SDK as initialized (for tests that need tracing active)."""
    registry._initialized = True
    yield
    registry._initialized = False
