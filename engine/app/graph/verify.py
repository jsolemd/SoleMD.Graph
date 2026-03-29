"""Verification helpers and diagnostics for graph-build prerequisites."""

from __future__ import annotations

import argparse
import ctypes.util
from dataclasses import asdict
from dataclasses import dataclass
import json
import os
import shutil
import subprocess

from app.config import settings
from app.graph.build import load_graph_build_summary


@dataclass(frozen=True, slots=True)
class GraphEnvironmentSummary:
    graph_layout_backend_requested: str
    nvidia_smi_present: bool
    nvidia_smi_ok: bool
    gpu_name: str | None
    cuda_toolkit_present: bool
    nvcc_present: bool
    ptxas_present: bool
    nvrtc_present: bool
    cuml_available: bool
    cuml_accel_available: bool
    cugraph_available: bool
    cupy_available: bool
    effective_layout_backend: str


@dataclass(frozen=True, slots=True)
class GraphVerificationSummary:
    total_mapped: int
    total_mapped_papers: int
    current_mapped: int
    current_base: int
    ready_for_layout: int
    missing_embeddings: int
    missing_text_availability: int
    environment: GraphEnvironmentSummary


def graph_ready_for_layout() -> bool:
    summary = load_graph_build_summary()
    return summary.ready_for_layout > 0 and summary.missing_embeddings == 0


def _module_available(module_name: str) -> bool:
    try:
        __import__(module_name)
        return True
    except Exception:
        return False


def _probe_nvidia_smi() -> tuple[bool, bool, str | None]:
    binary = shutil.which("nvidia-smi")
    if not binary:
        return False, False, None

    try:
        result = subprocess.run(
            [binary, "--query-gpu=name", "--format=csv,noheader"],
            check=False,
            capture_output=True,
            text=True,
            timeout=5,
        )
    except Exception:
        return True, False, None

    if result.returncode != 0:
        return True, False, None

    name = result.stdout.strip().splitlines()[0] if result.stdout.strip() else None
    return True, True, name


def _cuda_runtime_summary() -> tuple[bool, bool, bool, bool]:
    nvcc_present = shutil.which("nvcc") is not None
    ptxas_present = shutil.which("ptxas") is not None
    cuda_toolkit_present = any(
        os.path.exists(path)
        for path in ("/usr/local/cuda", "/usr/local/cuda-13.0", "/usr/local/cuda-13.2")
    )

    try:
        result = subprocess.run(
            ["ldconfig", "-p"],
            check=False,
            capture_output=True,
            text=True,
            timeout=5,
        )
        nvrtc_present = "libnvrtc" in result.stdout
    except Exception:
        nvrtc_present = False

    if not nvrtc_present:
        nvrtc_present = ctypes.util.find_library("nvrtc") is not None

    if not nvrtc_present:
        try:
            from cupy_backends.cuda.libs import nvrtc as _nvrtc  # noqa: F401
        except Exception:
            pass
        else:
            nvrtc_present = True

    return cuda_toolkit_present, nvcc_present, ptxas_present, nvrtc_present


def load_graph_environment_summary() -> GraphEnvironmentSummary:
    nvidia_present, nvidia_ok, gpu_name = _probe_nvidia_smi()
    cuda_toolkit_present, nvcc_present, ptxas_present, nvrtc_present = _cuda_runtime_summary()
    cuml_available = _module_available("cuml")
    cuml_accel_available = _module_available("cuml.accel")
    cugraph_available = _module_available("cugraph")
    cupy_available = _module_available("cupy")

    requested = settings.graph_layout_backend.strip().lower()
    if requested == "cpu":
        effective = "cpu"
    elif requested in {"gpu", "cuml_accel"}:
        effective = "cuml_accel" if cuml_accel_available else "cpu"
    else:
        effective = "cuml_accel" if cuml_accel_available else "cpu"

    return GraphEnvironmentSummary(
        graph_layout_backend_requested=settings.graph_layout_backend,
        nvidia_smi_present=nvidia_present,
        nvidia_smi_ok=nvidia_ok,
        gpu_name=gpu_name,
        cuda_toolkit_present=cuda_toolkit_present,
        nvcc_present=nvcc_present,
        ptxas_present=ptxas_present,
        nvrtc_present=nvrtc_present,
        cuml_available=cuml_available,
        cuml_accel_available=cuml_accel_available,
        cugraph_available=cugraph_available,
        cupy_available=cupy_available,
        effective_layout_backend=effective,
    )


def load_graph_verification_summary() -> GraphVerificationSummary:
    build = load_graph_build_summary()
    environment = load_graph_environment_summary()
    return GraphVerificationSummary(
        total_mapped=build.total_mapped,
        total_mapped_papers=build.total_mapped_papers,
        current_mapped=build.current_mapped,
        current_base=build.current_base,
        ready_for_layout=build.ready_for_layout,
        missing_embeddings=build.missing_embeddings,
        missing_text_availability=build.missing_text_availability,
        environment=environment,
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Verify graph-build readiness and environment")
    parser.add_argument("--json", action="store_true", help="Emit JSON summary")
    args = parser.parse_args()

    payload = asdict(load_graph_verification_summary())
    if args.json:
        print(json.dumps(payload, indent=2))
        return

    # Human-readable output
    for key, value in payload.items():
        if isinstance(value, dict):
            print(f"  {key}:")
            for k, v in value.items():
                print(f"    {k}: {v}")
        else:
            print(f"  {key}: {value}")


if __name__ == "__main__":
    main()
