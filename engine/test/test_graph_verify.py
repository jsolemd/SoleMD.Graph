from __future__ import annotations

from types import SimpleNamespace

import pytest

from app.graph import verify as graph_verify
from app.graph.verify import (
    GraphEnvironmentSummary,
    GraphVerificationSummary,
    load_graph_environment_summary,
    require_graph_build_preflight,
)


def _environment(**overrides):
    base = {
        "graph_layout_backend_requested": "auto",
        "nvidia_smi_present": True,
        "nvidia_smi_ok": True,
        "gpu_name": "NVIDIA RTX",
        "cuda_toolkit_present": True,
        "nvcc_present": True,
        "ptxas_present": True,
        "nvrtc_present": True,
        "cuml_available": True,
        "cuml_native_available": True,
        "cugraph_available": True,
        "cupy_available": True,
        "effective_layout_backend": "cuml_native",
    }
    base.update(overrides)
    return GraphEnvironmentSummary(**base)


def test_load_graph_environment_summary_reports_native_backend(monkeypatch):
    monkeypatch.setattr(
        graph_verify,
        "settings",
        SimpleNamespace(graph_layout_backend="auto"),
    )
    monkeypatch.setattr(graph_verify, "_probe_nvidia_smi", lambda: (True, True, "GPU"))
    monkeypatch.setattr(
        graph_verify,
        "_cuda_runtime_summary",
        lambda: (True, True, True, True),
    )
    monkeypatch.setattr(
        graph_verify,
        "_module_available",
        lambda module_name: module_name in {"cuml", "cugraph", "cupy"},
    )
    monkeypatch.setattr(graph_verify, "has_native_cuml_layout_stack", lambda: True)

    summary = load_graph_environment_summary()

    assert summary.cuml_native_available is True
    assert summary.effective_layout_backend == "cuml_native"


def test_load_graph_environment_summary_falls_back_when_native_stack_is_missing(monkeypatch):
    monkeypatch.setattr(
        graph_verify,
        "settings",
        SimpleNamespace(graph_layout_backend="gpu"),
    )
    monkeypatch.setattr(graph_verify, "_probe_nvidia_smi", lambda: (True, True, "GPU"))
    monkeypatch.setattr(
        graph_verify,
        "_cuda_runtime_summary",
        lambda: (False, False, False, False),
    )
    monkeypatch.setattr(graph_verify, "_module_available", lambda module_name: False)
    monkeypatch.setattr(graph_verify, "has_native_cuml_layout_stack", lambda: False)

    summary = load_graph_environment_summary()

    assert summary.effective_layout_backend == "cpu"


def test_require_graph_build_preflight_returns_summary_when_ready(monkeypatch):
    summary = GraphVerificationSummary(
        total_mapped=10,
        total_mapped_papers=8,
        current_mapped=6,
        current_base=4,
        ready_for_layout=6,
        missing_embeddings=0,
        missing_text_availability=0,
        environment=_environment(),
    )
    monkeypatch.setattr(
        graph_verify,
        "load_graph_verification_summary",
        lambda: summary,
    )

    returned = require_graph_build_preflight()

    assert returned is summary


def test_require_graph_build_preflight_rejects_missing_embeddings(monkeypatch):
    summary = GraphVerificationSummary(
        total_mapped=10,
        total_mapped_papers=8,
        current_mapped=6,
        current_base=4,
        ready_for_layout=0,
        missing_embeddings=1,
        missing_text_availability=0,
        environment=_environment(),
    )
    monkeypatch.setattr(
        graph_verify,
        "load_graph_verification_summary",
        lambda: summary,
    )

    with pytest.raises(RuntimeError, match="graph build is not ready for layout"):
        require_graph_build_preflight()


def test_require_graph_build_preflight_rejects_missing_native_gpu_stack(monkeypatch):
    summary = GraphVerificationSummary(
        total_mapped=10,
        total_mapped_papers=8,
        current_mapped=6,
        current_base=4,
        ready_for_layout=6,
        missing_embeddings=0,
        missing_text_availability=0,
        environment=_environment(
            graph_layout_backend_requested="gpu",
            cuml_native_available=False,
            effective_layout_backend="cpu",
        ),
    )
    monkeypatch.setattr(
        graph_verify,
        "load_graph_verification_summary",
        lambda: summary,
    )

    with pytest.raises(RuntimeError, match="GPU layout requested"):
        require_graph_build_preflight()
