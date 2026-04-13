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

    Monkey-patches LLM provider libraries (openai, anthropic, google-genai) so
    that every LLM call is automatically wrapped in an agentq span with
    token-usage extraction.

    Also patches popular agent frameworks (LangChain, CrewAI, OpenAI Agents SDK,
    AutoGen) so that agent entry points produce proper agent spans without
    requiring the ``@agent`` decorator.

    Hooks Celery signals to capture queue wait time.

    Safe to call even if any of these libraries are not installed.
    """
    from agentq.integrations import (
        anthropic_patch,
        autogen_patch,
        celery_patch,
        crewai_patch,
        gemini_patch,
        langchain_patch,
        openai_agents_patch,
        openai_patch,
    )

    # LLM provider patches
    openai_patch.patch()
    anthropic_patch.patch()
    gemini_patch.patch()

    # Agent framework patches
    langchain_patch.patch()
    crewai_patch.patch()
    openai_agents_patch.patch()
    autogen_patch.patch()

    # Infrastructure patches
    celery_patch.patch()

    logger.info("agentq auto-instrumentation activated")
