"""DB-backed source-unit claims for parallel RAG warehouse refresh runs."""

from __future__ import annotations

from enum import StrEnum
from pathlib import Path
from typing import Protocol

from pydantic import Field, model_validator

from app import db
from app.rag.parse_contract import ParseContractModel


class RagRefreshSourceKind(StrEnum):
    S2_SHARD = "s2_shard"
    BIOC_ARCHIVE = "bioc_archive"


class RagRefreshUnitStatus(StrEnum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class RagRefreshWorker(ParseContractModel):
    worker_count: int = 1
    worker_index: int = 0

    @model_validator(mode="after")
    def validate_worker(self) -> "RagRefreshWorker":
        if self.worker_count <= 0:
            raise ValueError("worker_count must be positive")
        if self.worker_index < 0 or self.worker_index >= self.worker_count:
            raise ValueError("worker_index must be in [0, worker_count)")
        return self

    @property
    def worker_key(self) -> str:
        return f"worker-{self.worker_index:02d}-of-{self.worker_count:02d}"

    @property
    def checkpoint_suffix(self) -> str | None:
        if self.worker_count <= 1:
            return None
        return self.worker_key


class RagRefreshUnitClaim(ParseContractModel):
    run_id: str
    source_kind: RagRefreshSourceKind
    unit_name: str
    unit_path: str
    assigned_worker_index: int
    worker_count: int
    status: RagRefreshUnitStatus
    claim_attempts: int = 0
    metadata: dict[str, object] = Field(default_factory=dict)

    @property
    def path(self) -> Path:
        return Path(self.unit_path)


class RagRefreshRunState(ParseContractModel):
    run_id: str
    source_driven: bool
    worker_count: int
    requested_limit: int | None = None
    selected_target_count: int = 0

    @property
    def limit_reached(self) -> bool:
        return self.requested_limit is not None and self.selected_target_count >= self.requested_limit


class RagRefreshUnitStore(Protocol):
    def reset_run(self, *, run_id: str) -> None: ...

    def ensure_source_driven_run(
        self,
        *,
        run_id: str,
        worker: RagRefreshWorker,
        requested_limit: int | None,
    ) -> RagRefreshRunState: ...

    def get_source_driven_run_state(self, *, run_id: str) -> RagRefreshRunState | None: ...

    def reserve_source_driven_targets(
        self,
        *,
        run_id: str,
        worker: RagRefreshWorker,
        source_kind: RagRefreshSourceKind,
        unit_name: str,
        candidate_ids: list[int],
    ) -> list[int]: ...

    def list_source_driven_targets(self, *, run_id: str) -> list[int]: ...

    def ensure_units(
        self,
        *,
        run_id: str,
        source_kind: RagRefreshSourceKind,
        unit_paths: list[Path],
        worker: RagRefreshWorker,
    ) -> None: ...

    def claim_next_unit(
        self,
        *,
        run_id: str,
        source_kind: RagRefreshSourceKind,
        worker: RagRefreshWorker,
    ) -> RagRefreshUnitClaim | None: ...

    def get_unit_progress_ordinal(
        self,
        *,
        run_id: str,
        source_kind: RagRefreshSourceKind,
        unit_name: str,
    ) -> int: ...

    def save_unit_progress_ordinal(
        self,
        *,
        run_id: str,
        source_kind: RagRefreshSourceKind,
        unit_name: str,
        worker: RagRefreshWorker,
        processed_ordinal: int,
        last_corpus_id: int | None = None,
    ) -> None: ...

    def mark_completed(
        self,
        *,
        run_id: str,
        source_kind: RagRefreshSourceKind,
        unit_name: str,
        worker: RagRefreshWorker,
    ) -> None: ...

    def mark_failed(
        self,
        *,
        run_id: str,
        source_kind: RagRefreshSourceKind,
        unit_name: str,
        worker: RagRefreshWorker,
        error_message: str,
    ) -> None: ...

    def list_completed_units(
        self,
        *,
        run_id: str,
        source_kind: RagRefreshSourceKind,
        worker: RagRefreshWorker | None = None,
    ) -> list[str]: ...


class PostgresRagRefreshUnitStore:
    """Atomic source-unit claims backed by PostgreSQL."""

    def __init__(self, connect=None):
        self._connect = connect or db.pooled

    def reset_run(self, *, run_id: str) -> None:
        with self._connect() as conn, conn.cursor() as cur:
            cur.execute(
                """
                DELETE FROM solemd.rag_refresh_selected_targets
                WHERE run_id = %s
                """,
                (run_id,),
            )
            cur.execute(
                """
                DELETE FROM solemd.rag_refresh_runs
                WHERE run_id = %s
                """,
                (run_id,),
            )
            cur.execute(
                """
                DELETE FROM solemd.rag_refresh_source_units
                WHERE run_id = %s
                """,
                (run_id,),
            )
            conn.commit()

    def ensure_source_driven_run(
        self,
        *,
        run_id: str,
        worker: RagRefreshWorker,
        requested_limit: int | None,
    ) -> RagRefreshRunState:
        with self._connect() as conn, conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO solemd.rag_refresh_runs (
                    run_id,
                    source_driven,
                    worker_count,
                    requested_limit
                )
                VALUES (%s, true, %s, %s)
                ON CONFLICT (run_id)
                DO UPDATE
                SET requested_limit = CASE
                        WHEN solemd.rag_refresh_runs.requested_limit IS NULL THEN EXCLUDED.requested_limit
                        ELSE solemd.rag_refresh_runs.requested_limit
                    END
                RETURNING run_id, source_driven, worker_count, requested_limit, selected_target_count
                """,
                (run_id, worker.worker_count, requested_limit),
            )
            row = cur.fetchone()
            conn.commit()
        assert row is not None
        state = RagRefreshRunState.model_validate(row)
        if state.worker_count != worker.worker_count:
            raise ValueError("source-driven refresh run worker_count does not match existing run state")
        if state.requested_limit != requested_limit:
            raise ValueError("source-driven refresh run limit does not match existing run state")
        return state

    def get_source_driven_run_state(self, *, run_id: str) -> RagRefreshRunState | None:
        with self._connect() as conn, conn.cursor() as cur:
            cur.execute(
                """
                SELECT run_id, source_driven, worker_count, requested_limit, selected_target_count
                FROM solemd.rag_refresh_runs
                WHERE run_id = %s
                """,
                (run_id,),
            )
            row = cur.fetchone()
        if row is None:
            return None
        return RagRefreshRunState.model_validate(row)

    def reserve_source_driven_targets(
        self,
        *,
        run_id: str,
        worker: RagRefreshWorker,
        source_kind: RagRefreshSourceKind,
        unit_name: str,
        candidate_ids: list[int],
    ) -> list[int]:
        if not candidate_ids:
            return []
        normalized_candidates = list(dict.fromkeys(int(corpus_id) for corpus_id in candidate_ids))
        with self._connect() as conn, conn.cursor() as cur:
            cur.execute(
                """
                SELECT run_id, source_driven, worker_count, requested_limit, selected_target_count
                FROM solemd.rag_refresh_runs
                WHERE run_id = %s
                FOR UPDATE
                """,
                (run_id,),
            )
            row = cur.fetchone()
            if row is None:
                raise ValueError("source-driven refresh run state is missing")
            state = RagRefreshRunState.model_validate(row)
            if state.worker_count != worker.worker_count:
                raise ValueError("source-driven refresh run worker_count does not match requested worker")
            if state.limit_reached:
                conn.commit()
                return []
            cur.execute(
                """
                SELECT corpus_id
                FROM solemd.rag_refresh_selected_targets
                WHERE run_id = %s
                  AND corpus_id = ANY(%s)
                """,
                (run_id, normalized_candidates),
            )
            existing_ids = {int(result["corpus_id"]) for result in cur.fetchall()}
            remaining_budget = (
                max(state.requested_limit - state.selected_target_count, 0)
                if state.requested_limit is not None
                else None
            )
            selected_ids: list[int] = []
            for corpus_id in normalized_candidates:
                if corpus_id in existing_ids:
                    continue
                if remaining_budget is not None and remaining_budget <= 0:
                    break
                selected_ids.append(corpus_id)
                if remaining_budget is not None:
                    remaining_budget -= 1
            if selected_ids:
                cur.executemany(
                    """
                    INSERT INTO solemd.rag_refresh_selected_targets (
                        run_id,
                        corpus_id,
                        source_kind,
                        unit_name,
                        selected_worker_index
                    )
                    VALUES (%s, %s, %s, %s, %s)
                    ON CONFLICT (run_id, corpus_id) DO NOTHING
                    """,
                    [
                        (run_id, corpus_id, source_kind.value, unit_name, worker.worker_index)
                        for corpus_id in selected_ids
                    ],
                )
                cur.execute(
                    """
                    UPDATE solemd.rag_refresh_runs
                    SET selected_target_count = selected_target_count + %s,
                        updated_at = now()
                    WHERE run_id = %s
                    """,
                    (len(selected_ids), run_id),
                )
            conn.commit()
        return selected_ids

    def list_source_driven_targets(self, *, run_id: str) -> list[int]:
        with self._connect() as conn, conn.cursor() as cur:
            cur.execute(
                """
                SELECT corpus_id
                FROM solemd.rag_refresh_selected_targets
                WHERE run_id = %s
                ORDER BY corpus_id
                """,
                (run_id,),
            )
            return [int(row["corpus_id"]) for row in cur.fetchall()]

    def ensure_units(
        self,
        *,
        run_id: str,
        source_kind: RagRefreshSourceKind,
        unit_paths: list[Path],
        worker: RagRefreshWorker,
    ) -> None:
        if not unit_paths:
            return
        with self._connect() as conn, conn.cursor() as cur:
            cur.execute(
                """
                SELECT DISTINCT worker_count
                FROM solemd.rag_refresh_source_units
                WHERE run_id = %s
                """,
                (run_id,),
            )
            existing_worker_counts = {int(row["worker_count"]) for row in cur.fetchall()}
            if existing_worker_counts and existing_worker_counts != {worker.worker_count}:
                raise ValueError("refresh run worker_count does not match existing claimed source units")
        rows = [
            (
                run_id,
                source_kind.value,
                path.name,
                str(path),
                index % worker.worker_count,
                worker.worker_count,
                RagRefreshUnitStatus.PENDING.value,
            )
            for index, path in enumerate(sorted(unit_paths, key=lambda value: value.name))
        ]
        with self._connect() as conn, conn.cursor() as cur:
            cur.executemany(
                """
                INSERT INTO solemd.rag_refresh_source_units (
                    run_id,
                    source_kind,
                    unit_name,
                    unit_path,
                    assigned_worker_index,
                    worker_count,
                    status
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (run_id, source_kind, unit_name)
                DO UPDATE
                SET unit_path = EXCLUDED.unit_path
                """,
                rows,
            )
            conn.commit()

    def claim_next_unit(
        self,
        *,
        run_id: str,
        source_kind: RagRefreshSourceKind,
        worker: RagRefreshWorker,
    ) -> RagRefreshUnitClaim | None:
        with self._connect() as conn, conn.cursor() as cur:
            cur.execute(
                """
                WITH candidate AS (
                    SELECT run_id, source_kind, unit_name
                    FROM solemd.rag_refresh_source_units
                    WHERE run_id = %s
                      AND source_kind = %s
                      AND worker_count = %s
                      AND assigned_worker_index = %s
                      AND (
                          status IN ('pending', 'failed')
                          OR (status = 'running' AND worker_key = %s)
                      )
                    ORDER BY
                        CASE status
                            WHEN 'running' THEN 0
                            WHEN 'failed' THEN 1
                            ELSE 2
                        END,
                        unit_name
                    FOR UPDATE SKIP LOCKED
                    LIMIT 1
                )
                UPDATE solemd.rag_refresh_source_units AS units
                SET status = 'running',
                    claim_attempts = units.claim_attempts + 1,
                    started_at = COALESCE(units.started_at, now()),
                    heartbeat_at = now(),
                    worker_key = %s,
                    error_message = NULL
                FROM candidate
                WHERE units.run_id = candidate.run_id
                  AND units.source_kind = candidate.source_kind
                  AND units.unit_name = candidate.unit_name
                RETURNING
                    units.run_id,
                    units.source_kind,
                    units.unit_name,
                    units.unit_path,
                    units.assigned_worker_index,
                    units.worker_count,
                    units.status,
                    units.claim_attempts,
                    units.metadata
                """,
                (
                    run_id,
                    source_kind.value,
                    worker.worker_count,
                    worker.worker_index,
                    worker.worker_key,
                    worker.worker_key,
                ),
            )
            row = cur.fetchone()
            conn.commit()
        if row is None:
            return None
        return RagRefreshUnitClaim.model_validate(row)

    def get_unit_progress_ordinal(
        self,
        *,
        run_id: str,
        source_kind: RagRefreshSourceKind,
        unit_name: str,
    ) -> int:
        with self._connect() as conn, conn.cursor() as cur:
            cur.execute(
                """
                SELECT COALESCE((metadata->>'last_processed_ordinal')::bigint, 0) AS last_processed_ordinal
                FROM solemd.rag_refresh_source_units
                WHERE run_id = %s
                  AND source_kind = %s
                  AND unit_name = %s
                """,
                (run_id, source_kind.value, unit_name),
            )
            row = cur.fetchone()
        if row is None or row["last_processed_ordinal"] is None:
            return 0
        return int(row["last_processed_ordinal"])

    def save_unit_progress_ordinal(
        self,
        *,
        run_id: str,
        source_kind: RagRefreshSourceKind,
        unit_name: str,
        worker: RagRefreshWorker,
        processed_ordinal: int,
        last_corpus_id: int | None = None,
    ) -> None:
        with self._connect() as conn, conn.cursor() as cur:
            cur.execute(
                """
                UPDATE solemd.rag_refresh_source_units
                SET metadata = metadata || jsonb_strip_nulls(
                        jsonb_build_object(
                            'last_processed_ordinal', %s::bigint,
                            'last_corpus_id', %s::bigint
                        )
                    ),
                    heartbeat_at = now()
                WHERE run_id = %s
                  AND source_kind = %s
                  AND unit_name = %s
                  AND worker_count = %s
                  AND assigned_worker_index = %s
                """,
                (
                    processed_ordinal,
                    last_corpus_id,
                    run_id,
                    source_kind.value,
                    unit_name,
                    worker.worker_count,
                    worker.worker_index,
                ),
            )
            conn.commit()

    def mark_completed(
        self,
        *,
        run_id: str,
        source_kind: RagRefreshSourceKind,
        unit_name: str,
        worker: RagRefreshWorker,
    ) -> None:
        self._update_status(
            run_id=run_id,
            source_kind=source_kind,
            unit_name=unit_name,
            worker=worker,
            status=RagRefreshUnitStatus.COMPLETED,
            error_message=None,
        )

    def mark_failed(
        self,
        *,
        run_id: str,
        source_kind: RagRefreshSourceKind,
        unit_name: str,
        worker: RagRefreshWorker,
        error_message: str,
    ) -> None:
        self._update_status(
            run_id=run_id,
            source_kind=source_kind,
            unit_name=unit_name,
            worker=worker,
            status=RagRefreshUnitStatus.FAILED,
            error_message=error_message,
        )

    def list_completed_units(
        self,
        *,
        run_id: str,
        source_kind: RagRefreshSourceKind,
        worker: RagRefreshWorker | None = None,
    ) -> list[str]:
        where_extra = ""
        params: list[object] = [run_id, source_kind.value]
        if worker is not None:
            where_extra = "AND assigned_worker_index = %s AND worker_count = %s"
            params.extend([worker.worker_index, worker.worker_count])
        with self._connect() as conn, conn.cursor() as cur:
            cur.execute(
                f"""
                SELECT unit_name
                FROM solemd.rag_refresh_source_units
                WHERE run_id = %s
                  AND source_kind = %s
                  AND status = 'completed'
                  {where_extra}
                ORDER BY unit_name
                """,
                tuple(params),
            )
            return [str(row["unit_name"]) for row in cur.fetchall()]

    def _update_status(
        self,
        *,
        run_id: str,
        source_kind: RagRefreshSourceKind,
        unit_name: str,
        worker: RagRefreshWorker,
        status: RagRefreshUnitStatus,
        error_message: str | None,
    ) -> None:
        with self._connect() as conn, conn.cursor() as cur:
            cur.execute(
                """
                UPDATE solemd.rag_refresh_source_units
                SET status = %s,
                    heartbeat_at = now(),
                    completed_at = CASE WHEN %s = 'completed' THEN now() ELSE completed_at END,
                    error_message = %s,
                    worker_key = %s
                WHERE run_id = %s
                  AND source_kind = %s
                  AND unit_name = %s
                  AND assigned_worker_index = %s
                  AND worker_count = %s
                """,
                (
                    status.value,
                    status.value,
                    error_message,
                    worker.worker_key,
                    run_id,
                    source_kind.value,
                    unit_name,
                    worker.worker_index,
                    worker.worker_count,
                ),
            )
            conn.commit()
