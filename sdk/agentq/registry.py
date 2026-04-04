from __future__ import annotations

import logging

from agentq.otel import setup_tracing

logger = logging.getLogger(__name__)

_initialized = False


def init(
    endpoint: str | None = None,
    headers: dict[str, str] | None = None,
    service_name: str = "agentq",
) -> None:
    """Configure OpenTelemetry tracing for agentq.

    ``endpoint``
        OTLP HTTP base URL (e.g. ``http://localhost:4318`` or
        ``https://my-server.com``).  Falls back to
        ``OTEL_EXPORTER_OTLP_ENDPOINT``.

    ``headers``
        Extra headers for OTLP requests (e.g. auth tokens).  Falls back to
        ``OTEL_EXPORTER_OTLP_HEADERS``.

    ``service_name``
        Value for the ``service.name`` resource attribute.
    """
    global _initialized
    setup_tracing(endpoint=endpoint, headers=headers, service_name=service_name)
    _initialized = True
    logger.info(
        "agentq initialised: endpoint=%s, service=%s",
        endpoint or "(env)",
        service_name,
    )


def is_initialized() -> bool:
    return _initialized


def instrument() -> None:
    """Activate auto-instrumentation for supported libraries.

    Monkey-patches openai, anthropic, and google-genai so that every LLM call
    is automatically wrapped in an agentq span with token-usage extraction.
    Also hooks Celery signals to capture queue wait time.
    Safe to call even if any of these libraries are not installed.
    """
    from agentq.integrations import openai_patch, anthropic_patch, gemini_patch, celery_patch

    openai_patch.patch()
    anthropic_patch.patch()
    gemini_patch.patch()
    celery_patch.patch()
    logger.info("agentq auto-instrumentation activated")
