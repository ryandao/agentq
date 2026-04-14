"""Auto-detection and native integrations for popular agent frameworks.

These integrations allow tracing agent frameworks without requiring the
``@agent`` decorator.  Call ``agentq.instrument()`` after ``agentq.init()``
and frameworks that are importable will be automatically instrumented.

Supported frameworks:
- **LangChain** — callback-based tracing of chains, agents, LLM calls, tools
- **CrewAI** — monkey-patch tracing of Crew kickoff, Agent execution, Tasks
- **AutoGen** — monkey-patch tracing of ConversableAgent message processing
- **LlamaIndex** — callback-based tracing of queries, retrieval, synthesis
- **Haystack** — pipeline ``run()`` wrapping for component-level tracing
"""

from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)


def instrument_frameworks() -> list[str]:
    """Auto-detect and instrument all supported agent frameworks.

    Returns a list of framework names that were successfully instrumented.
    Safe to call even if none of the frameworks are installed.
    """
    from agentq.frameworks import (
        langchain_integration,
        crewai_integration,
        autogen_integration,
        llamaindex_integration,
        haystack_integration,
    )

    instrumented: list[str] = []

    for name, mod in [
        ("langchain", langchain_integration),
        ("crewai", crewai_integration),
        ("autogen", autogen_integration),
        ("llamaindex", llamaindex_integration),
        ("haystack", haystack_integration),
    ]:
        try:
            if mod.patch():
                instrumented.append(name)
                logger.debug("agentq: %s framework integration activated", name)
        except Exception:
            logger.debug("agentq: failed to instrument %s", name, exc_info=True)

    return instrumented
