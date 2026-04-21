"""Tests for agentq.integrations.celery_patch."""

from __future__ import annotations

import sys
import time
from types import ModuleType
from unittest.mock import MagicMock, patch

import pytest

from agentq.integrations import celery_patch


class TestCeleryPatch:
    def test_patch_skips_when_not_installed(self):
        with patch.dict(sys.modules, {"celery": None, "celery.signals": None}):
            celery_patch._patched = False
            celery_patch.patch()
            assert celery_patch._patched is False

    def test_patch_idempotent(self):
        celery_patch._patched = True
        celery_patch.patch()
        assert celery_patch._patched is True

    def test_unpatch_when_not_patched(self):
        celery_patch._patched = False
        celery_patch._handler = None
        celery_patch.unpatch()

    def test_patch_with_mock_celery(self):
        """Verify patch connects to before_task_publish signal."""
        mock_signal = MagicMock()
        mock_signals_mod = ModuleType("celery.signals")
        mock_signals_mod.before_task_publish = mock_signal
        mock_celery_mod = ModuleType("celery")

        celery_patch._patched = False
        celery_patch._handler = None

        with patch.dict(sys.modules, {
            "celery": mock_celery_mod,
            "celery.signals": mock_signals_mod,
        }):
            celery_patch.patch()
            assert celery_patch._patched is True
            mock_signal.connect.assert_called_once()

            # Test the handler stamps enqueue time
            handler = mock_signal.connect.call_args[0][0]
            headers = {}
            handler(headers=headers)
            assert celery_patch.HEADER_KEY in headers
            assert isinstance(headers[celery_patch.HEADER_KEY], float)

    def test_unpatch_disconnects_signal(self):
        mock_signal = MagicMock()
        handler = MagicMock()

        mock_signals_mod = ModuleType("celery.signals")
        mock_signals_mod.before_task_publish = mock_signal
        mock_celery_mod = ModuleType("celery")

        celery_patch._patched = True
        celery_patch._handler = handler

        with patch.dict(sys.modules, {
            "celery": mock_celery_mod,
            "celery.signals": mock_signals_mod,
        }):
            celery_patch.unpatch()
            mock_signal.disconnect.assert_called_once_with(handler)
            assert celery_patch._patched is False
            assert celery_patch._handler is None
