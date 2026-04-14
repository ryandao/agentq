"""Tests for the agentq public API surface (agentq.__init__)."""

from __future__ import annotations

import agentq


class TestPublicAPI:
    """Verify all expected symbols are exported."""

    def test_init_exported(self):
        assert callable(agentq.init)

    def test_instrument_exported(self):
        assert callable(agentq.instrument)

    def test_agent_exported(self):
        assert callable(agentq.agent)

    def test_session_exported(self):
        assert agentq.session is not None

    def test_current_span_exported(self):
        assert callable(agentq.current_span)

    def test_track_agent_exported(self):
        assert callable(agentq.track_agent)

    def test_track_llm_exported(self):
        assert callable(agentq.track_llm)

    def test_track_tool_exported(self):
        assert callable(agentq.track_tool)

    def test_log_handler_exported(self):
        assert agentq.ObservabilityLogHandler is not None

    def test_all_list(self):
        expected = {
            "init",
            "instrument",
            "agent",
            "session",
            "current_span",
            "track_agent",
            "track_llm",
            "track_tool",
            "ObservabilityLogHandler",
        }
        assert set(agentq.__all__) == expected
