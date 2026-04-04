"""Release-sidecar archive manifest for bounded BioCXML discovery windows."""

from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Sequence

from pydantic import Field

from app.config import settings
from app.rag.parse_contract import ParseContractModel


class RagBioCArchiveManifestEntry(ParseContractModel):
    source_revision: str
    archive_name: str
    document_ordinal: int
    member_name: str
    document_id: str
    skip_reason: str | None = None


class RagBioCArchiveManifestSkip(ParseContractModel):
    source_revision: str
    archive_name: str
    document_ordinal: int
    document_id: str
    skip_reason: str


class RagBioCArchiveManifestLookup(ParseContractModel):
    covered_until_ordinal: int = 0
    entries: list[RagBioCArchiveManifestEntry] = Field(default_factory=list)


_CREATE_SQL = """
CREATE TABLE IF NOT EXISTS archive_manifest (
    archive_name TEXT NOT NULL,
    document_ordinal INTEGER NOT NULL,
    member_name TEXT NOT NULL,
    document_id TEXT NOT NULL,
    skip_reason TEXT NULL,
    skip_updated_at TEXT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (archive_name, document_ordinal)
);
"""

_INDEX_SQL = (
    "CREATE INDEX IF NOT EXISTS idx_archive_manifest_document_id "
    "ON archive_manifest (archive_name, document_id, document_ordinal)"
)

_DOCUMENT_ID_INDEX_SQL = (
    "CREATE INDEX IF NOT EXISTS idx_archive_manifest_document_id_global "
    "ON archive_manifest (document_id)"
)

_UPSERT_SQL = """
INSERT INTO archive_manifest (
    archive_name,
    document_ordinal,
    member_name,
    document_id,
    skip_reason,
    skip_updated_at
)
VALUES (?, ?, ?, ?, ?, ?)
ON CONFLICT(archive_name, document_ordinal)
DO UPDATE SET
    member_name = excluded.member_name,
    document_id = excluded.document_id,
    skip_reason = COALESCE(excluded.skip_reason, archive_manifest.skip_reason),
    skip_updated_at = CASE
        WHEN excluded.skip_reason IS NOT NULL THEN excluded.skip_updated_at
        ELSE archive_manifest.skip_updated_at
    END,
    updated_at = CURRENT_TIMESTAMP
WHERE
    archive_manifest.member_name IS NOT excluded.member_name
    OR archive_manifest.document_id IS NOT excluded.document_id
    OR (
        excluded.skip_reason IS NOT NULL
        AND archive_manifest.skip_reason IS NOT excluded.skip_reason
    )
"""

_FETCH_WINDOW_SQL = """
SELECT archive_name, document_ordinal, member_name, document_id, skip_reason
FROM archive_manifest
WHERE archive_name = ?
  AND document_ordinal >= ?
  AND skip_reason IS NULL
ORDER BY document_ordinal
LIMIT ?
"""

_FETCH_WINDOW_COVERAGE_SQL = """
SELECT COALESCE(MAX(document_ordinal), 0) AS covered_until_ordinal
FROM (
    SELECT document_ordinal
    FROM archive_manifest
    WHERE archive_name = ?
      AND document_ordinal >= ?
    ORDER BY document_ordinal
    LIMIT ?
) window_rows
"""

_MARK_SKIPPED_SQL = """
UPDATE archive_manifest
SET
    skip_reason = ?,
    skip_updated_at = CURRENT_TIMESTAMP,
    updated_at = CURRENT_TIMESTAMP
WHERE archive_name = ?
  AND document_ordinal = ?
  AND document_id = ?
  AND (skip_reason IS NULL OR skip_reason IS NOT ?)
"""

_RESOLVE_BY_DOCUMENT_IDS_SQL = """
SELECT archive_name, document_ordinal, member_name, document_id, skip_reason
FROM archive_manifest
WHERE document_id IN ({placeholders})
  AND skip_reason IS NULL
ORDER BY document_id, archive_name, document_ordinal
"""

_FETCH_SKIPPED_DOCUMENT_IDS_SQL = """
SELECT document_id
FROM archive_manifest
WHERE archive_name = ?
  AND skip_reason IS NOT NULL
  AND document_id IN ({placeholders})
"""

_MAX_ORDINAL_SQL = """
SELECT COALESCE(MAX(document_ordinal), 0) AS max_document_ordinal
FROM archive_manifest
WHERE archive_name = ?
"""


def bioc_archive_manifest_sidecar_path(*, source_revision: str) -> Path:
    release_path = settings.pubtator_release_path(source_revision)
    return release_path / "manifests" / "biocxml.archive_manifest.sqlite"


def _connect_sqlite(path: Path) -> sqlite3.Connection:
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.execute("PRAGMA temp_store=MEMORY")
    conn.execute(_CREATE_SQL)
    _ensure_optional_columns(conn)
    conn.execute(_INDEX_SQL)
    conn.execute(_DOCUMENT_ID_INDEX_SQL)
    return conn


def _ensure_optional_columns(conn: sqlite3.Connection) -> None:
    columns = {
        str(row["name"])
        for row in conn.execute("PRAGMA table_info(archive_manifest)").fetchall()
    }
    if "skip_reason" not in columns:
        conn.execute("ALTER TABLE archive_manifest ADD COLUMN skip_reason TEXT NULL")
    if "skip_updated_at" not in columns:
        conn.execute("ALTER TABLE archive_manifest ADD COLUMN skip_updated_at TEXT NULL")


class SidecarBioCArchiveManifestRepository:
    """SQLite-backed release-sidecar manifest for BioCXML archive members."""

    def upsert_entries(self, entries: Sequence[RagBioCArchiveManifestEntry]) -> int:
        if not entries:
            return 0
        by_path: dict[Path, list[RagBioCArchiveManifestEntry]] = {}
        for entry in entries:
            path = bioc_archive_manifest_sidecar_path(source_revision=entry.source_revision)
            by_path.setdefault(path, []).append(entry)

        written = 0
        for path, path_entries in by_path.items():
            with _connect_sqlite(path) as conn:
                conn.executemany(
                    _UPSERT_SQL,
                    [
                        (
                            entry.archive_name,
                            int(entry.document_ordinal),
                            entry.member_name,
                            entry.document_id,
                            entry.skip_reason,
                            None,
                        )
                        for entry in path_entries
                    ],
                )
                conn.commit()
                written += len(path_entries)
        return written

    def fetch_window(
        self,
        *,
        source_revision: str,
        archive_name: str,
        start_document_ordinal: int,
        limit: int,
    ) -> RagBioCArchiveManifestLookup:
        if start_document_ordinal <= 0:
            raise ValueError("start_document_ordinal must be positive")
        if limit <= 0:
            raise ValueError("limit must be positive")
        path = bioc_archive_manifest_sidecar_path(source_revision=source_revision)
        if not path.exists():
            return RagBioCArchiveManifestLookup(covered_until_ordinal=0, entries=[])
        with _connect_sqlite(path) as conn:
            coverage_row = conn.execute(
                _FETCH_WINDOW_COVERAGE_SQL,
                (archive_name, int(start_document_ordinal), int(limit)),
            ).fetchone()
            rows = conn.execute(
                _FETCH_WINDOW_SQL,
                (archive_name, int(start_document_ordinal), int(limit)),
            ).fetchall()
        return RagBioCArchiveManifestLookup(
            covered_until_ordinal=(
                int(coverage_row["covered_until_ordinal"])
                if coverage_row is not None and coverage_row["covered_until_ordinal"] is not None
                else 0
            ),
            entries=[
                RagBioCArchiveManifestEntry(
                    source_revision=source_revision,
                    archive_name=str(row["archive_name"]),
                    document_ordinal=int(row["document_ordinal"]),
                    member_name=str(row["member_name"]),
                    document_id=str(row["document_id"]),
                    skip_reason=(
                        str(row["skip_reason"])
                        if row["skip_reason"] is not None
                        else None
                    ),
                )
                for row in rows
            ]
        )

    def max_document_ordinal(
        self,
        *,
        source_revision: str,
        archive_name: str,
    ) -> int:
        path = bioc_archive_manifest_sidecar_path(source_revision=source_revision)
        if not path.exists():
            return 0
        with _connect_sqlite(path) as conn:
            row = conn.execute(_MAX_ORDINAL_SQL, (archive_name,)).fetchone()
        if row is None or row["max_document_ordinal"] is None:
            return 0
        return int(row["max_document_ordinal"])

    def mark_skipped(self, entries: Sequence[RagBioCArchiveManifestSkip]) -> int:
        if not entries:
            return 0
        by_path: dict[Path, list[RagBioCArchiveManifestSkip]] = {}
        for entry in entries:
            path = bioc_archive_manifest_sidecar_path(source_revision=entry.source_revision)
            by_path.setdefault(path, []).append(entry)

        written = 0
        for path, path_entries in by_path.items():
            with _connect_sqlite(path) as conn:
                conn.executemany(
                    _MARK_SKIPPED_SQL,
                    [
                        (
                            entry.skip_reason,
                            entry.archive_name,
                            int(entry.document_ordinal),
                            entry.document_id,
                            entry.skip_reason,
                        )
                        for entry in path_entries
                    ],
                )
                conn.commit()
                written += len(path_entries)
        return written

    def resolve_by_document_ids(
        self,
        *,
        source_revision: str,
        document_ids: Sequence[str],
    ) -> list[RagBioCArchiveManifestEntry]:
        """Look up manifest entries by document_id (PMID) across all archives."""

        normalized = list(dict.fromkeys(str(d) for d in document_ids))
        if not normalized:
            return []
        path = bioc_archive_manifest_sidecar_path(source_revision=source_revision)
        if not path.exists():
            return []
        placeholders = ", ".join("?" for _ in normalized)
        sql = _RESOLVE_BY_DOCUMENT_IDS_SQL.format(placeholders=placeholders)
        with _connect_sqlite(path) as conn:
            rows = conn.execute(sql, normalized).fetchall()
        seen: set[str] = set()
        entries: list[RagBioCArchiveManifestEntry] = []
        for row in rows:
            doc_id = str(row["document_id"])
            if doc_id in seen:
                continue
            seen.add(doc_id)
            entries.append(
                RagBioCArchiveManifestEntry(
                    source_revision=source_revision,
                    archive_name=str(row["archive_name"]),
                    document_ordinal=int(row["document_ordinal"]),
                    member_name=str(row["member_name"]),
                    document_id=doc_id,
                    skip_reason=None,
                )
            )
        return entries

    def fetch_skipped_document_ids(
        self,
        *,
        source_revision: str,
        archive_name: str,
        document_ids: Sequence[str],
    ) -> set[str]:
        normalized_document_ids = list(dict.fromkeys(str(document_id) for document_id in document_ids))
        if not normalized_document_ids:
            return set()
        path = bioc_archive_manifest_sidecar_path(source_revision=source_revision)
        if not path.exists():
            return set()
        placeholders = ", ".join("?" for _ in normalized_document_ids)
        sql = _FETCH_SKIPPED_DOCUMENT_IDS_SQL.format(placeholders=placeholders)
        with _connect_sqlite(path) as conn:
            rows = conn.execute(
                sql,
                (archive_name, *normalized_document_ids),
            ).fetchall()
        return {str(row["document_id"]) for row in rows}
