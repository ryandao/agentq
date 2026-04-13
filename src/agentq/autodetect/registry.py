"""
Framework registry — stores metadata about supported frameworks and
provides package-level detection.
"""

from __future__ import annotations

import importlib.util
import logging
from dataclasses import dataclass, field
from typing import Any

logger = logging.getLogger("agentq")


@dataclass
class FrameworkInfo:
    """Metadata about a supported agent framework."""

    name: str
    display_name: str
    detect_packages: list[str] = field(default_factory=list)
    integration_module: str = ""
    integration_class: str = ""

    def is_installed(self) -> bool:
        """Check if any of the detection packages are importable."""
        for pkg in self.detect_packages:
            if importlib.util.find_spec(pkg) is not None:
                return True
        return False


class FrameworkRegistry:
    """Registry of known agent frameworks and their integration info."""

    def __init__(self) -> None:
        self._frameworks: dict[str, FrameworkInfo] = {}

    def register(self, info: FrameworkInfo) -> None:
        """Register a framework. Overwrites if name already exists."""
        self._frameworks[info.name] = info
        logger.debug("Registered framework: %s", info.name)

    def get(self, name: str) -> FrameworkInfo | None:
        return self._frameworks.get(name)

    def all(self) -> list[FrameworkInfo]:
        return list(self._frameworks.values())

    def names(self) -> list[str]:
        return list(self._frameworks.keys())
