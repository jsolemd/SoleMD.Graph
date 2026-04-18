#!/usr/bin/env bash

set -euo pipefail

NODE_MAJOR=22
CURRENT_NODE_MAJOR=0

if command -v node >/dev/null 2>&1; then
  CURRENT_NODE_MAJOR="$(node -v | sed 's/^v//' | cut -d. -f1)"
fi

if [[ "${CURRENT_NODE_MAJOR}" -lt "${NODE_MAJOR}" ]]; then
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | sudo -E bash -
  sudo apt-get install -y nodejs
fi

if ! command -v uv >/dev/null 2>&1; then
  curl -LsSf https://astral.sh/uv/install.sh | sudo env UV_INSTALL_DIR=/usr/local/bin sh
fi

if command -v corepack >/dev/null 2>&1; then
  sudo corepack enable || corepack enable || true
fi

git lfs install --skip-repo || true
