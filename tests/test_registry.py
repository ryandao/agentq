"""Tests for the adapter registry module."""

import pytest

from agentq_sdk.adapters.base import BaseAdapter
from agentq_sdk.detection import Framework
from agentq_sdk.registry import AdapterRegistry


class FakeAdapter(BaseAdapter):
    """Minimal adapter for testing."""

    def patch(self):
        self._patched = True

    def unpatch(self):
        self._patched = False

    def wrap_agent(self, agent, agent_id=None):
        return agent


class TestAdapterRegistry:
    def setup_method(self):
        AdapterRegistry.reset()
        self.registry = AdapterRegistry()

    def teardown_method(self):
        AdapterRegistry.reset()

    def test_singleton(self):
        r1 = AdapterRegistry()
        r2 = AdapterRegistry()
        assert r1 is r2

    def test_register_and_get(self):
        self.registry.register(Framework.LANGCHAIN, FakeAdapter)
        adapter = self.registry.get(Framework.LANGCHAIN)
        assert isinstance(adapter, FakeAdapter)

    def test_get_returns_same_instance(self):
        self.registry.register(Framework.LANGCHAIN, FakeAdapter)
        a1 = self.registry.get(Framework.LANGCHAIN)
        a2 = self.registry.get(Framework.LANGCHAIN)
        assert a1 is a2

    def test_get_unregistered_returns_none(self):
        assert self.registry.get(Framework.CREWAI) is None

    def test_has(self):
        self.registry.register(Framework.LANGCHAIN, FakeAdapter)
        assert self.registry.has(Framework.LANGCHAIN) is True
        assert self.registry.has(Framework.CREWAI) is False

    def test_get_class(self):
        self.registry.register(Framework.LANGCHAIN, FakeAdapter)
        assert self.registry.get_class(Framework.LANGCHAIN) is FakeAdapter

    def test_registered_frameworks(self):
        self.registry.register(Framework.LANGCHAIN, FakeAdapter)
        self.registry.register(Framework.CREWAI, FakeAdapter)
        assert set(self.registry.registered_frameworks) == {Framework.LANGCHAIN, Framework.CREWAI}

    def test_register_non_adapter_raises(self):
        with pytest.raises(TypeError):
            self.registry.register(Framework.LANGCHAIN, dict)  # type: ignore

    def test_clear_unpatches_active(self):
        self.registry.register(Framework.LANGCHAIN, FakeAdapter)
        adapter = self.registry.get(Framework.LANGCHAIN)
        adapter.patch()
        assert adapter.is_patched
        self.registry.clear()
        assert not adapter.is_patched

    def test_reset_creates_fresh_instance(self):
        self.registry.register(Framework.LANGCHAIN, FakeAdapter)
        AdapterRegistry.reset()
        fresh = AdapterRegistry()
        assert not fresh.has(Framework.LANGCHAIN)
