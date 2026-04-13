"""
The @agent decorator — the original AgentQ integration mechanism.

This decorator wraps any function or class to register it as an AgentQ-managed
agent. It handles lifecycle tracking, error capture, and telemetry.

With the auto-detection feature, this decorator is still supported for:
- Custom agents not built on a supported framework
- Fine-grained control over agent tracking metadata
- Explicit opt-in when auto-detection is disabled
"""

from __future__ import annotations

import asyncio
import functools
import logging
from typing import Any, Callable, Optional, TypeVar, overload

from agentq.core import AgentRun, get_context

logger = logging.getLogger("agentq")

F = TypeVar("F", bound=Callable[..., Any])


@overload
def agent(func: F) -> F: ...


@overload
def agent(
    *,
    name: Optional[str] = None,
    framework: str = "custom",
    metadata: Optional[dict[str, Any]] = None,
) -> Callable[[F], F]: ...


def agent(
    func: Optional[F] = None,
    *,
    name: Optional[str] = None,
    framework: str = "custom",
    metadata: Optional[dict[str, Any]] = None,
) -> Any:
    """
    Decorator to register a function or callable as an AgentQ-tracked agent.

    Can be used with or without arguments:

        @agent
        def my_agent():
            ...

        @agent(name="researcher", metadata={"model": "gpt-4"})
        def my_agent():
            ...

    Args:
        name: Optional display name for the agent. Defaults to the function name.
        framework: Framework identifier. Defaults to "custom".
        metadata: Additional metadata to attach to each run.
    """

    def decorator(fn: F) -> F:
        agent_name = name or fn.__name__
        agent_metadata = metadata or {}

        if asyncio.iscoroutinefunction(fn):

            @functools.wraps(fn)
            async def async_wrapper(*args: Any, **kwargs: Any) -> Any:
                ctx = get_context()
                if not ctx.initialized:
                    ctx.init()

                run = AgentRun(
                    agent_name=agent_name,
                    framework=framework,
                    metadata=agent_metadata,
                )
                run.start()
                ctx.track_run(run)

                try:
                    result = await fn(*args, **kwargs)
                    ctx.complete_run(run)
                    return result
                except Exception as exc:
                    ctx.fail_run(run, str(exc))
                    raise

            return async_wrapper  # type: ignore[return-value]
        else:

            @functools.wraps(fn)
            def sync_wrapper(*args: Any, **kwargs: Any) -> Any:
                ctx = get_context()
                if not ctx.initialized:
                    ctx.init()

                run = AgentRun(
                    agent_name=agent_name,
                    framework=framework,
                    metadata=agent_metadata,
                )
                run.start()
                ctx.track_run(run)

                try:
                    result = fn(*args, **kwargs)
                    ctx.complete_run(run)
                    return result
                except Exception as exc:
                    ctx.fail_run(run, str(exc))
                    raise

            return sync_wrapper  # type: ignore[return-value]

    if func is not None:
        return decorator(func)
    return decorator
