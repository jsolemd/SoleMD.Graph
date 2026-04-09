from __future__ import annotations

import re
from collections.abc import Iterator
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]

# Scoped to the human-facing architectural docs. Other doc trees
# (plans/, agentic/, investigations/, audit/, archive/) are historical
# records and are intentionally excluded from these contract tests.
CANONICAL_DOC_DIRS = ("docs/map", "docs/design")

# Matches markdown link targets: ]( ... ) where the target has no whitespace.
# Does not match reference-style [text][ref] links — we don't use those.
_LINK_PATTERN = re.compile(r"\]\(([^)\s]+)\)")


def _read(relative_path: str) -> str:
    return (REPO_ROOT / relative_path).read_text()


def _iter_canonical_docs() -> Iterator[Path]:
    for relative_dir in CANONICAL_DOC_DIRS:
        for path in sorted((REPO_ROOT / relative_dir).glob("*.md")):
            yield path


def test_base_admission_docs_use_graph_base_points_contract() -> None:
    critical_docs = [
        "docs/design/vision.md",
        "docs/map/architecture.md",
        "docs/map/graph-build.md",
    ]
    for relative_path in critical_docs:
        text = _read(relative_path)
        assert "graph_points.is_in_base" not in text
        assert "graph_points.base_rank" not in text
        assert "graph_base_points" in text


def test_docs_avoid_stale_fixed_base_size_language() -> None:
    critical_docs = [
        "docs/design/vision.md",
        "docs/map/graph-build.md",
        "docs/map/ingest.md",
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
    assert "SPECTER2 ad-hoc query" in text
    assert "dense chunk ANN is not in the live request path" in text


def test_canonical_docs_are_strictly_ascii() -> None:
    """Architectural docs must stay ASCII-only so diffs, greps, and terminal
    tooling never surprise us with smart quotes or em-dashes."""
    for md in _iter_canonical_docs():
        data = md.read_bytes()
        try:
            data.decode("ascii")
        except UnicodeDecodeError:
            text = data.decode("utf-8")
            non_ascii = sorted({c for c in text if ord(c) > 127})
            pretty = " ".join(
                f"{c!r}(U+{ord(c):04X})" for c in non_ascii[:10]
            )
            raise AssertionError(
                f"{md.relative_to(REPO_ROOT)} contains non-ASCII: {pretty}"
            )


def test_canonical_docs_have_no_broken_markdown_links() -> None:
    """Every relative `.md` link inside docs/map and docs/design must
    resolve to a real file on disk."""
    failures: list[str] = []
    for md in _iter_canonical_docs():
        text = md.read_text()
        for match in _LINK_PATTERN.finditer(text):
            target = match.group(1)
            if target.startswith(("http://", "https://", "mailto:", "#")):
                continue
            if ".md" not in target:
                continue
            path_part = target.split("#", 1)[0]
            if not path_part:
                continue
            resolved = (md.parent / path_part).resolve()
            if not resolved.exists():
                failures.append(
                    f"{md.relative_to(REPO_ROOT)} -> {target} "
                    f"(resolves to {resolved})"
                )
    assert not failures, "Broken markdown links:\n  " + "\n  ".join(failures)


def test_canonical_docs_respect_soft_line_cap() -> None:
    """Soft cap to prevent re-bloat. If a doc grows past the cap, split it,
    trim prose, or push API-level detail into a source file docstring."""
    cap = 1500
    oversize: list[str] = []
    for md in _iter_canonical_docs():
        lines = md.read_text().count("\n")
        if lines >= cap:
            oversize.append(
                f"{md.relative_to(REPO_ROOT)}: {lines} lines (cap {cap})"
            )
    assert not oversize, (
        "Docs exceeded soft line cap:\n  "
        + "\n  ".join(oversize)
        + "\nConsider trimming prose or moving detail into source docstrings."
    )
