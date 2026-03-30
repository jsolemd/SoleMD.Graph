"""GPU container detection and dispatch for graph builds."""

from __future__ import annotations

import os
import shutil
import subprocess

GPU_CONTAINER = "solemd-graph-graph"
GPU_WORKDIR = "/workspaces/SoleMD.Graph/engine"
GPU_PYTHON = ".venv/bin/python"


def _is_gpu_container() -> bool:
    """Return True if running inside the GPU graph container."""
    return os.environ.get("GRAPH_LAYOUT_BACKEND", "").lower() == "gpu"


def _gpu_container_running() -> bool:
    """Return True if the GPU graph container is running."""
    docker = shutil.which("docker")
    if not docker:
        return False
    result = subprocess.run(
        [docker, "inspect", "-f", "{{.State.Running}}", GPU_CONTAINER],
        capture_output=True, text=True,
    )
    return result.returncode == 0 and result.stdout.strip() == "true"


def _dispatch_to_gpu(argv: list[str]) -> int:
    """Re-exec the same command inside the GPU container, streaming output."""
    cmd = [
        "docker", "exec", "-w", GPU_WORKDIR, GPU_CONTAINER,
        GPU_PYTHON, "-m", "app.graph.build", *argv,
    ]
    print(f"[dispatch] Running graph build in GPU container ({GPU_CONTAINER})")
    result = subprocess.run(cmd)
    return result.returncode
