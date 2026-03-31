"""Release-sidecar source-unit locators for targeted RAG refreshes."""

from __future__ import annotations

import sqlite3
from collections import defaultdict
from collections.abc import Sequence
from pathlib import Path

from pydantic import Field

from app.config import settings
from app.rag.orchestrator_units import RagRefreshSourceKind
from app.rag.parse_contract import ParseContractModel, ParseSourceSystem


class RagSourceLocatorEntry(ParseContractModel):
    corpus_id: int
    source_system: ParseSourceSystem
    source_revision: str
    source_kind: RagRefreshSourceKind
    unit_name: str
    unit_ordinal: int
    source_document_key: str


class RagSourceLocatorLookup(ParseContractModel):
    entries: list[RagSourceLocatorEntry] = Field(default_factory=list)

    @property
    def by_corpus_id(self) -> dict[int, RagSourceLocatorEntry]:
        return {entry.corpus_id: entry for entry in self.entries}

    @property
    def by_unit_name(self) -> dict[str, list[RagSourceLocatorEntry]]:
        grouped: dict[str, list[RagSourceLocatorEntry]] = defaultdict(list)
        for entry in self.entries:
            grouped[entry.unit_name].append(entry)
        return dict(grouped)

    @property
    def unit_names(self) -> list[str]:
        return sorted({entry.unit_name for entry in self.entries})

    @property
    def covered_corpus_ids(self) -> list[int]:
        return sorted({entry.corpus_id for entry in self.entries})

    def missing_corpus_ids(self, requested_corpus_ids: Sequence[int]) -> list[int]:
        covered = set(self.covered_corpus_ids)
        return [int(corpus_id) for corpus_id in requested_corpus_ids if int(corpus_id) not in covered]


_CREATE_SQL = """
CREATE TABLE IF NOT EXISTS source_locator (
    corpus_id BIGINT NOT NULL,
    source_system TEXT NOT NULL,
    source_revision TEXT NOT NULL,
    source_kind TEXT NOT NULL,
    unit_name TEXT NOT NULL,
    unit_ordinal INTEGER NOT NULL,
    source_document_key TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (corpus_id, source_system, source_revision)
);
"""

_INDEX_SQL = (
    "CREATE INDEX IF NOT EXISTS idx_source_locator_unit "
    "ON source_locator (source_system, source_revision, unit_name, unit_ordinal, corpus_id)"
)

_UPSERT_SQL = """
INSERT INTO source_locator (
    corpus_id,
    source_system,
    source_revision,
    source_kind,
    unit_name,
    unit_ordinal,
    source_document_key
)
VALUES (?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(corpus_id, source_system, source_revision)
DO UPDATE SET
    source_kind = excluded.source_kind,
    unit_name = excluded.unit_name,
    unit_ordinal = excluded.unit_ordinal,
    source_document_key = excluded.source_document_key,
    updated_at = CURRENT_TIMESTAMP
WHERE
    source_locator.source_kind IS NOT excluded.source_kind
    OR source_locator.unit_name IS NOT excluded.unit_name
    OR source_locator.unit_ordinal IS NOT excluded.unit_ordinal
    OR source_locator.source_document_key IS NOT excluded.source_document_key
"""

_FETCH_SQL = """
SELECT
    corpus_id,
    source_system,
    source_revision,
    source_kind,
    unit_name,
    unit_ordinal,
    source_document_key
FROM source_locator
WHERE source_system = ?
  AND source_revision = ?
  AND corpus_id IN ({placeholders})
ORDER BY corpus_id
"""


def locator_sidecar_path(
    *,
    source_system: ParseSourceSystem,
    source_revision: str,
) -> Path:
    normalized_source_system = ParseSourceSystem(str(source_system))
    if normalized_source_system == ParseSourceSystem.S2ORC_V2:
        release_path = settings.semantic_scholar_release_path(source_revision)
    elif normalized_source_system == ParseSourceSystem.BIOCXML:
        release_path = settings.pubtator_release_path(source_revision)
    else:
        raise ValueError(f"unsupported source system for locator path: {normalized_source_system}")
    return release_path / "manifests" / f"{normalized_source_system.value}.corpus_locator.sqlite"


def _connect_sqlite(path: Path) -> sqlite3.Connection:
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.execute("PRAGMA temp_store=MEMORY")
    conn.execute(_CREATE_SQL)
    conn.execute(_INDEX_SQL)
    return conn


class SidecarRagSourceLocatorRepository:
    """SQLite-backed release-sidecar locator repository."""

    def upsert_entries(self, entries: Sequence[RagSourceLocatorEntry]) -> int:
        if not entries:
            return 0
        grouped: dict[Path, list[RagSourceLocatorEntry]] = defaultdict(list)
        for entry in entries:
            grouped[
                locator_sidecar_path(
                    source_system=ParseSourceSystem(str(entry.source_system)),
                    source_revision=entry.source_revision,
                )
            ].append(entry)

        written = 0
        for path, path_entries in grouped.items():
            with _connect_sqlite(path) as conn:
                conn.executemany(
                    _UPSERT_SQL,
                    [
                        (
                            int(entry.corpus_id),
                            str(entry.source_system),
                            entry.source_revision,
                            str(entry.source_kind),
                            entry.unit_name,
                            int(entry.unit_ordinal),
                            entry.source_document_key,
                        )
                        for entry in path_entries
                    ],
                )
                conn.commit()
                written += len(path_entries)
        return written

    def fetch_entries(
        self,
        *,
        corpus_ids: Sequence[int],
        source_system: ParseSourceSystem,
        source_revision: str,
    ) -> RagSourceLocatorLookup:
        normalized_corpus_ids = list(dict.fromkeys(int(corpus_id) for corpus_id in corpus_ids))
        if not normalized_corpus_ids:
            return RagSourceLocatorLookup(entries=[])
        path = locator_sidecar_path(
            source_system=ParseSourceSystem(str(source_system)),
            source_revision=source_revision,
        )
        if not path.exists():
            return RagSourceLocatorLookup(entries=[])

        placeholders = ", ".join("?" for _ in normalized_corpus_ids)
        sql = _FETCH_SQL.format(placeholders=placeholders)
        with _connect_sqlite(path) as conn:
            rows = conn.execute(
                sql,
                (
                    ParseSourceSystem(str(source_system)).value,
                    source_revision,
                    *normalized_corpus_ids,
                ),
            ).fetchall()
        return RagSourceLocatorLookup(
            entries=[RagSourceLocatorEntry.model_validate(dict(row)) for row in rows]
        )
