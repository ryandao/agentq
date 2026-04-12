"""Framework auto-detection module.

Inspects the runtime environment to detect which agent frameworks are
installed and actively in use, enabling zero-configuration integration.
"""

from __future__ import annotations

import importlib
import logging
import sys
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional

logger = logging.getLogger(__name__)


class Framework(Enum):
    """Supported agent frameworks."""

    LANGCHAIN = "langchain"
    CREWAI = "crewai"
    AUTOGEN = "autogen"
    LLAMAINDEX = "llamaindex"


@dataclass
class DetectionResult:
    """Result of framework detection."""

    framework: Framework
    installed: bool
    version: Optional[str] = None
    active: bool = False
    entry_classes: list[str] = field(default_factory=list)

    @property
    def available(self) -> bool:
        """Framework is installed and has detectable agent classes in use."""
        return self.installed and self.active


# Maps each framework to its top-level import and version attribute.
_FRAMEWORK_MODULES: dict[Framework, dict] = {
    Framework.LANGCHAIN: {
        "module": "langchain",
        "version_attr": "__version__",
        "agent_modules": [
            "langchain.agents",
            "langchain_core.runnables",
        ],
        "agent_classes": [
            "langchain.agents.AgentExecutor",
            "langchain.agents.agent.AgentExecutor",
            "langchain_core.runnables.base.RunnableSequence",
        ],
    },
    Framework.CREWAI: {
        "module": "crewai",
        "version_attr": "__version__",
        "agent_modules": [
            "crewai",
        ],
        "agent_classes": [
            "crewai.Agent",
            "crewai.Crew",
            "crewai.Task",
        ],
    },
    Framework.AUTOGEN: {
        "module": "autogen",
        "version_attr": "__version__",
        "agent_modules": [
            "autogen",
        ],
        "agent_classes": [
            "autogen.ConversableAgent",
            "autogen.AssistantAgent",
            "autogen.UserProxyAgent",
            "autogen.GroupChat",
        ],
    },
    Framework.LLAMAINDEX: {
        "module": "llama_index",
        "version_attr": "__version__",
        "agent_modules": [
            "llama_index.core.agent",
        ],
        "agent_classes": [
            "llama_index.core.agent.ReActAgent",
            "llama_index.core.agent.runner.AgentRunner",
        ],
    },
}


class FrameworkDetector:
    """Detects installed and active agent frameworks in the runtime environment.

    Detection works at two levels:
    1. **Installation check**: Can we import the framework's top-level module?
    2. **Activity check**: Are any of the framework's agent classes instantiated
       or have their modules been imported by user code?

    Usage:
        detector = FrameworkDetector()
        results = detector.detect_all()
        for result in results:
            if result.available:
                print(f"{result.framework.value} is active (v{result.version})")
    """

    def __init__(self) -> None:
        self._cache: dict[Framework, DetectionResult] = {}

    def detect(self, framework: Framework) -> DetectionResult:
        """Detect a single framework's presence and activity."""
        if framework in self._cache:
            return self._cache[framework]

        spec = _FRAMEWORK_MODULES[framework]
        result = DetectionResult(framework=framework, installed=False)

        # Level 1: Is the framework installed?
        try:
            mod = importlib.import_module(spec["module"])
            result.installed = True
            result.version = getattr(mod, spec["version_attr"], None)
        except ImportError:
            self._cache[framework] = result
            return result

        # Level 2: Are any agent-related modules already imported?
        active_classes: list[str] = []
        for agent_mod in spec.get("agent_modules", []):
            if agent_mod in sys.modules:
                result.active = True
                break

        # Also check for specific classes in sys.modules hierarchy
        if not result.active:
            for cls_path in spec.get("agent_classes", []):
                parts = cls_path.rsplit(".", 1)
                if len(parts) == 2:
                    mod_path, cls_name = parts
                    if mod_path in sys.modules:
                        mod_obj = sys.modules[mod_path]
                        if hasattr(mod_obj, cls_name):
                            result.active = True
                            active_classes.append(cls_path)

        result.entry_classes = active_classes
        self._cache[framework] = result
        logger.debug(
            "Detection result for %s: installed=%s, active=%s, version=%s",
            framework.value,
            result.installed,
            result.active,
            result.version,
        )
        return result

    def detect_all(self) -> list[DetectionResult]:
        """Detect all supported frameworks."""
        return [self.detect(fw) for fw in Framework]

    def get_active_frameworks(self) -> list[Framework]:
        """Return only frameworks that are installed and actively in use."""
        return [r.framework for r in self.detect_all() if r.available]

    def get_installed_frameworks(self) -> list[Framework]:
        """Return all installed frameworks (whether active or not)."""
        return [r.framework for r in self.detect_all() if r.installed]

    def clear_cache(self) -> None:
        """Clear the detection cache to force re-detection."""
        self._cache.clear()
