from __future__ import annotations

from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]


def _read(relative_path: str) -> str:
    return (REPO_ROOT / relative_path).read_text()


def test_base_admission_docs_use_graph_base_points_contract() -> None:
    critical_docs = [
        "docs/design/living-graph.md",
        "docs/map/architecture.md",
        "docs/map/corpus-filter.md",
        "docs/map/map.md",
    ]
    for relative_path in critical_docs:
        text = _read(relative_path)
        assert "graph_points.is_in_base" not in text
        assert "graph_points.base_rank" not in text
        assert "graph_base_points" in text


def test_docs_avoid_stale_fixed_base_size_language() -> None:
    critical_docs = [
        "docs/design/living-graph.md",
        "docs/map/graph-layout.md",
        "docs/map/semantic-scholar.md",
    ]
    stale_phrases = (
        "~500K",
        "~1.6M",
        "~1.98M",
    )
    for relative_path in critical_docs:
        text = _read(relative_path)
        for phrase in stale_phrases:
            assert phrase not in text


def test_rag_doc_tracks_live_runtime_contract() -> None:
    text = _read("docs/map/rag.md")
    assert "chunk_lexical" in text
    assert "dense_query" in text
    assert "specter2_adhoc_query" in text
    assert "Chunk vectors are not live in the current runtime." in text
