"""Tests for the framework detection module."""

import sys
from unittest.mock import MagicMock

import pytest

from agentq_sdk.detection import DetectionResult, Framework, FrameworkDetector


class TestFrameworkEnum:
    def test_all_frameworks_defined(self):
        assert len(Framework) == 4
        assert Framework.LANGCHAIN.value == "langchain"
        assert Framework.CREWAI.value == "crewai"
        assert Framework.AUTOGEN.value == "autogen"
        assert Framework.LLAMAINDEX.value == "llamaindex"


class TestDetectionResult:
    def test_available_when_installed_and_active(self):
        result = DetectionResult(framework=Framework.LANGCHAIN, installed=True, active=True)
        assert result.available is True

    def test_not_available_when_not_installed(self):
        result = DetectionResult(framework=Framework.LANGCHAIN, installed=False, active=False)
        assert result.available is False

    def test_not_available_when_installed_but_inactive(self):
        result = DetectionResult(framework=Framework.LANGCHAIN, installed=True, active=False)
        assert result.available is False


class TestFrameworkDetector:
    def setup_method(self):
        self.detector = FrameworkDetector()

    def test_detect_uninstalled_framework(self):
        # Most test environments won't have these installed
        result = self.detector.detect(Framework.CREWAI)
        # Result should exist regardless
        assert isinstance(result, DetectionResult)
        assert result.framework == Framework.CREWAI

    def test_detect_all_returns_list(self):
        results = self.detector.detect_all()
        assert isinstance(results, list)
        assert len(results) == 4

    def test_cache_works(self):
        result1 = self.detector.detect(Framework.LANGCHAIN)
        result2 = self.detector.detect(Framework.LANGCHAIN)
        assert result1 is result2

    def test_clear_cache(self):
        self.detector.detect(Framework.LANGCHAIN)
        self.detector.clear_cache()
        assert len(self.detector._cache) == 0

    def test_detect_installed_framework_via_mock(self):
        """Simulate a framework being installed by mocking importlib."""
        fake_mod = MagicMock()
        fake_mod.__version__ = "1.0.0"
        sys.modules["crewai"] = fake_mod

        try:
            detector = FrameworkDetector()
            result = detector.detect(Framework.CREWAI)
            assert result.installed is True
            assert result.version == "1.0.0"
        finally:
            del sys.modules["crewai"]

    def test_detect_active_framework_via_sys_modules(self):
        """Simulate a framework being actively imported."""
        fake_mod = MagicMock()
        fake_mod.__version__ = "2.0.0"
        fake_agent_mod = MagicMock()
        sys.modules["crewai"] = fake_mod

        try:
            detector = FrameworkDetector()
            result = detector.detect(Framework.CREWAI)
            assert result.installed is True
            # Module is in sys.modules so should be detected as active
            assert result.active is True
        finally:
            del sys.modules["crewai"]

    def test_get_installed_frameworks(self):
        results = self.detector.get_installed_frameworks()
        assert isinstance(results, list)

    def test_get_active_frameworks(self):
        results = self.detector.get_active_frameworks()
        assert isinstance(results, list)
