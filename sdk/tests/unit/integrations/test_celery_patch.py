"""Unit tests for agentq.integrations.celery_patch."""

from __future__ import annotations

from unittest.mock import patch

from agentq.integrations import celery_patch


class TestCeleryPatchWithoutLib:
    def test_patch_skips_if_not_installed(self):
        celery_patch._patched = False
        celery_patch._handler = None
        with patch.dict("sys.modules", {"celery": None, "celery.signals": None}):
            celery_patch.patch()
        assert celery_patch._patched is False

    def test_unpatch_when_not_patched(self):
        celery_patch._patched = False
        celery_patch._handler = None
        celery_patch.unpatch()  # should not raise
