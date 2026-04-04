"""OpenTelemetry setup: TracerProvider, LiveSpanProcessor, and ID helpers."""

from __future__ import annotations

import json
import logging
import os
import threading
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from typing import Any

from opentelemetry import context, trace
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import ReadableSpan, Span, SpanProcessor, TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.trace import StatusCode

logger = logging.getLogger(__name__)

_tracer_provider: TracerProvider | None = None


def get_tracer() -> trace.Tracer:
    return trace.get_tracer("agentq")


# ---------------------------------------------------------------------------
# ID conversion: OTel 128-bit trace_id / 64-bit span_id <-> UUID strings
# ---------------------------------------------------------------------------


def trace_id_to_uuid(trace_id: int) -> str:
    """Convert a 128-bit OTel trace_id integer to a UUID-formatted string."""
    h = f"{trace_id:032x}"
    return f"{h[:8]}-{h[8:12]}-{h[12:16]}-{h[16:20]}-{h[20:]}"


def span_id_to_uuid(span_id: int) -> str:
    """Convert a 64-bit OTel span_id to a UUID-formatted string.

    Pads to 128-bit by prepending zeros.
    """
    h = f"{span_id:032x}"
    return f"{h[:8]}-{h[8:12]}-{h[12:16]}-{h[16:20]}-{h[20:]}"


def trace_id_to_hex(trace_id: int) -> str:
    return f"{trace_id:032x}"


def span_id_to_hex(span_id: int) -> str:
    return f"{span_id:016x}"


# ---------------------------------------------------------------------------
# OTLP JSON payload builder (used by LiveSpanProcessor for partial spans)
# ---------------------------------------------------------------------------


def _build_otlp_payload(span: Span | ReadableSpan, *, is_partial: bool) -> dict[str, Any]:
    """Build an OTLP ExportTraceServiceRequest JSON dict from a single span."""
    ctx = span.get_span_context()
    if ctx is None or not ctx.is_valid:
        return {}

    attrs: list[dict[str, Any]] = []
    if hasattr(span, "attributes") and span.attributes:
        for k, v in span.attributes.items():
            attrs.append(_otel_kv(k, v))

    events: list[dict[str, Any]] = []
    if not is_partial and hasattr(span, "events") and span.events:
        for ev in span.events:
            ev_attrs = [_otel_kv(k, v) for k, v in ev.attributes.items()] if ev.attributes else []
            events.append({
                "name": ev.name,
                "timeUnixNano": str(ev.timestamp) if ev.timestamp else "0",
                "attributes": ev_attrs,
            })

    parent_span_id = ""
    if span.parent and span.parent.span_id:
        parent_span_id = span_id_to_hex(span.parent.span_id)

    status_code = 0
    status_message = ""
    if not is_partial and hasattr(span, "status") and span.status:
        if span.status.status_code == StatusCode.ERROR:
            status_code = 2
        elif span.status.status_code == StatusCode.OK:
            status_code = 1
        if span.status.description:
            status_message = span.status.description

    end_time = "0" if is_partial else str(span.end_time or 0)

    otlp_span: dict[str, Any] = {
        "traceId": trace_id_to_hex(ctx.trace_id),
        "spanId": span_id_to_hex(ctx.span_id),
        "name": span.name,
        "kind": 1,
        "startTimeUnixNano": str(span.start_time or 0),
        "endTimeUnixNano": end_time,
        "attributes": attrs,
        "events": events,
        "status": {"code": status_code, "message": status_message},
    }
    if parent_span_id:
        otlp_span["parentSpanId"] = parent_span_id

    resource_attrs: list[dict[str, Any]] = []
    if hasattr(span, "resource") and span.resource:
        for k, v in span.resource.attributes.items():
            resource_attrs.append(_otel_kv(k, v))

    return {
        "resourceSpans": [{
            "resource": {"attributes": resource_attrs},
            "scopeSpans": [{
                "scope": {"name": "agentq"},
                "spans": [otlp_span],
            }],
        }],
    }


def _otel_kv(key: str, value: Any) -> dict[str, Any]:
    if isinstance(value, bool):
        return {"key": key, "value": {"boolValue": value}}
    if isinstance(value, int):
        return {"key": key, "value": {"intValue": str(value)}}
    if isinstance(value, float):
        return {"key": key, "value": {"doubleValue": value}}
    if isinstance(value, (list, tuple)):
        str_vals = [{"stringValue": str(v)} for v in value]
        return {"key": key, "value": {"arrayValue": {"values": str_vals}}}
    return {"key": key, "value": {"stringValue": str(value)}}


# ---------------------------------------------------------------------------
# LiveSpanProcessor: sends partial spans on start via OTLP HTTP/JSON
# ---------------------------------------------------------------------------


class LiveSpanProcessor(SpanProcessor):
    """Sends partial spans to the OTLP endpoint on_start for real-time monitoring.

    On ``on_start``, builds a minimal OTLP ExportTraceServiceRequest JSON with
    ``endTimeUnixNano=0`` and fires it to the endpoint. This lets an
    OTLP-aware server show the span as RUNNING immediately.
    """

    def __init__(self, endpoint: str | None = None, headers: dict[str, str] | None = None):
        env_endpoint = os.environ.get("OTEL_EXPORTER_OTLP_ENDPOINT", "")
        raw = endpoint or env_endpoint
        if not raw:
            self._endpoint = ""
        else:
            raw = raw.rstrip("/")
            self._endpoint = raw if raw.endswith("/v1/traces") else f"{raw}/v1/traces"

        self._headers = dict(headers) if headers else {}
        env_headers = os.environ.get("OTEL_EXPORTER_OTLP_HEADERS", "")
        if env_headers:
            for pair in env_headers.split(","):
                if "=" in pair:
                    k, v = pair.split("=", 1)
                    self._headers.setdefault(k.strip(), v.strip())

        self._executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="agentq-live")
        self._lock = threading.Lock()
        self._futures: list[Any] = []

    def on_start(self, span: Span, parent_context: context.Context | None = None) -> None:
        if not self._endpoint:
            return
        try:
            payload = _build_otlp_payload(span, is_partial=True)
            if not payload:
                return
            data = json.dumps(payload).encode("utf-8")
            future = self._executor.submit(self._send, data)
            with self._lock:
                self._futures = [f for f in self._futures if not f.done()]
                self._futures.append(future)
        except Exception:
            logger.debug("agentq live span start failed", exc_info=True)

    def on_end(self, span: ReadableSpan) -> None:
        pass

    def shutdown(self) -> None:
        self.force_flush()
        self._executor.shutdown(wait=False)

    def force_flush(self, timeout_millis: int = 5000) -> bool:
        with self._lock:
            pending = list(self._futures)
            self._futures = []
        for f in pending:
            try:
                f.result(timeout=timeout_millis / 1000)
            except Exception:
                pass
        return True

    def _send(self, data: bytes) -> None:
        try:
            req = urllib.request.Request(
                self._endpoint,
                data=data,
                method="POST",
                headers={"Content-Type": "application/json", **self._headers},
            )
            with urllib.request.urlopen(req, timeout=5) as resp:
                resp.read()
        except Exception:
            logger.debug("agentq live span POST failed", exc_info=True)


# ---------------------------------------------------------------------------
# setup_tracing
# ---------------------------------------------------------------------------


def setup_tracing(
    endpoint: str | None = None,
    headers: dict[str, str] | None = None,
    service_name: str = "agentq",
) -> TracerProvider:
    """Configure and install a global TracerProvider.

    - ``endpoint``: OTLP HTTP endpoint (e.g. ``http://localhost:4318``).
      Falls back to ``OTEL_EXPORTER_OTLP_ENDPOINT``.
    - ``headers``: Extra headers sent with every OTLP request (e.g.
      ``{"Authorization": "Bearer sk-xxx"}``).
    - ``service_name``: Value for the ``service.name`` resource attribute.
    """
    global _tracer_provider

    resource = Resource.create({"service.name": service_name})
    provider = TracerProvider(resource=resource)

    resolved_endpoint = endpoint or os.environ.get("OTEL_EXPORTER_OTLP_ENDPOINT", "")
    resolved_headers = dict(headers) if headers else {}
    env_headers = os.environ.get("OTEL_EXPORTER_OTLP_HEADERS", "")
    if env_headers:
        for pair in env_headers.split(","):
            if "=" in pair:
                k, v = pair.split("=", 1)
                resolved_headers.setdefault(k.strip(), v.strip())

    exporter_kwargs: dict[str, Any] = {}
    if resolved_endpoint:
        traces_endpoint = resolved_endpoint.rstrip("/")
        if not traces_endpoint.endswith("/v1/traces"):
            traces_endpoint += "/v1/traces"
        exporter_kwargs["endpoint"] = traces_endpoint
    if resolved_headers:
        exporter_kwargs["headers"] = resolved_headers

    exporter = OTLPSpanExporter(**exporter_kwargs)
    provider.add_span_processor(BatchSpanProcessor(exporter))
    provider.add_span_processor(LiveSpanProcessor(endpoint=endpoint, headers=headers))

    trace.set_tracer_provider(provider)
    _tracer_provider = provider
    return provider
