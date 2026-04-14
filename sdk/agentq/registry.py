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
    """Activate auto-instrumentation for supported libraries and frameworks.

    Monkey-patches openai, anthropic, and google-genai so that every LLM call
    is automatically wrapped in an agentq span with token-usage extraction.
    Also hooks Celery signals to capture queue wait time.

    Additionally, auto-detects and instruments popular agent frameworks
    (LangChain, CrewAI, AutoGen, LlamaIndex, Haystack) so that the
    ``@agent`` decorator is **not required** for those frameworks.

    Safe to call even if any of these libraries are not installed.
    """
    from agentq.integrations import openai_patch, anthropic_patch, gemini_patch, celery_patch

    openai_patch.patch()
    anthropic_patch.patch()
    gemini_patch.patch()
    celery_patch.patch()

    # Auto-detect and instrument agent frameworks
    from agentq.frameworks import instrument_frameworks
    frameworks = instrument_frameworks()
    if frameworks:
        logger.info(
            "agentq auto-instrumentation activated (frameworks: %s)",
            ", ".join(frameworks),
        )
    else:
        logger.info("agentq auto-instrumentation activated")
