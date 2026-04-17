#!/usr/bin/env bash
set -euo pipefail

ENGINE_DIR=/workspaces/SoleMD.Graph/engine
WORKER_VENV=${VIRTUAL_ENV:-/opt/venv}

# CUDA toolkit lives under /usr/local/cuda (devel base ships it there).
# CuPy's runtime JIT and pip-installed RAPIDS resolve headers via these.
export CUDA_PATH=${CUDA_PATH:-/usr/local/cuda}
export CUDA_HOME=${CUDA_HOME:-/usr/local/cuda}

# Sync the active worker environment in place so the preinstalled RAPIDS stack
# and the persisted project environment are the same environment.
if [ -d "$ENGINE_DIR" ]; then
    cd "$ENGINE_DIR"

    if [ ! -x "$WORKER_VENV/bin/python" ]; then
        echo "Expected worker environment at $WORKER_VENV" >&2
        exit 1
    fi

    echo "==> Syncing engine environment..."
    # Preserve the preinstalled RAPIDS stack in /opt/venv; project sync should
    # add repo deps, not prune GPU packages that are intentionally image-owned.
    uv sync --active --inexact --frozen --extra graph --extra ml

    # Verify GPU/RAPIDS surfaces. Single interpreter invocation.
    python -c "
import cuml; print('  cuml OK')
import cugraph; print('  cugraph OK')
import cupy; print('  cupy OK')
import adapters; print('  adapters OK')
"

    echo "==> GPU environment ready."
fi

exec "$@"
