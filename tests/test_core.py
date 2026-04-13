"""Tests for core AgentQ context and run tracking."""

import threading
import time

import pytest

from agentq.core import AgentQContext, AgentRun, AgentStatus, get_context, init, shutdown


class TestAgentRun:
    def test_initial_state(self):
        run = AgentRun(agent_name="test")
        assert run.status == AgentStatus.IDLE
        assert run.agent_name == "test"
        assert run.started_at == 0.0
        assert run.error is None

    def test_start(self):
        run = AgentRun(agent_name="test")
        run.start()
        assert run.status == AgentStatus.RUNNING
        assert run.started_at > 0

    def test_complete(self):
        run = AgentRun(agent_name="test")
        run.start()
        time.sleep(0.01)
        run.complete()
        assert run.status == AgentStatus.COMPLETED
        assert run.duration > 0

    def test_fail(self):
        run = AgentRun(agent_name="test")
        run.start()
        run.fail("something broke")
        assert run.status == AgentStatus.ERRORED
        assert run.error == "something broke"

    def test_duration_not_started(self):
        run = AgentRun()
        assert run.duration == 0.0

    def test_run_id_unique(self):
        r1 = AgentRun()
        r2 = AgentRun()
        assert r1.run_id != r2.run_id


class TestAgentQContext:
    def test_init(self):
        ctx = AgentQContext()
        assert not ctx.initialized
        ctx.init(auto_detect=False)
        assert ctx.initialized

    def test_double_init(self):
        ctx = AgentQContext()
        ctx.init(auto_detect=False)
        ctx.init(auto_detect=False)  # should be a no-op
        assert ctx.initialized

    def test_shutdown(self):
        ctx = AgentQContext()
        ctx.init(auto_detect=False)
        ctx.shutdown()
        assert not ctx.initialized

    def test_track_run(self):
        ctx = AgentQContext()
        ctx.init(auto_detect=False)
        run = AgentRun(agent_name="test")
        run.start()
        ctx.track_run(run)
        assert len(ctx.runs) == 1
        assert ctx.runs[0].agent_name == "test"

    def test_complete_run(self):
        ctx = AgentQContext()
        ctx.init(auto_detect=False)
        run = AgentRun(agent_name="test")
        run.start()
        ctx.track_run(run)
        ctx.complete_run(run)
        assert run.status == AgentStatus.COMPLETED

    def test_fail_run(self):
        ctx = AgentQContext()
        ctx.init(auto_detect=False)
        run = AgentRun(agent_name="test")
        run.start()
        ctx.track_run(run)
        ctx.fail_run(run, "boom")
        assert run.status == AgentStatus.ERRORED
        assert run.error == "boom"

    def test_hooks(self):
        ctx = AgentQContext()
        ctx.init(auto_detect=False)
        events = []
        ctx.on("on_agent_start", lambda r: events.append(("start", r.agent_name)))
        ctx.on("on_agent_complete", lambda r: events.append(("complete", r.agent_name)))

        run = AgentRun(agent_name="hooked")
        run.start()
        ctx.track_run(run)
        ctx.complete_run(run)

        assert events == [("start", "hooked"), ("complete", "hooked")]

    def test_invalid_hook_event(self):
        ctx = AgentQContext()
        with pytest.raises(ValueError, match="Unknown event"):
            ctx.on("invalid_event", lambda: None)

    def test_hook_exception_does_not_propagate(self):
        ctx = AgentQContext()
        ctx.init(auto_detect=False)
        ctx.on("on_agent_start", lambda r: 1 / 0)  # will raise

        run = AgentRun(agent_name="test")
        run.start()
        # Should not raise
        ctx.track_run(run)

    def test_record_step(self):
        ctx = AgentQContext()
        ctx.init(auto_detect=False)
        step_data_captured = []
        ctx.on("on_step", lambda r, data: step_data_captured.append(data))

        run = AgentRun(agent_name="test")
        run.start()
        ctx.track_run(run)
        ctx.record_step(run, {"type": "tool_call", "tool": "search"})

        assert len(step_data_captured) == 1
        assert step_data_captured[0]["tool"] == "search"


class TestModuleSingleton:
    def test_get_context_returns_same_instance(self):
        # Reset global state
        import agentq.core as core_mod
        core_mod._context = None
        ctx1 = get_context()
        ctx2 = get_context()
        assert ctx1 is ctx2
        core_mod._context = None  # cleanup

    def test_init_and_shutdown(self):
        import agentq.core as core_mod
        core_mod._context = None
        ctx = init(auto_detect=False)
        assert ctx.initialized
        shutdown()
        assert core_mod._context is None
