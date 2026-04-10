#!/usr/bin/env bash
set -euo pipefail

ENGINE_DIR=/workspaces/SoleMD.Graph/engine

# RAPIDS base installs CUDA headers/libraries under the conda target tree.
# CuPy's runtime JIT needs CUDA_PATH/CUDA_HOME to point there so it can resolve
# headers like cuda_fp16.h during GPU kernels.
export CUDA_PATH=${CUDA_PATH:-/opt/conda/targets/x86_64-linux}
export CUDA_HOME=${CUDA_HOME:-/opt/conda/targets/x86_64-linux}

# Auto-provision on first run, then sync on every start so the persisted
# venv cannot drift away from the lockfile or required extras.
if [ -d "$ENGINE_DIR" ]; then
    cd "$ENGINE_DIR"

    if [ ! -f "$ENGINE_DIR/.venv/pyvenv.cfg" ]; then
        echo "==> Provisioning engine environment (first run)..."
        uv venv --system-site-packages
    fi

    echo "==> Syncing engine environment..."
    uv sync --frozen --extra graph --extra ml

    # Verify the runtime surfaces that the graph container is expected to serve.
    # Single invocation avoids 4x Python interpreter startup overhead.
    uv run python -c "
import cuml; print('  cuml OK')
import cugraph; print('  cugraph OK')
import cupy; print('  cupy OK')
import adapters; print('  adapters OK')
"

    echo "==> GPU environment ready."
fi

exec "$@"
