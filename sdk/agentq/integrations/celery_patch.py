"""Auto-instrumentation for Celery: stamps enqueue time into task headers."""

from __future__ import annotations

import logging
import time
from typing import Any

logger = logging.getLogger(__name__)

_patched = False
_handler: Any = None

HEADER_KEY = "agentq_enqueued_at"


def patch() -> None:
    global _patched, _handler
    if _patched:
        return
    try:
        from celery.signals import before_task_publish
    except ImportError:
        logger.debug("celery not installed – skipping patch")
        return

    def _stamp_enqueue_time(headers: dict | None = None, **_kwargs: object) -> None:
        if headers is not None:
            headers[HEADER_KEY] = time.time()

    before_task_publish.connect(_stamp_enqueue_time)
    _handler = _stamp_enqueue_time
    _patched = True
    logger.debug("celery queue-wait auto-instrumentation activated")


def unpatch() -> None:
    global _patched, _handler
    if not _patched or _handler is None:
        return
    try:
        from celery.signals import before_task_publish

        before_task_publish.disconnect(_handler)
    except Exception:
        pass
    _handler = None
    _patched = False
