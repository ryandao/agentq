"""Haystack integration — automatic tracing of pipeline execution.

When ``patch()`` is called and ``haystack`` is importable, this module wraps:

- **Pipeline.run()** — traced as an ``agent`` span (the pipeline's overall run)
- Each component invocation within the pipeline is traced as a child span

Usage::

    import agentq
    agentq.init(endpoint="http://localhost:3000")
    agentq.instrument()  # auto-detects Haystack

    from haystack import Pipeline
    # No @agent decorator needed — pipeline runs are traced automatically
"""

from __future__ import annotations

import functools
import logging
from typing import Any

logger = logging.getLogger(__name__)

_patched = False
_originals: dict[str, Any] = {}


def patch() -> bool:
    """Monkey-patch Haystack Pipeline to add agentq tracing.

    Returns True if patched, False if haystack is not installed.
    """
    global _patched
    if _patched:
        return True

    Pipeline = None

    # Try haystack 2.x
    try:
        from haystack import Pipeline as HP
        Pipeline = HP
    except ImportError:
        try:
            # Try haystack-ai package
            from haystack.pipeline import Pipeline as HP2
            Pipeline = HP2
        except ImportError:
            logger.debug("haystack not installed — skipping Haystack integration")
            return False

    if Pipeline is None:
        return False

    _originals["pipeline_cls"] = Pipeline

    # Wrap Pipeline.run
    if hasattr(Pipeline, "run"):
        _originals["run"] = Pipeline.run

        @functools.wraps(Pipeline.run)
        def wrapped_run(self: Any, *args: Any, **kwargs: Any) -> Any:
            from agentq.instrumentation import track_agent, track_tool

            pipeline_name = getattr(self, "name", None) or type(self).__name__
            with track_agent(pipeline_name) as tracker:
                data = args[0] if args else kwargs.get("data", kwargs)
                if data:
                    # Preview the input keys
                    if isinstance(data, dict):
                        tracker.set_input(list(data.keys())[:10])
                    else:
                        tracker.set_input(str(data)[:200])

                result = _originals["run"](self, *args, **kwargs)

                if result and isinstance(result, dict):
                    tracker.set_output(list(result.keys())[:10])
                return result

        Pipeline.run = wrapped_run  # type: ignore[assignment]

    # Also wrap async run if available
    if hasattr(Pipeline, "run_async"):
        _originals["run_async"] = Pipeline.run_async

        @functools.wraps(Pipeline.run_async)
        async def wrapped_run_async(self: Any, *args: Any, **kwargs: Any) -> Any:
            from agentq.instrumentation import track_agent

            pipeline_name = getattr(self, "name", None) or type(self).__name__
            with track_agent(pipeline_name) as tracker:
                data = args[0] if args else kwargs.get("data", kwargs)
                if data and isinstance(data, dict):
                    tracker.set_input(list(data.keys())[:10])
                result = await _originals["run_async"](self, *args, **kwargs)
                if result and isinstance(result, dict):
                    tracker.set_output(list(result.keys())[:10])
                return result

        Pipeline.run_async = wrapped_run_async  # type: ignore[assignment]

    _patched = True
    logger.debug("Haystack agentq integration activated")
    return True


def unpatch() -> None:
    global _patched
    if not _patched:
        return

    cls = _originals.get("pipeline_cls")
    if cls:
        if "run" in _originals:
            cls.run = _originals["run"]
        if "run_async" in _originals:
            cls.run_async = _originals["run_async"]

    _originals.clear()
    _patched = False
