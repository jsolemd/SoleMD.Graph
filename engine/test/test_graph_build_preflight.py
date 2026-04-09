from __future__ import annotations

from unittest.mock import MagicMock

import pytest

from app.graph import build


def _raise_preflight_failed():
    raise RuntimeError("preflight failed")


def test_run_graph_build_fails_before_cleanup_when_preflight_fails(monkeypatch):
    cleanup = MagicMock()

    monkeypatch.setattr(build, "_check_memory_pressure", lambda: None)
    monkeypatch.setattr(build, "_cleanup_stale_build_artifacts", cleanup)
    monkeypatch.setattr(build, "require_graph_build_preflight", _raise_preflight_failed)
    monkeypatch.setattr(build, "_get_langfuse", lambda: None)
    monkeypatch.setattr(build.db, "close_pool", lambda: None)

    with pytest.raises(RuntimeError, match="preflight failed"):
        build.run_graph_build()

    cleanup.assert_not_called()
