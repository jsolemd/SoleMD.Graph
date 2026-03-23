#!/usr/bin/env bash
set -euo pipefail

ENGINE_DIR=/workspaces/SoleMD.Graph/engine

# RAPIDS base installs CUDA headers/libraries under the conda target tree.
# CuPy's runtime JIT needs CUDA_PATH/CUDA_HOME to point there so it can resolve
# headers like cuda_fp16.h during GPU kernels.
export CUDA_PATH=${CUDA_PATH:-/opt/conda/targets/x86_64-linux}
export CUDA_HOME=${CUDA_HOME:-/opt/conda/targets/x86_64-linux}

# Auto-provision on first run (venv persisted via named volume)
if [ -d "$ENGINE_DIR" ] && [ ! -f "$ENGINE_DIR/.venv/pyvenv.cfg" ]; then
    echo "==> Provisioning engine environment (first run)..."
    cd "$ENGINE_DIR"

    # Create venv inheriting RAPIDS from system (conda) site-packages
    uv venv --system-site-packages

    # Install engine deps from lockfile
    uv sync --frozen --extra graph

    # Verify RAPIDS is accessible through the venv
    uv run python -c "import cuml; print('  cuml OK')"
    uv run python -c "import cugraph; print('  cugraph OK')"
    uv run python -c "import cupy; print('  cupy OK')"

    echo "==> GPU environment ready."
fi

exec "$@"
