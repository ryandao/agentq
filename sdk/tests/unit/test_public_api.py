"""Unit tests for the public API surface of agentq."""

from __future__ import annotations

import agentq


class TestPublicAPI:
    def test_init_is_callable(self):
        assert callable(agentq.init)

    def test_instrument_is_callable(self):
        assert callable(agentq.instrument)

    def test_agent_is_callable(self):
        assert callable(agentq.agent)

    def test_session_is_class(self):
        assert isinstance(agentq.session, type)

    def test_current_span_is_callable(self):
        assert callable(agentq.current_span)

    def test_track_agent_is_callable(self):
        assert callable(agentq.track_agent)

    def test_track_llm_is_callable(self):
        assert callable(agentq.track_llm)

    def test_track_tool_is_callable(self):
        assert callable(agentq.track_tool)

    def test_observability_log_handler_exists(self):
        assert hasattr(agentq, "ObservabilityLogHandler")

    def test_all_exports(self):
        expected = {
            "init", "instrument", "agent", "session",
            "current_span", "track_agent", "track_llm",
            "track_tool", "ObservabilityLogHandler",
        }
        assert expected.issubset(set(agentq.__all__))
