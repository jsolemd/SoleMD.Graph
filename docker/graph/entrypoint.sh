#!/usr/bin/env bash
set -euo pipefail

ENGINE_DIR=/workspaces/SoleMD.Graph/engine

# CUDA toolkit lives under /usr/local/cuda (devel base ships it there).
# CuPy's runtime JIT and pip-installed RAPIDS resolve headers via these.
export CUDA_PATH=${CUDA_PATH:-/usr/local/cuda}
export CUDA_HOME=${CUDA_HOME:-/usr/local/cuda}

# Auto-provision on first run, then sync on every start so the persisted
# .venv never drifts from the lockfile or required extras.
# --system-site-packages inherits RAPIDS (cuml/cugraph/cupy) from /opt/venv
# without re-downloading their multi-GB wheels into the .venv volume.
if [ -d "$ENGINE_DIR" ]; then
    cd "$ENGINE_DIR"

    if [ ! -f "$ENGINE_DIR/.venv/pyvenv.cfg" ]; then
        echo "==> Provisioning engine environment (first run)..."
        uv venv --python 3.13 --system-site-packages
    fi

    echo "==> Syncing engine environment..."
    uv sync --frozen --extra graph --extra ml

    # Verify GPU/RAPIDS surfaces. Single interpreter invocation.
    uv run python -c "
import cuml; print('  cuml OK')
import cugraph; print('  cugraph OK')
import cupy; print('  cupy OK')
import adapters; print('  adapters OK')
"

    echo "==> GPU environment ready."
fi

exec "$@"
