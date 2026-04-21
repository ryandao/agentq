"""
AgentQ Setup Boilerplate
=========================

One-call initialization for AgentQ in chat app examples.
Handles endpoint configuration and service naming.

Usage:
    from shared.agentq_setup import setup_agentq
    setup_agentq("my-chat-app")
"""

from __future__ import annotations

import os

import agentq


def setup_agentq(
    service_name: str,
    endpoint: str | None = None,
) -> str:
    """Initialize AgentQ with sensible defaults for chat app examples.

    Args:
        service_name: Name for this service in traces.
        endpoint: AgentQ server URL. Defaults to AGENTQ_ENDPOINT env var
                  or http://localhost:3000.

    Returns:
        The endpoint URL being used.
    """
    endpoint = endpoint or os.environ.get("AGENTQ_ENDPOINT", "http://localhost:3000")
    agentq.init(endpoint=endpoint, service_name=service_name)
    return endpoint
