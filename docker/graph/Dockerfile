# SoleMD.Graph — GPU Graph Build Container
#
# Base: nvidia/cuda:13.0.0-devel-ubuntu22.04 — required by RAPIDS pip wheels
# because Numba's JIT needs NVRTC from the CUDA toolkit (devel flavor has it,
# runtime/base do not). See https://docs.rapids.ai/install/
#
# Strategy: pip-install RAPIDS (cuml, cugraph, cupy) + app deps to a shared
# /opt/venv, inheritable by the runtime .venv via uv venv --system-site-packages.
# No conda. Multi-stage build drops build-essential + git from runtime.
# BuildKit cache mount on /root/.cache/uv preserves wheels across rebuilds
# (PyTorch/transformers no longer re-download on every iteration).
#
# Usage: docker compose -f docker/compose.yaml --profile gpu up -d
# syntax=docker/dockerfile:1.7

# -----------------------------------------------------------------------------
# Stage 1: builder — install system deps + Python + pip-installed RAPIDS
# -----------------------------------------------------------------------------
FROM nvidia/cuda:13.0.0-devel-ubuntu22.04 AS builder

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    UV_LINK_MODE=copy

# System deps. deadsnakes for Python 3.13 on 22.04.
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        software-properties-common ca-certificates curl git && \
    add-apt-repository -y ppa:deadsnakes/ppa && \
    apt-get update && \
    apt-get install -y --no-install-recommends \
        python3.13 python3.13-dev python3.13-venv \
        build-essential && \
    update-alternatives --install /usr/bin/python3 python3 /usr/bin/python3.13 1 && \
    update-alternatives --install /usr/bin/python python /usr/bin/python3.13 1 && \
    rm -rf /var/lib/apt/lists/*

# uv — fast pip/venv replacement, cached wheels survive rebuilds via mount.
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /usr/local/bin/

# System venv hosts RAPIDS + heavy ML deps. Runtime-stage .venv inherits
# via uv venv --system-site-packages.
RUN uv venv --python 3.13 /opt/venv
ENV VIRTUAL_ENV=/opt/venv \
    PATH=/opt/venv/bin:$PATH

# RAPIDS 26.04 pip wheels (CUDA 13). Pinned to avoid surprise major bumps.
# cugraph (graph algos), cuml (UMAP/clustering), cupy (GPU arrays).
# cudf pulled as transitive dep if needed; skipping explicit install saves ~2 GB.
RUN --mount=type=cache,target=/root/.cache/uv,sharing=locked \
    uv pip install \
        --extra-index-url=https://pypi.nvidia.com \
        "cugraph-cu13==26.4.*" \
        "cuml-cu13==26.4.*" \
        "cupy-cuda13x"

# -----------------------------------------------------------------------------
# Stage 2: runtime — drop build tools, keep Python + RAPIDS venv
# -----------------------------------------------------------------------------
FROM nvidia/cuda:13.0.0-devel-ubuntu22.04 AS runtime

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    VIRTUAL_ENV=/opt/venv \
    PATH=/opt/venv/bin:$PATH

# Runtime needs Python itself + git (uv sync may fetch git deps) + libgomp1
# (RAPIDS transitive). Skip build-essential — app deps with C-extensions
# (leidenalg, igraph) install from prebuilt wheels on PyPI.
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        software-properties-common ca-certificates curl git libgomp1 && \
    add-apt-repository -y ppa:deadsnakes/ppa && \
    apt-get update && \
    apt-get install -y --no-install-recommends \
        python3.13 python3.13-venv && \
    update-alternatives --install /usr/bin/python3 python3 /usr/bin/python3.13 1 && \
    update-alternatives --install /usr/bin/python python /usr/bin/python3.13 1 && \
    rm -rf /var/lib/apt/lists/*

# uv for runtime venv management (entrypoint.sh uses uv sync).
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /usr/local/bin/

# Copy pip-installed RAPIDS venv from builder.
COPY --from=builder /opt/venv /opt/venv

COPY docker/graph/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Engine code is the most-churned layer — last for best cache reuse.
COPY engine /workspaces/SoleMD.Graph/engine

WORKDIR /workspaces/SoleMD.Graph/engine
ENTRYPOINT ["/entrypoint.sh"]
CMD ["sleep", "infinity"]
