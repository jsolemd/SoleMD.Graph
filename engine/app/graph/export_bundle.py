"""Export mapped graph runs into Parquet bundles for the frontend."""

from __future__ import annotations

from dataclasses import asdict
from dataclasses import dataclass
from hashlib import sha256
import json
from pathlib import Path
import uuid

import pyarrow as pa
import pyarrow.parquet as pq

from app import db
from app.config import settings


POINTS_SCHEMA = pa.schema(
    [
        ("point_index", pa.int32()),
        ("id", pa.string()),
        ("paper_id", pa.string()),
        ("node_kind", pa.string()),
        ("node_role", pa.string()),
        ("hex_color", pa.string()),
        ("hex_color_light", pa.string()),
        ("x", pa.float32()),
        ("y", pa.float32()),
        ("cluster_id", pa.int32()),
        ("cluster_label", pa.string()),
        ("cluster_probability", pa.float32()),
        ("outlier_score", pa.float32()),
        ("title", pa.string()),
        ("citekey", pa.string()),
        ("journal", pa.string()),
        ("year", pa.int32()),
        ("doi", pa.string()),
        ("pmid", pa.string()),
        ("pmcid", pa.string()),
        ("stable_chunk_id", pa.string()),
        ("chunk_index", pa.int32()),
        ("section_canonical", pa.string()),
        ("page_number", pa.int32()),
        ("token_count", pa.int32()),
        ("char_count", pa.int32()),
        ("chunk_kind", pa.string()),
        ("chunk_preview", pa.string()),
        ("display_label", pa.string()),
        ("search_text", pa.string()),
        ("canonical_name", pa.string()),
        ("category", pa.string()),
        ("definition", pa.string()),
        ("semantic_types_csv", pa.string()),
        ("semantic_groups_csv", pa.string()),
        ("organ_systems_csv", pa.string()),
        ("aliases_csv", pa.string()),
        ("mention_count", pa.float32()),
        ("paper_count", pa.float32()),
        ("chunk_count", pa.float32()),
        ("relation_count", pa.float32()),
        ("alias_count", pa.float32()),
        ("relation_type", pa.string()),
        ("relation_category", pa.string()),
        ("relation_direction", pa.string()),
        ("relation_certainty", pa.string()),
        ("assertion_status", pa.string()),
        ("evidence_status", pa.string()),
        ("alias_text", pa.string()),
        ("alias_type", pa.string()),
        ("alias_quality_score", pa.float32()),
        ("alias_source", pa.string()),
        ("is_default_visible", pa.bool_()),
        ("payload_json", pa.string()),
        ("paper_author_count", pa.int32()),
        ("paper_reference_count", pa.int32()),
        ("paper_asset_count", pa.int32()),
        ("paper_chunk_count", pa.int32()),
        ("paper_entity_count", pa.int32()),
        ("paper_relation_count", pa.int32()),
        ("paper_sentence_count", pa.int32()),
        ("paper_page_count", pa.int32()),
        ("paper_table_count", pa.int32()),
        ("paper_figure_count", pa.int32()),
        ("paper_cluster_index", pa.int32()),
        ("has_table_context", pa.bool_()),
        ("has_figure_context", pa.bool_()),
    ]
)

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
        ("is_default_visible", pa.bool_()),
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


def _point_documents_cte() -> str:
    return """
    WITH run_points AS (
        SELECT
            g.graph_run_id,
            g.corpus_id,
            g.point_index,
            g.x,
            g.y,
            g.cluster_id,
            g.cluster_probability,
            g.outlier_score,
            g.is_noise,
            gc.label AS cluster_label,
            gc.centroid_x,
            gc.centroid_y
        FROM solemd.graph g
        LEFT JOIN solemd.graph_clusters gc
            ON gc.graph_run_id = g.graph_run_id
           AND gc.cluster_id = g.cluster_id
        WHERE g.graph_run_id = %(graph_run_id)s
    ),
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
        JOIN run_points rp ON rp.corpus_id = pa.corpus_id
        GROUP BY pa.corpus_id
    ),
    asset_rollup AS (
        SELECT
            a.corpus_id,
            count(*)::INTEGER AS asset_count,
            max(a.remote_url) FILTER (WHERE a.asset_kind = 'open_access_pdf') AS open_access_pdf_url,
            max(a.access_status) FILTER (WHERE a.asset_kind = 'open_access_pdf') AS open_access_pdf_status,
            max(a.license) FILTER (WHERE a.asset_kind = 'open_access_pdf') AS open_access_pdf_license
        FROM solemd.paper_assets a
        JOIN run_points rp ON rp.corpus_id = a.corpus_id
        GROUP BY a.corpus_id
    ),
    entity_rollup AS (
        SELECT
            c.corpus_id,
            count(*)::INTEGER AS entity_count
        FROM solemd.corpus c
        JOIN run_points rp ON rp.corpus_id = c.corpus_id
        JOIN pubtator.entity_annotations ea ON ea.pmid = c.pmid
        GROUP BY c.corpus_id
    ),
    relation_rollup AS (
        SELECT
            c.corpus_id,
            count(*)::INTEGER AS relation_count
        FROM solemd.corpus c
        JOIN run_points rp ON rp.corpus_id = c.corpus_id
        JOIN pubtator.relations r ON r.pmid = c.pmid
        GROUP BY c.corpus_id
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
            rp.outlier_score,
            rp.is_noise,
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
            COALESCE(relation_rollup.relation_count, 0) AS relation_count
        FROM run_points rp
        JOIN solemd.papers p ON p.corpus_id = rp.corpus_id
        JOIN solemd.corpus c ON c.corpus_id = rp.corpus_id
        LEFT JOIN author_rollup ON author_rollup.corpus_id = rp.corpus_id
        LEFT JOIN asset_rollup ON asset_rollup.corpus_id = rp.corpus_id
        LEFT JOIN entity_rollup ON entity_rollup.corpus_id = rp.corpus_id
        LEFT JOIN relation_rollup ON relation_rollup.corpus_id = rp.corpus_id
    )
    """


def _table_specs() -> list[BundleTableSpec]:
    shared_cte = _point_documents_cte()
    return [
        BundleTableSpec(
            name="corpus_points",
            parquet_file="corpus_points.parquet",
            schema=POINTS_SCHEMA,
            sql=
            shared_cte
            + """
            SELECT
                point_index,
                'paper:' || corpus_id::TEXT AS id,
                COALESCE(paper_id, 'corpus:' || corpus_id::TEXT) AS paper_id,
                'paper' AS node_kind,
                'primary' AS node_role,
                NULL::TEXT AS hex_color,
                NULL::TEXT AS hex_color_light,
                x,
                y,
                cluster_id,
                cluster_label,
                cluster_probability,
                outlier_score,
                title,
                NULL::TEXT AS citekey,
                journal_name AS journal,
                year,
                doi,
                pmid,
                pmcid,
                NULL::TEXT AS stable_chunk_id,
                NULL::INTEGER AS chunk_index,
                NULL::TEXT AS section_canonical,
                NULL::INTEGER AS page_number,
                NULL::INTEGER AS token_count,
                NULL::INTEGER AS char_count,
                NULL::TEXT AS chunk_kind,
                COALESCE(tldr, LEFT(abstract, 500), title) AS chunk_preview,
                COALESCE(tldr, title) AS display_label,
                CONCAT_WS(' ', title, tldr, abstract) AS search_text,
                NULL::TEXT AS canonical_name,
                NULL::TEXT AS category,
                NULL::TEXT AS definition,
                NULL::TEXT AS semantic_types_csv,
                NULL::TEXT AS semantic_groups_csv,
                NULL::TEXT AS organ_systems_csv,
                NULL::TEXT AS aliases_csv,
                NULL::REAL AS mention_count,
                1.0::REAL AS paper_count,
                NULL::REAL AS chunk_count,
                relation_count::REAL AS relation_count,
                NULL::REAL AS alias_count,
                NULL::TEXT AS relation_type,
                NULL::TEXT AS relation_category,
                NULL::TEXT AS relation_direction,
                NULL::TEXT AS relation_certainty,
                NULL::TEXT AS assertion_status,
                NULL::TEXT AS evidence_status,
                NULL::TEXT AS alias_text,
                NULL::TEXT AS alias_type,
                NULL::REAL AS alias_quality_score,
                NULL::TEXT AS alias_source,
                true AS is_default_visible,
                jsonb_build_object(
                    'display_preview', COALESCE(tldr, LEFT(abstract, 500), title),
                    'was_truncated', false,
                    'text_availability', text_availability,
                    'is_open_access', is_open_access,
                    'publication_venue_id', publication_venue_id,
                    's2_url', s2_url,
                    'open_access_pdf_url', open_access_pdf_url,
                    'open_access_pdf_status', open_access_pdf_status,
                    'open_access_pdf_license', open_access_pdf_license,
                    'authors_json', authors_json
                )::TEXT AS payload_json,
                author_count AS paper_author_count,
                COALESCE(reference_count, 0) AS paper_reference_count,
                asset_count AS paper_asset_count,
                0::INTEGER AS paper_chunk_count,
                entity_count AS paper_entity_count,
                relation_count AS paper_relation_count,
                NULL::INTEGER AS paper_sentence_count,
                NULL::INTEGER AS paper_page_count,
                NULL::INTEGER AS paper_table_count,
                NULL::INTEGER AS paper_figure_count,
                ROW_NUMBER() OVER (
                    PARTITION BY COALESCE(cluster_id, 0)
                    ORDER BY COALESCE(citation_count, 0) DESC, corpus_id
                )::INTEGER - 1 AS paper_cluster_index,
                false AS has_table_context,
                false AS has_figure_context
            FROM paper_base
            ORDER BY point_index
            """,
        ),
        BundleTableSpec(
            name="corpus_clusters",
            parquet_file="corpus_clusters.parquet",
            schema=CLUSTERS_SCHEMA,
            sql="""
            SELECT
                cluster_id,
                label,
                label_mode,
                label_source,
                member_count,
                paper_count,
                centroid_x,
                centroid_y,
                representative_node_id,
                representative_node_kind,
                candidate_count,
                mean_cluster_probability,
                mean_outlier_score,
                is_noise
            FROM solemd.graph_clusters
            WHERE graph_run_id = %(graph_run_id)s
            ORDER BY cluster_id
            """,
        ),
        BundleTableSpec(
            name="corpus_links",
            parquet_file="corpus_links.parquet",
            schema=LINKS_SCHEMA,
            sql="""
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
                true AS is_default_visible,
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
            JOIN solemd.graph src
              ON src.graph_run_id = %(graph_run_id)s
             AND src.corpus_id = c.citing_corpus_id
            JOIN solemd.graph dst
              ON dst.graph_run_id = %(graph_run_id)s
             AND dst.corpus_id = c.cited_corpus_id
            WHERE c.source = 'semantic_scholar_citations_bulk'
            ORDER BY src.point_index, dst.point_index
            """,
        ),
        BundleTableSpec(
            name="corpus_documents",
            parquet_file="corpus_documents.parquet",
            schema=DOCUMENTS_SCHEMA,
            sql=
            shared_cte
            + """
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
            FROM paper_base
            ORDER BY point_index
            """,
        ),
        BundleTableSpec(
            name="corpus_cluster_exemplars",
            parquet_file="corpus_cluster_exemplars.parquet",
            schema=EXEMPLARS_SCHEMA,
            sql=
            shared_cte
            + """
            , ranked AS (
                SELECT
                    cluster_id,
                    ROW_NUMBER() OVER (
                        PARTITION BY cluster_id
                        ORDER BY
                            ((x - centroid_x) * (x - centroid_x)) + ((y - centroid_y) * (y - centroid_y)),
                            COALESCE(citation_count, 0) DESC,
                            corpus_id
                    ) AS rank,
                    'paper:' || corpus_id::TEXT AS node_id,
                    COALESCE(paper_id, 'corpus:' || corpus_id::TEXT) AS paper_id,
                    sqrt(((x - centroid_x) * (x - centroid_x)) + ((y - centroid_y) * (y - centroid_y)))::REAL AS exemplar_score,
                    title,
                    journal_name AS journal,
                    year,
                    COALESCE(tldr, LEFT(abstract, 500), title) AS chunk_preview
                FROM paper_base
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
    ]


def _write_query_to_parquet(
    conn,
    *,
    sql: str,
    params: dict,
    schema: pa.Schema,
    output_path: Path,
    batch_size: int = 50_000,
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
            writer.write_table(table)
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


def export_graph_bundle(
    *,
    graph_run_id: str,
    graph_name: str = "cosmograph",
    node_kind: str = "corpus",
) -> BundleSummary:
    bundle_dir = settings.graph_bundles_root_path / graph_run_id
    bundle_dir.mkdir(parents=True, exist_ok=True)

    table_summaries: dict[str, dict] = {}
    total_bytes = 0
    with db.connect() as conn:
        for spec in _table_specs():
            summary = _write_query_to_parquet(
                conn,
                sql=spec.sql,
                params={"graph_run_id": graph_run_id},
                schema=spec.schema,
                output_path=bundle_dir / spec.parquet_file,
            )
            table_summaries[spec.name] = asdict(summary)
            total_bytes += summary.bytes

    manifest_payload = {
        "bundle_format": "parquet-manifest",
        "bundle_version": "1",
        "created_at": None,
        "graph_name": graph_name,
        "graph_run_id": graph_run_id,
        "node_kind": node_kind,
        "duckdb_file": None,
        "tables": table_summaries,
    }
    manifest_path = bundle_dir / "manifest.json"
    manifest_path.write_text(json.dumps(manifest_payload, indent=2), encoding="utf-8")
    bundle_checksum = _hash_file(manifest_path)
    total_bytes += manifest_path.stat().st_size

    return BundleSummary(
        graph_run_id=graph_run_id,
        bundle_dir=str(bundle_dir),
        bundle_checksum=bundle_checksum,
        bundle_bytes=total_bytes,
        bundle_manifest=manifest_payload,
        tables=table_summaries,
    )
