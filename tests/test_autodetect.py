"""Tests for framework auto-detection and registry."""

from agentq.autodetect.registry import FrameworkInfo, FrameworkRegistry
from agentq.autodetect import get_supported_frameworks, _registry


class TestFrameworkInfo:
    def test_is_installed_with_existing_package(self):
        # 'os' is always available
        info = FrameworkInfo(
            name="test",
            display_name="Test",
            detect_packages=["os"],
        )
        assert info.is_installed() is True

    def test_is_installed_with_missing_package(self):
        info = FrameworkInfo(
            name="test",
            display_name="Test",
            detect_packages=["nonexistent_package_xyz_12345"],
        )
        assert info.is_installed() is False

    def test_is_installed_any_match(self):
        info = FrameworkInfo(
            name="test",
            display_name="Test",
            detect_packages=["nonexistent_xyz", "os"],
        )
        assert info.is_installed() is True

    def test_is_installed_empty_packages(self):
        info = FrameworkInfo(
            name="test",
            display_name="Test",
            detect_packages=[],
        )
        assert info.is_installed() is False


class TestFrameworkRegistry:
    def test_register_and_get(self):
        reg = FrameworkRegistry()
        info = FrameworkInfo(name="test_fw", display_name="Test FW")
        reg.register(info)
        assert reg.get("test_fw") is info

    def test_get_missing(self):
        reg = FrameworkRegistry()
        assert reg.get("nonexistent") is None

    def test_all(self):
        reg = FrameworkRegistry()
        reg.register(FrameworkInfo(name="a", display_name="A"))
        reg.register(FrameworkInfo(name="b", display_name="B"))
        assert len(reg.all()) == 2

    def test_names(self):
        reg = FrameworkRegistry()
        reg.register(FrameworkInfo(name="a", display_name="A"))
        reg.register(FrameworkInfo(name="b", display_name="B"))
        assert reg.names() == ["a", "b"]

    def test_overwrite(self):
        reg = FrameworkRegistry()
        reg.register(FrameworkInfo(name="a", display_name="A1"))
        reg.register(FrameworkInfo(name="a", display_name="A2"))
        assert reg.get("a").display_name == "A2"


class TestBuiltinFrameworks:
    def test_all_five_registered(self):
        names = _registry.names()
        assert "langchain" in names
        assert "crewai" in names
        assert "autogen" in names
        assert "llamaindex" in names
        assert "openai_agents" in names

    def test_get_supported_frameworks_returns_list(self):
        frameworks = get_supported_frameworks()
        assert isinstance(frameworks, list)
        assert len(frameworks) >= 5
        names = [f["name"] for f in frameworks]
        assert "langchain" in names
        assert "crewai" in names

    def test_supported_frameworks_have_expected_keys(self):
        frameworks = get_supported_frameworks()
        for fw in frameworks:
            assert "name" in fw
            assert "display_name" in fw
            assert "detect_packages" in fw
            assert "installed" in fw
