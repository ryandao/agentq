"""Tests for the core AgentQ module."""

from __future__ import annotations

from typing import Any, Optional
from unittest import mock

import pytest

from agentq_sdk.adapters.base import BaseAdapter, AgentEvent, EventPayload
from agentq_sdk.core import AgentQ, auto_integrate
from agentq_sdk.detection import Framework
from agentq_sdk.registry import AdapterRegistry


class StubAdapter(BaseAdapter):
    """Stub adapter that tracks patch/unpatch calls."""

    patched_count = 0
    unpatched_count = 0

    def patch(self) -> None:
        StubAdapter.patched_count += 1
        self._patched = True

    def unpatch(self) -> None:
        StubAdapter.unpatched_count += 1
        self._patched = False

    def wrap_agent(self, agent: Any, agent_id: Optional[str] = None) -> Any:
        agent._agentq_id = self._agent_id_for(agent, agent_id)
        return agent


class TestAgentQ:
    def setup_method(self):
        AdapterRegistry.reset()
        StubAdapter.patched_count = 0
        StubAdapter.unpatched_count = 0

    def teardown_method(self):
        AdapterRegistry.reset()

    def test_activate_and_deactivate(self):
        """Basic activation and deactivation lifecycle."""
        aq = AgentQ(frameworks=[Framework.LANGCHAIN])
        # Override the built-in registration with our stub
        aq._registry.clear()
        aq._registry.register(Framework.LANGCHAIN, StubAdapter)

        aq.activate()
        assert aq.is_active is True
        assert StubAdapter.patched_count == 1

        aq.deactivate()
        assert aq.is_active is False
        assert StubAdapter.unpatched_count == 1

    def test_context_manager(self):
        """AgentQ should work as a context manager."""
        aq = AgentQ(frameworks=[Framework.LANGCHAIN])
        aq._registry.clear()
        aq._registry.register(Framework.LANGCHAIN, StubAdapter)

        with aq:
            assert aq.is_active is True
        assert aq.is_active is False

    def test_double_activate_warns(self):
        """Activating twice should log a warning but not fail."""
        aq = AgentQ(frameworks=[Framework.LANGCHAIN])
        aq._registry.clear()
        aq._registry.register(Framework.LANGCHAIN, StubAdapter)

        aq.activate()
        aq.activate()  # Should not raise
        assert StubAdapter.patched_count == 1  # Only patched once
        aq.deactivate()

    def test_deactivate_without_activate(self):
        """Deactivating without activating should be a no-op."""
        aq = AgentQ(frameworks=[Framework.LANGCHAIN])
        aq.deactivate()  # Should not raise

    def test_specific_frameworks_only(self):
        """Only specified frameworks should be activated."""
        aq = AgentQ(frameworks=[Framework.LANGCHAIN])
        aq._registry.clear()
        aq._registry.register(Framework.LANGCHAIN, StubAdapter)
        aq._registry.register(Framework.CREWAI, StubAdapter)

        aq.activate()
        # Only LANGCHAIN should be patched (1 call)
        assert StubAdapter.patched_count == 1
        aq.deactivate()

    def test_event_handler_registration(self):
        """Event handler should be passed to adapters during activation."""
        events_received: list[EventPayload] = []

        def handler(payload: EventPayload) -> None:
            events_received.append(payload)

        aq = AgentQ(frameworks=[Framework.LANGCHAIN], event_handler=handler)
        aq._registry.clear()
        aq._registry.register(Framework.LANGCHAIN, StubAdapter)

        aq.activate()
        # Get the adapter and verify it has the handler
        adapter = aq._registry.get(Framework.LANGCHAIN)
        assert adapter is not None
        assert handler in adapter._event_handlers
        aq.deactivate()

    def test_wrap_agent(self):
        """wrap() should delegate to the correct adapter."""
        aq = AgentQ(frameworks=[Framework.LANGCHAIN])
        aq._registry.clear()
        aq._registry.register(Framework.LANGCHAIN, StubAdapter)
        aq.activate()

        class FakeAgent:
            name = "test-agent"

        agent = FakeAgent()
        wrapped = aq.wrap(agent, agent_id="my-agent")
        assert getattr(wrapped, "_agentq_id", None) == "my-agent"
        aq.deactivate()

    def test_wrap_without_active_adapters(self):
        """wrap() should return the agent unchanged if no adapter matches."""
        aq = AgentQ(frameworks=[])
        aq.activate()

        agent = object()
        result = aq.wrap(agent)
        assert result is agent
        aq.deactivate()

    def test_active_frameworks_property(self):
        """active_frameworks should reflect currently patched frameworks."""
        aq = AgentQ(frameworks=[Framework.LANGCHAIN])
        aq._registry.clear()
        aq._registry.register(Framework.LANGCHAIN, StubAdapter)

        assert aq.active_frameworks == []
        aq.activate()
        assert Framework.LANGCHAIN in aq.active_frameworks
        aq.deactivate()

    def test_auto_detect_mode(self):
        """With auto_detect=True and no frameworks specified, detect installed."""
        aq = AgentQ(auto_detect=True)
        # No frameworks installed in test env, so should resolve to []
        frameworks = aq._resolve_frameworks()
        assert isinstance(frameworks, list)


class TestAutoIntegrate:
    def setup_method(self):
        AdapterRegistry.reset()

    def teardown_method(self):
        AdapterRegistry.reset()

    def test_auto_integrate_returns_agentq(self):
        """auto_integrate should return an activated AgentQ instance."""
        aq = auto_integrate(frameworks=[])
        assert isinstance(aq, AgentQ)
        assert aq.is_active is True
        aq.deactivate()

    def test_auto_integrate_with_event_handler(self):
        events: list = []
        aq = auto_integrate(frameworks=[], event_handler=lambda e: events.append(e))
        assert aq.is_active is True
        aq.deactivate()
