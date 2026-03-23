"""Graph build scaffolding: readiness, future layout, and bundle export."""

from __future__ import annotations

from importlib import import_module
from typing import TYPE_CHECKING
from typing import Any

if TYPE_CHECKING:
    from app.graph.build import GraphBuildSummary
    from app.graph.build import GraphBuildResult
    from app.graph.build import run_graph_build
    from app.graph.export_bundle import export_graph_bundle
    from app.graph.export import GraphBundleContract
    from app.graph.verify import GraphEnvironmentSummary
    from app.graph.verify import GraphVerificationSummary
    from app.graph.verify import load_graph_environment_summary
    from app.graph.verify import load_graph_verification_summary

__all__ = [
    "GraphBuildSummary",
    "GraphBuildResult",
    "GraphEnvironmentSummary",
    "GraphVerificationSummary",
    "GraphBundleContract",
    "bundle_contract",
    "export_graph_bundle",
    "graph_ready_for_layout",
    "load_graph_environment_summary",
    "load_graph_build_summary",
    "load_graph_verification_summary",
    "run_graph_build",
]


def __getattr__(name: str) -> Any:
    if name in {"GraphBuildSummary", "GraphBuildResult", "load_graph_build_summary", "run_graph_build"}:
        module = import_module("app.graph.build")
        return getattr(module, name)
    if name == "export_graph_bundle":
        module = import_module("app.graph.export_bundle")
        return getattr(module, name)
    if name in {"GraphBundleContract", "bundle_contract"}:
        module = import_module("app.graph.export")
        return getattr(module, name)
    if name in {
        "graph_ready_for_layout",
        "GraphEnvironmentSummary",
        "GraphVerificationSummary",
        "load_graph_environment_summary",
        "load_graph_verification_summary",
    }:
        module = import_module("app.graph.verify")
        return getattr(module, name)
    raise AttributeError(name)
