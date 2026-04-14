"""Shared fixtures for agentq SDK tests."""

from __future__ import annotations

import threading

import pytest

from opentelemetry import trace
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter


def _force_set_tracer_provider(provider: TracerProvider) -> None:
    """Force-reset the global tracer provider for testing.

    OTel only allows setting the provider once. We need to reset the
    internal ``_TRACER_PROVIDER_SET_ONCE`` guard so each test gets a
    clean provider.
    """
    # Reset the Once guard so set_tracer_provider works again
    once = trace._TRACER_PROVIDER_SET_ONCE
    once._done = False
    once._lock = threading.Lock()

    trace.set_tracer_provider(provider)


@pytest.fixture()
def memory_exporter():
    """Set up an in-memory span exporter for capturing spans in tests."""
    exporter = InMemorySpanExporter()
    resource = Resource.create({"service.name": "agentq-test"})
    provider = TracerProvider(resource=resource)
    provider.add_span_processor(SimpleSpanProcessor(exporter))
    _force_set_tracer_provider(provider)
    yield exporter
    exporter.shutdown()


@pytest.fixture()
def init_agentq(memory_exporter):
    """Initialize agentq with in-memory exporter for testing."""
    import agentq.registry as registry

    # Mark as initialized so instrumentation logic kicks in
    registry._initialized = True
    yield memory_exporter
    registry._initialized = False


@pytest.fixture(autouse=True)
def reset_registry():
    """Ensure _initialized is reset after every test."""
    import agentq.registry as registry
    original = registry._initialized
    yield
    registry._initialized = original


@pytest.fixture(autouse=True)
def reset_patches():
    """Unpatch any auto-instrumentation patches after each test."""
    yield
    from agentq.integrations import openai_patch, anthropic_patch, gemini_patch, celery_patch
    openai_patch._patched = False
    openai_patch._original_create = None
    anthropic_patch._patched = False
    anthropic_patch._original_create = None
    gemini_patch._patched = False
    gemini_patch._original_generate = None
    celery_patch._patched = False
    celery_patch._handler = None
