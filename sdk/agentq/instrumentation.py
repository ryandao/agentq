from __future__ import annotations

import functools
import inspect
import json
import logging
import socket
import traceback
from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass
from typing import Any, Callable, Generator

from opentelemetry import trace
from opentelemetry.trace import StatusCode

from agentq.otel import get_tracer
from agentq.registry import is_initialized

logger = logging.getLogger(__name__)


_current_agent: ContextVar[str | None] = ContextVar(
    "current_agentq_agent", default=None
)
_current_session_id: ContextVar[str | None] = ContextVar(
    "agentq_session_id", default=None
)
_current_run_config: ContextVar[RunConfig | None] = ContextVar(
    "agentq_run_config", default=None
)


@dataclass
class RunConfig:
    run_id: str | None = None
    metadata: dict[str, Any] | None = None
    session_name: str | None = None


# ---------------------------------------------------------------------------
# Sanitization / preview helpers
# ---------------------------------------------------------------------------


def _sanitize(value: Any, depth: int = 0) -> Any:
    if depth > 3:
        return str(value)
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, dict):
        return {str(k): _sanitize(v, depth + 1) for k, v in list(value.items())[:20]}
    if isinstance(value, (list, tuple, set)):
        return [_sanitize(v, depth + 1) for v in list(value)[:20]]
    if hasattr(value, "model_dump"):
        try:
            return _sanitize(value.model_dump(), depth + 1)
        except Exception:
            return str(value)
    if hasattr(value, "dict"):
        try:
            return _sanitize(value.dict(), depth + 1)
        except Exception:
            return str(value)
    if hasattr(value, "__dict__"):
        try:
            raw = {
                key: val
                for key, val in vars(value).items()
                if not key.startswith("_") and not callable(val)
            }
            return _sanitize(raw, depth + 1)
        except Exception:
            return str(value)
    return str(value)


def _preview_json(value: Any) -> str:
    """Return a JSON string of the sanitized value (for span attributes)."""
    try:
        return json.dumps(_sanitize(value), default=str)
    except Exception:
        return str(value)


def _detect_worker_name() -> str | None:
    try:
        from celery import current_task
        if current_task and current_task.request:
            hostname = getattr(current_task.request, "hostname", None)
            if hostname:
                return hostname
    except Exception:
        pass
    try:
        return socket.gethostname()
    except Exception:
        return None


def _detect_enqueued_at() -> float | None:
    try:
        from celery import current_task
        from agentq.integrations.celery_patch import HEADER_KEY

        if current_task and current_task.request:
            val = getattr(current_task.request, HEADER_KEY, None)
            if val is None:
                headers = getattr(current_task.request, "headers", None) or {}
                val = headers.get(HEADER_KEY)
            if val is not None:
                return float(val)
    except Exception:
        pass
    return None


def _is_noop_span(span: trace.Span) -> bool:
    """Return True if the span is a NonRecordingSpan (no provider configured)."""
    return not hasattr(span, "set_attribute") or isinstance(span, trace.NonRecordingSpan)


def _has_valid_parent() -> bool:
    """Check if the current OTel context has a valid, recording parent span."""
    span = trace.get_current_span()
    if _is_noop_span(span):
        return False
    ctx = span.get_span_context()
    return ctx is not None and ctx.is_valid


# ---------------------------------------------------------------------------
# current_span() -- public API for manual enrichment
# ---------------------------------------------------------------------------


class SpanProxy:
    """Wraps the current OTel span for user-facing enrichment."""

    def __init__(self, span: trace.Span):
        self._span = span

    @property
    def name(self) -> str:
        if hasattr(self._span, "name"):
            return self._span.name  # type: ignore[union-attr]
        return ""

    @name.setter
    def name(self, value: str) -> None:
        if hasattr(self._span, "update_name"):
            self._span.update_name(value)

    @property
    def metadata(self) -> _AttributeDict:
        return _AttributeDict(self._span)

    @property
    def tags(self) -> list[str]:
        return []

    @tags.setter
    def tags(self, value: list[str]) -> None:
        self._span.set_attribute("agentq.tags", value)

    def add_event(self, event_payload: dict[str, Any]) -> None:
        attrs = {}
        for k, v in event_payload.items():
            if isinstance(v, (str, int, float, bool)):
                attrs[k] = v
            else:
                attrs[k] = json.dumps(_sanitize(v), default=str)
        self._span.add_event(
            name=str(event_payload.get("type", "custom")),
            attributes=attrs,
        )


class _AttributeDict(dict):  # type: ignore[type-arg]
    """Dict-like wrapper that forwards updates to span attributes."""

    def __init__(self, span: trace.Span):
        super().__init__()
        self._span = span

    def __setitem__(self, key: str, value: Any) -> None:
        super().__setitem__(key, value)
        if isinstance(value, dict):
            for dk, dv in value.items():
                attr_key = f"agentq.meta.{key}.{dk}"
                if isinstance(dv, (str, int, float, bool)):
                    self._span.set_attribute(attr_key, dv)
                else:
                    self._span.set_attribute(attr_key, str(dv))
        elif isinstance(value, (str, int, float, bool)):
            self._span.set_attribute(f"agentq.meta.{key}", value)

    def update(self, other: Any = None, **kwargs: Any) -> None:  # type: ignore[override]
        if other:
            items = other.items() if hasattr(other, "items") else other
            for k, v in items:
                self[k] = v
        for k, v in kwargs.items():
            self[k] = v


def current_span() -> SpanProxy | None:
    span = trace.get_current_span()
    if _is_noop_span(span):
        return None
    return SpanProxy(span)


# ---------------------------------------------------------------------------
# ObservabilityLogHandler
# ---------------------------------------------------------------------------


class ObservabilityLogHandler(logging.Handler):
    def emit(self, record: logging.LogRecord) -> None:
        try:
            span = trace.get_current_span()
            if _is_noop_span(span):
                return
            span.add_event(
                "log",
                attributes={
                    "log.level": record.levelname,
                    "log.message": self.format(record),
                    "log.logger": record.name,
                },
            )
        except Exception:
            self.handleError(record)


# ---------------------------------------------------------------------------
# _SpanTracker -- yielded by track_llm / track_tool / track_agent
# ---------------------------------------------------------------------------


class _NoOpTracker:
    def set_input(self, data: Any) -> None:
        pass

    def set_output(self, data: Any) -> None:
        pass

    def add_event(self, payload: dict[str, Any]) -> None:
        pass


class _SpanTracker:
    def __init__(self, span: trace.Span, run_type: str):
        self._span = span
        self._run_type = run_type

    def set_input(self, data: Any) -> None:
        self._span.add_event(
            f"{self._run_type}_input",
            attributes={"data": _preview_json(data)},
        )

    def set_output(self, data: Any) -> None:
        self._span.add_event(
            f"{self._run_type}_output",
            attributes={"data": _preview_json(data)},
        )

    def add_event(self, payload: dict[str, Any]) -> None:
        attrs: dict[str, Any] = {}
        for k, v in payload.items():
            if isinstance(v, (str, int, float, bool)):
                attrs[k] = v
            else:
                attrs[k] = json.dumps(_sanitize(v), default=str)
        self._span.add_event(
            name=str(payload.get("type", "custom")),
            attributes=attrs,
        )


# ---------------------------------------------------------------------------
# track_llm / track_tool / track_agent context managers
# ---------------------------------------------------------------------------


@contextmanager
def track_llm(
    name: str,
    model: str | None = None,
    **extra_metadata: Any,
) -> Generator[_SpanTracker | _NoOpTracker, None, None]:
    if not is_initialized():
        yield _NoOpTracker()
        return

    tracer = get_tracer()
    attrs: dict[str, Any] = {
        "agentq.run_type": "llm",
    }
    agent_name = _current_agent.get()
    if agent_name:
        attrs["agentq.agent_name"] = agent_name
    if model:
        attrs["gen_ai.request.model"] = model
    session_id = _current_session_id.get()
    if session_id:
        attrs["agentq.session.id"] = session_id
    for ek, ev in extra_metadata.items():
        if isinstance(ev, (str, int, float, bool)):
            attrs[f"agentq.meta.{ek}"] = ev

    with tracer.start_as_current_span(name, attributes=attrs) as span:
        tracker = _SpanTracker(span, "llm")
        try:
            yield tracker
            span.set_status(StatusCode.OK)
        except Exception as exc:
            span.set_status(StatusCode.ERROR, str(exc))
            span.record_exception(exc)
            raise


@contextmanager
def track_agent(
    name: str,
    **extra_metadata: Any,
) -> Generator[_SpanTracker | _NoOpTracker, None, None]:
    """Create an agent span manually."""
    if not is_initialized():
        yield _NoOpTracker()
        return

    tracer = get_tracer()
    attrs: dict[str, Any] = {
        "agentq.run_type": "agent",
        "agentq.agent_name": name,
    }
    session_id = _current_session_id.get()
    if session_id:
        attrs["agentq.session.id"] = session_id
    for ek, ev in extra_metadata.items():
        if isinstance(ev, (str, int, float, bool)):
            attrs[f"agentq.meta.{ek}"] = ev

    agent_token = _current_agent.set(name)
    try:
        with tracer.start_as_current_span(name, attributes=attrs) as span:
            tracker = _SpanTracker(span, "agent")
            try:
                yield tracker
                span.set_status(StatusCode.OK)
            except Exception as exc:
                span.set_status(StatusCode.ERROR, str(exc))
                span.record_exception(exc)
                raise
    finally:
        _current_agent.reset(agent_token)


@contextmanager
def track_tool(
    name: str,
    **extra_metadata: Any,
) -> Generator[_SpanTracker | _NoOpTracker, None, None]:
    if not is_initialized():
        yield _NoOpTracker()
        return

    tracer = get_tracer()
    attrs: dict[str, Any] = {
        "agentq.run_type": "tool",
    }
    agent_name = _current_agent.get()
    if agent_name:
        attrs["agentq.agent_name"] = agent_name
    session_id = _current_session_id.get()
    if session_id:
        attrs["agentq.session.id"] = session_id
    for ek, ev in extra_metadata.items():
        if isinstance(ev, (str, int, float, bool)):
            attrs[f"agentq.meta.{ek}"] = ev

    with tracer.start_as_current_span(name, attributes=attrs) as span:
        tracker = _SpanTracker(span, "tool")
        try:
            yield tracker
            span.set_status(StatusCode.OK)
        except Exception as exc:
            span.set_status(StatusCode.ERROR, str(exc))
            span.record_exception(exc)
            raise


# ---------------------------------------------------------------------------
# session -- dual-use: context manager + decorator
# ---------------------------------------------------------------------------


class session:
    """Bind session context for agent tracing.

    Use as a **context manager** with literal values::

        with agentq.session(session_id="conv-1", run_id="exec-2", metadata={...}):
            agent.execute(...)

    Use as a **decorator** with callable resolvers (resolved at call time)::

        @agentq.session(
            session_id=lambda task_id, **_: task_id,
            run_id=lambda task_execution_id, **_: task_execution_id,
        )
        def my_task(task_id, prompt, task_execution_id):
            agent.execute(...)
    """

    def __init__(
        self,
        session_id: str | Callable[..., str | None] | None = None,
        *,
        name: str | Callable[..., str | None] | None = None,
        run_id: str | Callable[..., str | None] | None = None,
        metadata: dict[str, Any] | Callable[..., dict[str, Any] | None] | None = None,
    ):
        self._session_id = session_id
        self._name = name
        self._run_id = run_id
        self._metadata = metadata
        self._tokens: list[Any] = []

    @staticmethod
    def _resolve(value: Any, args: tuple, kwargs: dict) -> Any:
        return value(*args, **kwargs) if callable(value) else value

    def __call__(self, func: Callable[..., Any]) -> Callable[..., Any]:
        @functools.wraps(func)
        def wrapper(*args: Any, **kwargs: Any) -> Any:
            sid = self._resolve(self._session_id, args, kwargs)
            sname = self._resolve(self._name, args, kwargs)
            rid = self._resolve(self._run_id, args, kwargs)
            meta = self._resolve(self._metadata, args, kwargs)
            with session(session_id=sid, name=sname, run_id=rid, metadata=meta):
                return func(*args, **kwargs)
        return wrapper

    def __enter__(self) -> session:
        self._tokens.append(_current_session_id.set(self._session_id))
        self._tokens.append(
            _current_run_config.set(
                RunConfig(
                    run_id=self._run_id,  # type: ignore[arg-type]
                    metadata=self._metadata,  # type: ignore[arg-type]
                    session_name=self._name,  # type: ignore[arg-type]
                )
            )
        )
        return self

    def __exit__(self, *exc: Any) -> bool:
        for token in reversed(self._tokens):
            token.var.reset(token)
        self._tokens.clear()
        return False


# ---------------------------------------------------------------------------
# @agent decorator
# ---------------------------------------------------------------------------


def _run_agent_instrumented(
    original: Callable[..., Any],
    agent_name: str,
    span_name: str,
    args: tuple[Any, ...],
    kwargs: dict[str, Any],
    bind_self: Any | None = None,
) -> Any:
    """Shared core for both class-method and function agent instrumentation."""
    if not is_initialized():
        if bind_self is not None:
            return original(bind_self, *args, **kwargs)
        return original(*args, **kwargs)

    tracer = get_tracer()
    is_root = not _has_valid_parent()

    attrs: dict[str, Any] = {
        "agentq.run_type": "agent",
        "agentq.agent_name": agent_name,
    }

    session_id = _current_session_id.get()
    if session_id:
        attrs["agentq.session.id"] = session_id
    run_config = _current_run_config.get()
    if run_config and run_config.session_name:
        attrs["agentq.session.name"] = run_config.session_name

    if is_root:
        attrs["agentq.is_root"] = True
        attrs["agentq.task_name"] = agent_name
        worker_name = _detect_worker_name()
        if worker_name:
            attrs["agentq.worker_name"] = worker_name
        enqueued_at = _detect_enqueued_at()
        if enqueued_at is not None:
            attrs["agentq.enqueued_at"] = enqueued_at
        if run_config and run_config.metadata:
            attrs["agentq.run_metadata"] = json.dumps(
                _sanitize(run_config.metadata), default=str
            )

    attrs["agentq.input_preview"] = _preview_json(
        {"args": _sanitize(args), "kwargs": _sanitize(kwargs)}
    )

    log_handler: ObservabilityLogHandler | None = None
    if is_root:
        log_handler = ObservabilityLogHandler()
        log_handler.setFormatter(
            logging.Formatter("%(asctime)s - %(name)s - %(levelname)s - %(message)s")
        )
        logging.getLogger().addHandler(log_handler)

    agent_token = _current_agent.set(agent_name)

    with tracer.start_as_current_span(span_name, attributes=attrs) as span:
        try:
            if bind_self is not None:
                result = original(bind_self, *args, **kwargs)
            else:
                result = original(*args, **kwargs)

            span.set_attribute("agentq.output_preview", _preview_json(result))
            span.set_status(StatusCode.OK)
            return result
        except Exception as exc:
            span.set_status(StatusCode.ERROR, str(exc))
            span.record_exception(exc)
            span.set_attribute(
                "agentq.output_preview",
                _preview_json({
                    "exception_type": exc.__class__.__name__,
                    "traceback": traceback.format_exc(limit=20),
                }),
            )
            raise
        finally:
            _current_agent.reset(agent_token)
            if is_root and log_handler:
                logging.getLogger().removeHandler(log_handler)


def _run_agent_generator(
    original: Any,
    agent_name: str,
    span_name: str,
    args: tuple[Any, ...],
    kwargs: dict[str, Any],
    bind_self: Any | None = None,
) -> Generator[Any, Any, Any]:
    """Execute a generator-based agent method with span context that
    persists across yields.
    """

    def _call() -> Generator[Any, Any, Any]:
        if bind_self is not None:
            return original(bind_self, *args, **kwargs)
        return original(*args, **kwargs)

    if not is_initialized():
        yield from _call()
        return

    tracer = get_tracer()
    is_root = not _has_valid_parent()

    if is_root:
        run_config = _current_run_config.get()
        if not run_config:
            yield from _call()
            return

    attrs: dict[str, Any] = {
        "agentq.run_type": "agent",
        "agentq.agent_name": agent_name,
    }

    session_id = _current_session_id.get()
    if session_id:
        attrs["agentq.session.id"] = session_id
    run_config = _current_run_config.get()
    if run_config and run_config.session_name:
        attrs["agentq.session.name"] = run_config.session_name

    if is_root:
        attrs["agentq.is_root"] = True
        attrs["agentq.task_name"] = agent_name
        worker_name = _detect_worker_name()
        if worker_name:
            attrs["agentq.worker_name"] = worker_name
        enqueued_at = _detect_enqueued_at()
        if enqueued_at is not None:
            attrs["agentq.enqueued_at"] = enqueued_at
        if run_config and run_config.metadata:
            attrs["agentq.run_metadata"] = json.dumps(
                _sanitize(run_config.metadata), default=str
            )

    attrs["agentq.input_preview"] = _preview_json(
        {"args": _sanitize(args), "kwargs": _sanitize(kwargs)}
    )

    log_handler: ObservabilityLogHandler | None = None
    if is_root:
        log_handler = ObservabilityLogHandler()
        log_handler.setFormatter(
            logging.Formatter("%(asctime)s - %(name)s - %(levelname)s - %(message)s")
        )
        logging.getLogger().addHandler(log_handler)

    agent_token = _current_agent.set(agent_name)

    with tracer.start_as_current_span(span_name, attributes=attrs) as span:
        try:
            yield from _call()
            span.set_status(StatusCode.OK)
        except Exception as exc:
            span.set_status(StatusCode.ERROR, str(exc))
            span.record_exception(exc)
            raise
        finally:
            _current_agent.reset(agent_token)
            if is_root and log_handler:
                logging.getLogger().removeHandler(log_handler)


def _instrument_class(
    cls: type, agent_name: str, entry_methods: list[str]
) -> type:
    cls._agentq_name = agent_name  # type: ignore[attr-defined]
    instrumented_names: set[str] = set()

    for method_name in entry_methods:
        original = getattr(cls, method_name, None)
        if original is None:
            continue

        span = f"{agent_name}.{method_name}"

        if inspect.isgeneratorfunction(original):
            def _make_gen(orig: Any = original, sn: str = span) -> Any:
                @functools.wraps(orig)
                def wrapper(self: Any, *args: Any, **kwargs: Any) -> Any:
                    yield from _run_agent_generator(
                        orig, agent_name, sn, args, kwargs, bind_self=self,
                    )
                return wrapper
            setattr(cls, method_name, _make_gen())
        else:
            def _make(orig: Any = original, sn: str = span) -> Any:
                @functools.wraps(orig)
                def wrapper(self: Any, *args: Any, **kwargs: Any) -> Any:
                    return _run_agent_instrumented(
                        orig, agent_name, sn, args, kwargs, bind_self=self,
                    )
                return wrapper
            setattr(cls, method_name, _make())

        instrumented_names.add(method_name)

    def _agent_getattribute(self: Any, name: str) -> Any:
        attr = object.__getattribute__(self, name)

        if (
            not name
            or name[0] == "_"
            or name in instrumented_names
            or not callable(attr)
            or _current_agent.get() == agent_name
            or not _has_valid_parent()
        ):
            return attr

        span_name = f"{agent_name}.{name}"

        if inspect.isgeneratorfunction(attr):

            @functools.wraps(attr)
            def _gen_bridge(*args: Any, **kwargs: Any) -> Any:
                yield from _run_agent_generator(
                    attr, agent_name, span_name, args, kwargs,
                )

            return _gen_bridge

        @functools.wraps(attr)
        def _bridge(*args: Any, **kwargs: Any) -> Any:
            return _run_agent_instrumented(
                attr, agent_name, span_name, args, kwargs,
            )

        return _bridge

    cls.__getattribute__ = _agent_getattribute  # type: ignore[assignment]
    return cls


def _instrument_function(
    func: Callable[..., Any], agent_name: str
) -> Callable[..., Any]:
    @functools.wraps(func)
    def instrumented(*args: Any, **kwargs: Any) -> Any:
        return _run_agent_instrumented(
            func, agent_name, agent_name, args, kwargs
        )

    instrumented._agentq_name = agent_name  # type: ignore[attr-defined]
    return instrumented


def agent(
    name: str,
    description: str | None = None,
    version: str | None = None,
    entry_method: str | list[str] = "execute",
    metadata: dict[str, Any] | None = None,
) -> Callable[..., Any]:
    """Declare an agent for tracing.

    Works on **classes** and **plain functions**.  The first
    ``@agent``-decorated callable to run auto-creates a *run*; nested
    calls become child spans.

    For classes, ``entry_method`` names the method(s) that serve as
    external entry points (default ``"execute"``).  Pass a list to
    instrument multiple entry points.
    """
    def decorator(target: Any) -> Any:
        if isinstance(target, type):
            methods = [entry_method] if isinstance(entry_method, str) else list(entry_method)
            return _instrument_class(target, name, methods)
        if callable(target):
            return _instrument_function(target, name)
        raise TypeError(
            f"@agent expects a class or function, got {type(target)}"
        )

    return decorator
