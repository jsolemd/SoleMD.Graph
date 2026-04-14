"""Export mapped graph runs into Parquet bundles for the frontend."""

from __future__ import annotations

import json
import logging
import shutil
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import asdict, dataclass
from hashlib import sha256
from pathlib import Path

import pyarrow as pa
import pyarrow.parquet as pq

from app import db
from app.config import settings
from app.graph.build_settings import apply_build_session_settings
from app.graph.export import bundle_contract, validate_bundle_manifest_contract
from app.graph.point_projection import POINTS_SCHEMA, build_point_projection_select_sql
from app.graph.render_policy import renderable_point_predicate_sql
from app.langfuse_config import SPAN_EXPORT_BUNDLE, SPAN_EXPORT_VIEWS, observe
from app.langfuse_config import get_langfuse as _get_langfuse

log = logging.getLogger(__name__)

BUNDLE_VERSION = "4"
PARQUET_ROW_GROUP_SIZE = 122_880


CLUSTERS_SCHEMA = pa.schema(
    [
        ("cluster_id", pa.int32()),
        ("label", pa.string()),
        ("label_mode", pa.string()),
        ("label_source", pa.string()),
        ("member_count", pa.int32()),
        ("paper_count", pa.int32()),
        ("centroid_x", pa.float32()),
        ("centroid_y", pa.float32()),
        ("representative_node_id", pa.string()),
        ("representative_node_kind", pa.string()),
        ("candidate_count", pa.int32()),
        ("mean_cluster_probability", pa.float32()),
        ("mean_outlier_score", pa.float32()),
        ("is_noise", pa.bool_()),
        ("description", pa.string()),
    ]
)

LINKS_SCHEMA = pa.schema(
    [
        ("source_node_id", pa.string()),
        ("source_point_index", pa.int32()),
        ("target_node_id", pa.string()),
        ("target_point_index", pa.int32()),
        ("link_kind", pa.string()),
        ("weight", pa.float32()),
        ("is_directed", pa.bool_()),
        ("is_in_base", pa.bool_()),
        ("certainty", pa.string()),
        ("relation_id", pa.string()),
        ("paper_id", pa.string()),
        ("citation_id", pa.int64()),
        ("context_count", pa.int32()),
        ("is_influential", pa.bool_()),
        ("intents_json", pa.string()),
        ("contexts_json", pa.string()),
    ]
)

DOCUMENTS_SCHEMA = pa.schema(
    [
        ("paper_id", pa.string()),
        ("source_embedding_id", pa.string()),
        ("citekey", pa.string()),
        ("title", pa.string()),
        ("source_payload_policy", pa.string()),
        ("source_text_hash", pa.string()),
        ("context_label", pa.string()),
        ("display_preview", pa.string()),
        ("was_truncated", pa.bool_()),
        ("context_char_count", pa.int32()),
        ("body_char_count", pa.int32()),
        ("text_char_count", pa.int32()),
        ("context_token_count", pa.int32()),
        ("body_token_count", pa.int32()),
        ("journal", pa.string()),
        ("year", pa.int32()),
        ("doi", pa.string()),
        ("pmid", pa.string()),
        ("pmcid", pa.string()),
        ("abstract", pa.string()),
        ("author_count", pa.int32()),
        ("reference_count", pa.int32()),
        ("asset_count", pa.int32()),
        ("chunk_count", pa.int32()),
        ("entity_count", pa.int32()),
        ("relation_count", pa.int32()),
        ("page_count", pa.int32()),
        ("table_count", pa.int32()),
        ("figure_count", pa.int32()),
        ("text_availability", pa.string()),
        ("is_open_access", pa.bool_()),
        ("open_access_pdf_url", pa.string()),
        ("open_access_pdf_status", pa.string()),
        ("open_access_pdf_license", pa.string()),
        ("authors_json", pa.string()),
    ]
)

EXEMPLARS_SCHEMA = pa.schema(
    [
        ("cluster_id", pa.int32()),
        ("rank", pa.int32()),
        ("node_id", pa.string()),
        ("paper_id", pa.string()),
        ("exemplar_score", pa.float32()),
        ("is_representative", pa.bool_()),
        ("title", pa.string()),
        ("journal", pa.string()),
        ("year", pa.int32()),
        ("chunk_preview", pa.string()),
    ]
)


@dataclass(frozen=True, slots=True)
class BundleTableSpec:
    name: str
    parquet_file: str
    schema: pa.Schema
    sql: str


@dataclass(frozen=True, slots=True)
class BundleFileSummary:
    parquet_file: str
    bytes: int
    row_count: int
    sha256: str
    columns: list[str]
    schema: list[dict[str, str]]


@dataclass(frozen=True, slots=True)
class BundleSummary:
    graph_run_id: str
    bundle_dir: str
    bundle_checksum: str
    bundle_bytes: int
    bundle_manifest: dict
    tables: dict[str, dict]


def _hash_file(path: Path) -> str:
    digest = sha256()
    with path.open("rb") as handle:
        while chunk := handle.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def _publish_checksum_bundle_alias(bundle_dir: Path | str, bundle_checksum: str) -> Path:
    published_root = settings.graph_bundles_root_path / "by-checksum"
    published_root.mkdir(parents=True, exist_ok=True)
    published_path = published_root / bundle_checksum
    bundle_dir = Path(bundle_dir).resolve(strict=False)
    expected_target = Path("..") / bundle_dir.name

    if published_path.is_symlink():
        current_target = published_path.resolve(strict=False)
        if current_target == bundle_dir:
            return published_path
        published_path.unlink()
    elif published_path.exists():
        if published_path.is_dir():
            shutil.rmtree(published_path)
        else:
            published_path.unlink()

    published_path.symlink_to(expected_target, target_is_directory=True)
    return published_path


def _render_points_cte() -> str:
    renderable_predicate = renderable_point_predicate_sql("rp")
    return f"""
    WITH run_points AS (
        SELECT
            g.graph_run_id,
            g.corpus_id,
            g.point_index AS source_point_index,
            g.x,
            g.y,
            g.cluster_id,
            g.cluster_probability,
            g.outlier_score,
            g.is_noise,
            (bp.corpus_id IS NOT NULL) AS is_in_base,
            COALESCE(bp.base_rank, 0)::REAL AS base_rank,
            gc.label AS cluster_label,
            gc.centroid_x,
            gc.centroid_y
        FROM solemd.graph_points g
        LEFT JOIN solemd.graph_base_points bp
            ON bp.graph_run_id = g.graph_run_id
           AND bp.corpus_id = g.corpus_id
        LEFT JOIN solemd.graph_clusters gc
            ON gc.graph_run_id = g.graph_run_id
           AND gc.cluster_id = g.cluster_id
        WHERE g.graph_run_id = %(graph_run_id)s
    ),
    render_points AS (
        SELECT
            rp.graph_run_id,
            rp.corpus_id,
            rp.source_point_index,
            rp.x,
            rp.y,
            rp.cluster_id,
            rp.cluster_probability,
            rp.outlier_score,
            rp.is_noise,
            rp.is_in_base,
            rp.base_rank,
            rp.cluster_label,
            rp.centroid_x,
            rp.centroid_y
        FROM run_points rp
        WHERE {renderable_predicate}
    ),
    base_points AS (
        SELECT
            rp.graph_run_id,
            rp.corpus_id,
            ROW_NUMBER() OVER (
                ORDER BY rp.source_point_index
            )::INTEGER - 1 AS point_index,
            rp.source_point_index,
            rp.x,
            rp.y,
            rp.cluster_id,
            rp.cluster_probability,
            rp.outlier_score,
            rp.is_noise,
            rp.is_in_base,
            rp.base_rank,
            rp.cluster_label,
            rp.centroid_x,
            rp.centroid_y
        FROM render_points rp
        WHERE rp.is_in_base
    ),
    base_point_count AS (
        SELECT count(*)::INTEGER AS total FROM base_points
    ),
    universe_points AS (
        SELECT
            rp.graph_run_id,
            rp.corpus_id,
            (
                (SELECT total FROM base_point_count)
                + ROW_NUMBER() OVER (ORDER BY rp.source_point_index)
                - 1
            )::INTEGER AS point_index,
            rp.source_point_index,
            rp.x,
            rp.y,
            rp.cluster_id,
            rp.cluster_probability,
            rp.outlier_score,
            rp.is_noise,
            rp.is_in_base,
            rp.base_rank,
            rp.cluster_label,
            rp.centroid_x,
            rp.centroid_y
        FROM render_points rp
        WHERE NOT rp.is_in_base
    ),
    export_points AS (
        SELECT * FROM base_points
        UNION ALL
        SELECT * FROM universe_points
    ),
    render_cluster_rollup AS (
        SELECT
            COALESCE(cluster_id, 0) AS cluster_id,
            count(*)::INTEGER AS member_count,
            count(*)::INTEGER AS paper_count,
            avg(x)::REAL AS centroid_x,
            avg(y)::REAL AS centroid_y,
            avg(cluster_probability)::REAL AS mean_cluster_probability,
            avg(outlier_score)::REAL AS mean_outlier_score
        FROM export_points
        GROUP BY COALESCE(cluster_id, 0)
    ),
    render_cluster_representatives AS (
        SELECT
            ranked.cluster_id,
            ranked.representative_node_id,
            ranked.representative_node_kind
        FROM (
            SELECT
                COALESCE(rp.cluster_id, 0) AS cluster_id,
                'paper:' || rp.corpus_id::TEXT AS representative_node_id,
                'paper'::TEXT AS representative_node_kind,
                ROW_NUMBER() OVER (
                    PARTITION BY COALESCE(rp.cluster_id, 0)
                    ORDER BY
                        ((rp.x - rc.centroid_x) * (rp.x - rc.centroid_x))
                        + ((rp.y - rc.centroid_y) * (rp.y - rc.centroid_y)),
                        rp.cluster_probability DESC NULLS LAST,
                        rp.source_point_index
                )::INTEGER AS rank
            FROM export_points rp
            JOIN render_cluster_rollup rc
              ON rc.cluster_id = COALESCE(rp.cluster_id, 0)
        ) AS ranked
        WHERE ranked.rank = 1
    )
    """


def _point_documents_cte() -> str:
    return (
        _render_points_cte()
        + """
    ,
    author_rollup AS (
        SELECT
            pa.corpus_id,
            count(*)::INTEGER AS author_count,
            COALESCE(
                jsonb_agg(
                    jsonb_build_object(
                        'name', pa.name,
                        'orcid', COALESCE(pa.external_ids->>'ORCID', pa.external_ids->>'orcid'),
                        'affiliation', pa.affiliations[1]
                    )
                    ORDER BY pa.author_position
                )::TEXT,
                '[]'
            ) AS authors_json
        FROM solemd.paper_authors pa
        JOIN export_points rp ON rp.corpus_id = pa.corpus_id
        GROUP BY pa.corpus_id
    ),
    asset_rollup AS (
        SELECT
            a.corpus_id,
            count(*)::INTEGER AS asset_count,
            max(a.remote_url) FILTER (
                WHERE a.asset_kind = 'open_access_pdf'
            ) AS open_access_pdf_url,
            max(a.access_status) FILTER (
                WHERE a.asset_kind = 'open_access_pdf'
            ) AS open_access_pdf_status,
            max(a.license) FILTER (
                WHERE a.asset_kind = 'open_access_pdf'
            ) AS open_access_pdf_license
        FROM solemd.paper_assets a
        JOIN export_points rp ON rp.corpus_id = a.corpus_id
        GROUP BY a.corpus_id
    ),
    entity_rollup AS (
        SELECT
            ranked.corpus_id,
            sum(ranked.hit_count)::INTEGER AS entity_count,
            string_agg(
                DISTINCT ranked.entity_type,
                ', ' ORDER BY ranked.entity_type
            ) AS semantic_groups_csv,
            string_agg(
                ranked.entity_label,
                ' | ' ORDER BY ranked.hit_count DESC, ranked.entity_label
            )
                FILTER (WHERE ranked.rank <= 5) AS top_entities_csv
        FROM (
            SELECT
                c.corpus_id,
                ea.entity_type,
                COALESCE(
                    NULLIF(split_part(ea.mentions, '|', 1), ''),
                    ea.concept_id
                ) AS entity_label,
                count(*)::INTEGER AS hit_count,
                row_number() OVER (
                    PARTITION BY c.corpus_id
                    ORDER BY
                        count(*) DESC,
                        COALESCE(
                            NULLIF(split_part(ea.mentions, '|', 1), ''),
                            ea.concept_id
                        )
                ) AS rank
            FROM solemd.corpus c
            JOIN export_points rp ON rp.corpus_id = c.corpus_id
            JOIN pubtator.entity_annotations ea ON ea.pmid = c.pmid
            GROUP BY
                c.corpus_id,
                ea.entity_type,
                COALESCE(
                    NULLIF(split_part(ea.mentions, '|', 1), ''),
                    ea.concept_id
                )
        ) AS ranked
        GROUP BY ranked.corpus_id
    ),
    relation_rollup AS (
        SELECT
            ranked.corpus_id,
            sum(ranked.hit_count)::INTEGER AS relation_count,
            string_agg(
                ranked.relation_type,
                ', ' ORDER BY ranked.hit_count DESC, ranked.relation_type
            )
                FILTER (WHERE ranked.rank <= 5) AS relation_categories_csv
        FROM (
            SELECT
                c.corpus_id,
                r.relation_type,
                count(*)::INTEGER AS hit_count,
                row_number() OVER (
                    PARTITION BY c.corpus_id
                    ORDER BY count(*) DESC, r.relation_type
                ) AS rank
            FROM solemd.corpus c
            JOIN export_points rp ON rp.corpus_id = c.corpus_id
            JOIN pubtator.relations r ON r.pmid = c.pmid
            GROUP BY c.corpus_id, r.relation_type
        ) AS ranked
        GROUP BY ranked.corpus_id
    ),
    paper_base AS (
        SELECT
            rp.graph_run_id,
            rp.corpus_id,
            rp.point_index,
            rp.x,
            rp.y,
            rp.cluster_id,
            rp.cluster_label,
            rp.cluster_probability,
            rp.is_noise,
            rp.is_in_base,
            rp.base_rank,
            rp.centroid_x,
            rp.centroid_y,
            p.paper_id,
            p.title,
            p.tldr,
            p.abstract,
            p.journal_name,
            p.year,
            c.doi,
            c.pmid::TEXT AS pmid,
            c.pmc_id AS pmcid,
            p.reference_count,
            p.citation_count,
            p.is_open_access,
            p.text_availability,
            p.publication_venue_id,
            p.s2_url,
            COALESCE(author_rollup.author_count, 0) AS author_count,
            COALESCE(author_rollup.authors_json, '[]') AS authors_json,
            COALESCE(asset_rollup.asset_count, 0) AS asset_count,
            asset_rollup.open_access_pdf_url,
            asset_rollup.open_access_pdf_status,
            asset_rollup.open_access_pdf_license,
            COALESCE(entity_rollup.entity_count, 0) AS entity_count,
            entity_rollup.semantic_groups_csv,
            entity_rollup.top_entities_csv,
            COALESCE(relation_rollup.relation_count, 0) AS relation_count,
            relation_rollup.relation_categories_csv
        FROM export_points rp
        JOIN solemd.papers p ON p.corpus_id = rp.corpus_id
        JOIN solemd.corpus c ON c.corpus_id = rp.corpus_id
        LEFT JOIN author_rollup ON author_rollup.corpus_id = rp.corpus_id
        LEFT JOIN asset_rollup ON asset_rollup.corpus_id = rp.corpus_id
        LEFT JOIN entity_rollup ON entity_rollup.corpus_id = rp.corpus_id
        LEFT JOIN relation_rollup ON relation_rollup.corpus_id = rp.corpus_id
    )
    """
    )




def _write_query_to_parquet(
    conn,
    *,
    sql: str,
    params: dict,
    schema: pa.Schema,
    output_path: Path,
    batch_size: int = PARQUET_ROW_GROUP_SIZE,
) -> BundleFileSummary:
    writer: pq.ParquetWriter | None = None
    row_count = 0
    cursor_name = f"bundle_{uuid.uuid4().hex}"

    with conn.cursor(name=cursor_name) as cur:
        cur.execute(sql, params)
        while True:
            rows = cur.fetchmany(batch_size)
            if not rows:
                break
            table = pa.Table.from_pylist(rows, schema=schema)
            if writer is None:
                writer = pq.ParquetWriter(output_path, table.schema, compression="zstd")
            writer.write_table(table, row_group_size=PARQUET_ROW_GROUP_SIZE)
            row_count += table.num_rows

    if writer is None:
        writer = pq.ParquetWriter(output_path, schema, compression="zstd")
    writer.close()

    summary = BundleFileSummary(
        parquet_file=output_path.name,
        bytes=output_path.stat().st_size,
        row_count=row_count,
        sha256=_hash_file(output_path),
        columns=schema.names,
        schema=[{"name": field.name, "type": str(field.type)} for field in schema],
    )
    return summary


def _write_query_to_parquet_copy(
    conn,
    *,
    sql: str,
    params: dict,
    schema: pa.Schema,
    output_path: Path,
) -> BundleFileSummary:
    """Fast export via COPY TO STDOUT → CSV temp file → pyarrow → Parquet.

    Bypasses Python dict creation by streaming raw CSV bytes from PostgreSQL
    directly to a temp file, then letting pyarrow's C++ CSV reader parse it.
    """
    import pyarrow.csv as pa_csv

    copy_sql = f"COPY ({sql}) TO STDOUT (FORMAT csv, HEADER true)"
    csv_path = output_path.with_suffix(".csv.tmp")

    try:
        with open(csv_path, "wb") as f:
            with conn.cursor() as cur:
                with cur.copy(copy_sql, params) as copy:
                    for data in copy:
                        f.write(data)

        convert_options = pa_csv.ConvertOptions(column_types=schema)
        table = pa_csv.read_csv(str(csv_path), convert_options=convert_options)

        writer = pq.ParquetWriter(output_path, schema, compression="zstd")
        for offset in range(0, table.num_rows, PARQUET_ROW_GROUP_SIZE):
            writer.write_table(
                table.slice(offset, PARQUET_ROW_GROUP_SIZE),
                row_group_size=PARQUET_ROW_GROUP_SIZE,
            )
        writer.close()
        row_count = table.num_rows
    finally:
        csv_path.unlink(missing_ok=True)

    if row_count == 0:
        writer = pq.ParquetWriter(output_path, schema, compression="zstd")
        writer.close()

    return BundleFileSummary(
        parquet_file=output_path.name,
        bytes=output_path.stat().st_size,
        row_count=row_count,
        sha256=_hash_file(output_path),
        columns=schema.names,
        schema=[{"name": field.name, "type": str(field.type)} for field in schema],
    )


EXPORT_WORKERS = 4


_TMP_TABLES = [
    "solemd._tmp_export_points",
    "solemd._tmp_author_rollup",
    "solemd._tmp_asset_rollup",
    "solemd._tmp_entity_rollup",
    "solemd._tmp_relation_rollup",
    "solemd._tmp_export_paper_base",
]


def _materialize_rollup(name: str, sql: str) -> None:
    """Materialize one rollup as an UNLOGGED table (own connection + parallel workers)."""
    with db.connect() as conn, conn.cursor() as cur:
        apply_build_session_settings(cur)
        cur.execute(sql)
        conn.commit()
    log.info("materialized %s", name)


@observe(name=SPAN_EXPORT_VIEWS)
def _materialize_export_views(graph_run_id: str) -> None:
    """Pre-materialize paper_base via parallel rollup aggregations.

    Step 1: Materialize export_points (the filtered, reindexed point set)
    Step 2: In parallel, materialize 4 independent rollups (author, asset,
            entity, relation) — each on its own connection with parallel workers
    Step 3: JOIN all rollups into the final paper_base table
    """
    _cleanup_export_views()

    # Step 1: Materialize export_points
    render_cte = _render_points_cte()
    with db.connect() as conn, conn.cursor() as cur:
        apply_build_session_settings(cur)
        cur.execute(
            f"""
            CREATE UNLOGGED TABLE solemd._tmp_export_points AS
            {render_cte}
            SELECT * FROM export_points
            """,
            {"graph_run_id": graph_run_id},
        )
        cur.execute("CREATE UNIQUE INDEX ON solemd._tmp_export_points (corpus_id)")
        cur.execute("CREATE INDEX ON solemd._tmp_export_points (point_index)")
        cur.execute("ANALYZE solemd._tmp_export_points")
        conn.commit()
    log.info("materialized export_points")

    # Step 2: Parallel rollup aggregations
    rollups = {
        "author_rollup": """
            CREATE UNLOGGED TABLE solemd._tmp_author_rollup AS
            SELECT
                pa.corpus_id,
                count(*)::INTEGER AS author_count,
                COALESCE(
                    jsonb_agg(
                        jsonb_build_object(
                            'name', pa.name,
                            'orcid', COALESCE(pa.external_ids->>'ORCID', pa.external_ids->>'orcid'),
                            'affiliation', pa.affiliations[1]
                        )
                        ORDER BY pa.author_position
                    )::TEXT,
                    '[]'
                ) AS authors_json
            FROM solemd.paper_authors pa
            JOIN solemd._tmp_export_points rp ON rp.corpus_id = pa.corpus_id
            GROUP BY pa.corpus_id
        """,
        "asset_rollup": """
            CREATE UNLOGGED TABLE solemd._tmp_asset_rollup AS
            SELECT
                a.corpus_id,
                count(*)::INTEGER AS asset_count,
                max(a.remote_url) FILTER (
                    WHERE a.asset_kind = 'open_access_pdf'
                ) AS open_access_pdf_url,
                max(a.access_status) FILTER (
                    WHERE a.asset_kind = 'open_access_pdf'
                ) AS open_access_pdf_status,
                max(a.license) FILTER (
                    WHERE a.asset_kind = 'open_access_pdf'
                ) AS open_access_pdf_license
            FROM solemd.paper_assets a
            JOIN solemd._tmp_export_points rp ON rp.corpus_id = a.corpus_id
            GROUP BY a.corpus_id
        """,
        "entity_rollup": """
            CREATE UNLOGGED TABLE solemd._tmp_entity_rollup AS
            SELECT
                ranked.corpus_id,
                sum(ranked.hit_count)::INTEGER AS entity_count,
                string_agg(
                    DISTINCT ranked.entity_type,
                    ', ' ORDER BY ranked.entity_type
                ) AS semantic_groups_csv,
                string_agg(
                    ranked.entity_label,
                    ' | ' ORDER BY ranked.hit_count DESC, ranked.entity_label
                )
                    FILTER (WHERE ranked.rank <= 5) AS top_entities_csv
            FROM (
                SELECT
                    c.corpus_id,
                    ea.entity_type,
                    COALESCE(
                        NULLIF(split_part(ea.mentions, '|', 1), ''),
                        ea.concept_id
                    ) AS entity_label,
                    count(*)::INTEGER AS hit_count,
                    row_number() OVER (
                        PARTITION BY c.corpus_id
                        ORDER BY
                            count(*) DESC,
                            COALESCE(
                                NULLIF(split_part(ea.mentions, '|', 1), ''),
                                ea.concept_id
                            )
                    ) AS rank
                FROM solemd.corpus c
                JOIN solemd._tmp_export_points rp ON rp.corpus_id = c.corpus_id
                JOIN pubtator.entity_annotations ea ON ea.pmid = c.pmid
                GROUP BY
                    c.corpus_id,
                    ea.entity_type,
                    COALESCE(
                        NULLIF(split_part(ea.mentions, '|', 1), ''),
                        ea.concept_id
                    )
            ) AS ranked
            GROUP BY ranked.corpus_id
        """,
        "relation_rollup": """
            CREATE UNLOGGED TABLE solemd._tmp_relation_rollup AS
            SELECT
                ranked.corpus_id,
                sum(ranked.hit_count)::INTEGER AS relation_count,
                string_agg(
                    ranked.relation_type,
                    ', ' ORDER BY ranked.hit_count DESC, ranked.relation_type
                )
                    FILTER (WHERE ranked.rank <= 5) AS relation_categories_csv
            FROM (
                SELECT
                    c.corpus_id,
                    r.relation_type,
                    count(*)::INTEGER AS hit_count,
                    row_number() OVER (
                        PARTITION BY c.corpus_id
                        ORDER BY count(*) DESC, r.relation_type
                    ) AS rank
                FROM solemd.corpus c
                JOIN solemd._tmp_export_points rp ON rp.corpus_id = c.corpus_id
                JOIN pubtator.relations r ON r.pmid = c.pmid
                GROUP BY c.corpus_id, r.relation_type
            ) AS ranked
            GROUP BY ranked.corpus_id
        """,
    }

    with ThreadPoolExecutor(max_workers=4) as pool:
        futures = {
            pool.submit(_materialize_rollup, name, sql): name
            for name, sql in rollups.items()
        }
        for future in as_completed(futures):
            future.result()  # propagate exceptions

    # Index the rollup tables in parallel for the final JOIN
    def _create_index(ddl: str) -> None:
        with db.connect() as conn, conn.cursor() as cur:
            cur.execute(ddl)
            conn.commit()

    with ThreadPoolExecutor(max_workers=4) as pool:
        list(pool.map(_create_index, [
            "CREATE UNIQUE INDEX ON solemd._tmp_author_rollup (corpus_id)",
            "CREATE UNIQUE INDEX ON solemd._tmp_asset_rollup (corpus_id)",
            "CREATE UNIQUE INDEX ON solemd._tmp_entity_rollup (corpus_id)",
            "CREATE UNIQUE INDEX ON solemd._tmp_relation_rollup (corpus_id)",
        ]))

    # Step 3: Final JOIN into paper_base
    with db.connect() as conn, conn.cursor() as cur:
        apply_build_session_settings(cur)
        cur.execute("""
            CREATE UNLOGGED TABLE solemd._tmp_export_paper_base AS
            SELECT
                rp.graph_run_id,
                rp.corpus_id,
                rp.point_index,
                rp.x,
                rp.y,
                rp.cluster_id,
                rp.cluster_label,
                rp.cluster_probability,
                rp.is_noise,
                rp.is_in_base,
                rp.base_rank,
                rp.centroid_x,
                rp.centroid_y,
                p.paper_id,
                p.title,
                p.tldr,
                p.abstract,
                p.journal_name,
                p.year,
                c.doi,
                c.pmid::TEXT AS pmid,
                c.pmc_id AS pmcid,
                p.reference_count,
                p.citation_count,
                p.is_open_access,
                p.text_availability,
                p.publication_venue_id,
                p.s2_url,
                COALESCE(ar.author_count, 0) AS author_count,
                COALESCE(ar.authors_json, '[]') AS authors_json,
                COALESCE(asr.asset_count, 0) AS asset_count,
                asr.open_access_pdf_url,
                asr.open_access_pdf_status,
                asr.open_access_pdf_license,
                COALESCE(er.entity_count, 0) AS entity_count,
                er.semantic_groups_csv,
                er.top_entities_csv,
                COALESCE(rr.relation_count, 0) AS relation_count,
                rr.relation_categories_csv
            FROM solemd._tmp_export_points rp
            JOIN solemd.papers p ON p.corpus_id = rp.corpus_id
            JOIN solemd.corpus c ON c.corpus_id = rp.corpus_id
            LEFT JOIN solemd._tmp_author_rollup ar ON ar.corpus_id = rp.corpus_id
            LEFT JOIN solemd._tmp_asset_rollup asr ON asr.corpus_id = rp.corpus_id
            LEFT JOIN solemd._tmp_entity_rollup er ON er.corpus_id = rp.corpus_id
            LEFT JOIN solemd._tmp_relation_rollup rr ON rr.corpus_id = rp.corpus_id
        """)
        cur.execute("CREATE INDEX ON solemd._tmp_export_paper_base (corpus_id)")
        cur.execute("CREATE INDEX ON solemd._tmp_export_paper_base (point_index)")
        cur.execute("CREATE INDEX ON solemd._tmp_export_paper_base (cluster_id)")
        cur.execute("CREATE INDEX ON solemd._tmp_export_paper_base (is_in_base)")
        cur.execute("ANALYZE solemd._tmp_export_paper_base")
        conn.commit()
    log.info("materialized paper_base")


def _cleanup_export_views() -> None:
    try:
        with db.connect_autocommit() as conn, conn.cursor() as cur:
            for table in _TMP_TABLES:
                cur.execute(f"DROP TABLE IF EXISTS {table}")
    except Exception:
        log.warning("failed to drop export temp tables", exc_info=True)
def _materialized_table_specs(bundle_profile: str) -> list[BundleTableSpec]:
    """Return table specs rewritten to use the materialized paper_base table."""
    render_cte = _render_points_cte()
    mat = "solemd._tmp_export_paper_base"

    all_specs = [
        BundleTableSpec(
            name="base_points",
            parquet_file="base_points.parquet",
            schema=POINTS_SCHEMA,
            sql=build_point_projection_select_sql(
                mat,
                where="is_in_base",
                order_by="cluster_id DESC, point_index",
            ),
        ),
        BundleTableSpec(
            name="universe_points",
            parquet_file="universe_points.parquet",
            schema=POINTS_SCHEMA,
            sql=build_point_projection_select_sql(
                mat,
                where="NOT is_in_base",
                order_by="COALESCE(cluster_id, 0), COALESCE(year, 0), "
                "COALESCE(reference_count, 0) DESC, point_index",
            ),
        ),
        BundleTableSpec(
            name="base_clusters",
            parquet_file="base_clusters.parquet",
            schema=CLUSTERS_SCHEMA,
            sql=render_cte
            + """
            SELECT
                gc.cluster_id,
                gc.label,
                gc.label_mode,
                gc.label_source,
                r.member_count,
                r.paper_count,
                r.centroid_x,
                r.centroid_y,
                rep.representative_node_id,
                rep.representative_node_kind,
                gc.candidate_count,
                COALESCE(
                    r.mean_cluster_probability,
                    gc.mean_cluster_probability
                ) AS mean_cluster_probability,
                COALESCE(
                    r.mean_outlier_score,
                    gc.mean_outlier_score
                ) AS mean_outlier_score,
                (gc.cluster_id = 0) AS is_noise,
                gc.description
            FROM solemd.graph_clusters gc
            JOIN render_cluster_rollup r
              ON r.cluster_id = gc.cluster_id
            LEFT JOIN render_cluster_representatives rep
              ON rep.cluster_id = gc.cluster_id
            WHERE gc.graph_run_id = %(graph_run_id)s
            ORDER BY gc.cluster_id
            """,
        ),
        BundleTableSpec(
            name="paper_documents",
            parquet_file="paper_documents.parquet",
            schema=DOCUMENTS_SCHEMA,
            sql=f"""
            SELECT
                COALESCE(paper_id, 'corpus:' || corpus_id::TEXT) AS paper_id,
                COALESCE(paper_id, 'corpus:' || corpus_id::TEXT) AS source_embedding_id,
                NULL::TEXT AS citekey,
                title,
                'semantic_scholar_bulk' AS source_payload_policy,
                md5(CONCAT_WS(' ', title, tldr, abstract)) AS source_text_hash,
                NULL::TEXT AS context_label,
                COALESCE(tldr, LEFT(abstract, 1200), title) AS display_preview,
                false AS was_truncated,
                NULL::INTEGER AS context_char_count,
                NULL::INTEGER AS body_char_count,
                NULL::INTEGER AS text_char_count,
                NULL::INTEGER AS context_token_count,
                NULL::INTEGER AS body_token_count,
                journal_name AS journal,
                year,
                doi,
                pmid,
                pmcid,
                abstract,
                author_count,
                COALESCE(reference_count, 0) AS reference_count,
                asset_count,
                0::INTEGER AS chunk_count,
                entity_count,
                relation_count,
                NULL::INTEGER AS page_count,
                NULL::INTEGER AS table_count,
                NULL::INTEGER AS figure_count,
                text_availability,
                is_open_access,
                open_access_pdf_url,
                open_access_pdf_status,
                open_access_pdf_license,
                authors_json
            FROM {mat}
            ORDER BY point_index
            """,
        ),
        BundleTableSpec(
            name="cluster_exemplars",
            parquet_file="cluster_exemplars.parquet",
            schema=EXEMPLARS_SCHEMA,
            sql=f"""
            WITH ranked AS (
                SELECT
                    cluster_id,
                    ROW_NUMBER() OVER (
                        PARTITION BY cluster_id
                        ORDER BY
                            (
                                (x - centroid_x) * (x - centroid_x)
                            ) + (
                                (y - centroid_y) * (y - centroid_y)
                            ),
                            COALESCE(citation_count, 0) DESC,
                            corpus_id
                    ) AS rank,
                    'paper:' || corpus_id::TEXT AS node_id,
                    COALESCE(paper_id, 'corpus:' || corpus_id::TEXT) AS paper_id,
                    sqrt(
                        (
                            (x - centroid_x) * (x - centroid_x)
                        ) + (
                            (y - centroid_y) * (y - centroid_y)
                        )
                    )::REAL AS exemplar_score,
                    title,
                    journal_name AS journal,
                    year,
                    COALESCE(tldr, LEFT(abstract, 500), title) AS chunk_preview
                FROM {mat}
                WHERE cluster_id IS NOT NULL
                  AND cluster_id > 0
            )
            SELECT
                cluster_id,
                rank,
                node_id,
                paper_id,
                exemplar_score,
                (rank = 1) AS is_representative,
                title,
                journal,
                year,
                chunk_preview
            FROM ranked
            WHERE rank <= 3
            ORDER BY cluster_id, rank
            """,
        ),
        BundleTableSpec(
            name="universe_links",
            parquet_file="universe_links.parquet",
            schema=LINKS_SCHEMA,
            sql=render_cte
            + """
            SELECT
                'paper:' || src.corpus_id::TEXT AS source_node_id,
                src.point_index AS source_point_index,
                'paper:' || dst.corpus_id::TEXT AS target_node_id,
                dst.point_index AS target_point_index,
                'citation' AS link_kind,
                CASE
                    WHEN c.is_influential IS TRUE THEN 2.0
                    WHEN c.context_count > 0 THEN 1.5
                    ELSE 1.0
                END::REAL AS weight,
                true AS is_directed,
                (src.is_in_base AND dst.is_in_base) AS is_in_base,
                CASE
                    WHEN c.is_influential IS TRUE THEN 'high'
                    WHEN c.context_count > 0 THEN 'contextual'
                    ELSE 'standard'
                END AS certainty,
                c.citation_id::TEXT AS relation_id,
                NULL::TEXT AS paper_id,
                c.citation_id,
                c.context_count,
                c.is_influential,
                c.intents::TEXT AS intents_json,
                c.contexts::TEXT AS contexts_json
            FROM solemd.citations c
            JOIN render_points src
              ON src.corpus_id = c.citing_corpus_id
            JOIN render_points dst
              ON dst.corpus_id = c.cited_corpus_id
            WHERE c.source = 'semantic_scholar_citations_bulk'
            """,
        ),
    ]

    if bundle_profile == "base":
        allowed = {"base_points", "base_clusters", "universe_points"}
        return [spec for spec in all_specs if spec.name in allowed]
    if bundle_profile == "full":
        return all_specs
    raise ValueError(f"Unsupported bundle profile: {bundle_profile}")


def _export_single_table(
    spec: BundleTableSpec,
    params: dict,
    bundle_dir: Path,
) -> tuple[str, BundleFileSummary]:
    output_path = bundle_dir / spec.parquet_file
    with db.connect() as conn:
        try:
            summary = _write_query_to_parquet_copy(
                conn,
                sql=spec.sql,
                params=params,
                schema=spec.schema,
                output_path=output_path,
            )
        except Exception:
            log.warning(
                "COPY export failed for %s, falling back to cursor",
                spec.name,
                exc_info=True,
            )
            summary = _write_query_to_parquet(
                conn,
                sql=spec.sql,
                params=params,
                schema=spec.schema,
                output_path=output_path,
            )
    return spec.name, summary


@observe(name=SPAN_EXPORT_BUNDLE)
def export_graph_bundle(
    *,
    graph_run_id: str,
    graph_name: str = "cosmograph",
    node_kind: str = "corpus",
    output_dir: Path | None = None,
    bundle_profile: str = "base",
) -> BundleSummary:
    graph_run_id_text = str(graph_run_id)
    bundle_dir = output_dir or (settings.graph_bundles_root_path / graph_run_id)
    bundle_dir.mkdir(parents=True, exist_ok=True)

    specs = _materialized_table_specs(bundle_profile)

    # Pre-materialize the shared paper_base CTE as an UNLOGGED table
    _materialize_export_views(graph_run_id)
    try:
        table_summaries: dict[str, dict] = {}
        total_bytes = 0
        params = {"graph_run_id": graph_run_id}

        with ThreadPoolExecutor(max_workers=EXPORT_WORKERS) as pool:
            futures = {
                pool.submit(_export_single_table, spec, params, bundle_dir): spec
                for spec in specs
            }
            for future in as_completed(futures):
                name, summary = future.result()
                table_summaries[name] = asdict(summary)
                total_bytes += summary.bytes
    finally:
        _cleanup_export_views()

    manifest_payload = {
        "bundle_format": "parquet-manifest",
        "bundle_version": BUNDLE_VERSION,
        "created_at": None,
        "graph_name": graph_name,
        "graph_run_id": graph_run_id_text,
        "node_kind": node_kind,
        "bundle_profile": bundle_profile,
        "contract": bundle_contract(),
        "duckdb_file": None,
        "tables": table_summaries,
    }
    manifest_path = bundle_dir / "manifest.json"
    manifest_path.write_text(json.dumps(manifest_payload, indent=2), encoding="utf-8")
    bundle_checksum = _hash_file(manifest_path)
    total_bytes += manifest_path.stat().st_size
    validate_bundle_manifest_contract(manifest_payload, bundle_profile=bundle_profile)
    published_bundle_dir = _publish_checksum_bundle_alias(bundle_dir, bundle_checksum)

    try:
        client = _get_langfuse()
        if client is not None:
            per_table = {
                name: {"row_count": info.get("row_count", 0), "bytes": info.get("bytes", 0)}
                for name, info in table_summaries.items()
            }
            client.update_current_span(
                output={
                    "table_count": len(table_summaries),
                    "total_bytes": total_bytes,
                    "bundle_checksum": bundle_checksum,
                    "bundle_profile": bundle_profile,
                    "per_table": per_table,
                },
            )
    except Exception:
        pass

    return BundleSummary(
        graph_run_id=graph_run_id_text,
        bundle_dir=str(published_bundle_dir),
        bundle_checksum=bundle_checksum,
        bundle_bytes=total_bytes,
        bundle_manifest=manifest_payload,
        tables=table_summaries,
    )
