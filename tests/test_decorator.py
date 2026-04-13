"""Tests for the @agent decorator."""

import pytest

import agentq.core as core_mod
from agentq.decorator import agent


class TestAgentDecorator:
    def setup_method(self):
        core_mod._context = None

    def teardown_method(self):
        if core_mod._context is not None:
            core_mod._context.shutdown()
        core_mod._context = None

    def test_decorator_no_args(self):
        @agent
        def my_agent():
            return 42

        result = my_agent()
        assert result == 42
        ctx = core_mod.get_context()
        assert len(ctx.runs) == 1
        assert ctx.runs[0].agent_name == "my_agent"

    def test_decorator_with_args(self):
        @agent(name="custom_name", framework="test", metadata={"k": "v"})
        def my_agent():
            return "ok"

        result = my_agent()
        assert result == "ok"
        ctx = core_mod.get_context()
        assert len(ctx.runs) == 1
        assert ctx.runs[0].agent_name == "custom_name"
        assert ctx.runs[0].framework == "test"
        assert ctx.runs[0].metadata == {"k": "v"}

    def test_decorator_preserves_function_metadata(self):
        @agent
        def my_agent():
            """Docstring here."""
            return 1

        assert my_agent.__name__ == "my_agent"
        assert my_agent.__doc__ == "Docstring here."

    def test_decorator_tracks_error(self):
        @agent
        def failing_agent():
            raise ValueError("intentional")

        with pytest.raises(ValueError, match="intentional"):
            failing_agent()

        ctx = core_mod.get_context()
        assert len(ctx.runs) == 1
        assert ctx.runs[0].error == "intentional"

    @pytest.mark.asyncio
    async def test_async_decorator(self):
        @agent
        async def async_agent():
            return "async_result"

        result = await async_agent()
        assert result == "async_result"
        ctx = core_mod.get_context()
        assert len(ctx.runs) == 1
        assert ctx.runs[0].agent_name == "async_agent"

    @pytest.mark.asyncio
    async def test_async_decorator_error(self):
        @agent
        async def failing_async():
            raise RuntimeError("async boom")

        with pytest.raises(RuntimeError, match="async boom"):
            await failing_async()

        ctx = core_mod.get_context()
        assert ctx.runs[0].error == "async boom"
