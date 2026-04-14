# SoleMD.Graph — GPU Graph Build Container
# Official RAPIDS base with cuML, cuGraph, cuPy pre-installed.
# Usage: docker compose -f docker/compose.yaml --profile gpu up -d

FROM rapidsai/base:26.02-cuda12-py3.13

USER root

ENV CUDA_PATH=/opt/conda/targets/x86_64-linux
ENV CUDA_HOME=/opt/conda/targets/x86_64-linux

# Build essentials for any native Python wheels (leidenalg, igraph)
RUN apt-get update && \
    apt-get install -y --no-install-recommends git build-essential && \
    rm -rf /var/lib/apt/lists/*

# uv package manager (fast dep resolution for engine project)
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /usr/local/bin/

COPY docker/graph/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Bake engine code into image (no bind mount needed)
COPY engine /workspaces/SoleMD.Graph/engine

# Run as root for GPU access and package management in utility container
WORKDIR /workspaces/SoleMD.Graph/engine

ENTRYPOINT ["/entrypoint.sh"]
CMD ["sleep", "infinity"]
