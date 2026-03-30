"""Shared graph point projection contract for bundle export and local attachment."""

from __future__ import annotations

import pyarrow as pa

POINTS_SCHEMA = pa.schema(
    [
        ("point_index", pa.int32()),
        ("id", pa.string()),
        ("paper_id", pa.string()),
        ("hex_color", pa.string()),
        ("hex_color_light", pa.string()),
        ("x", pa.float32()),
        ("y", pa.float32()),
        ("cluster_id", pa.int32()),
        ("cluster_label", pa.string()),
        ("title", pa.string()),
        ("citekey", pa.string()),
        ("journal", pa.string()),
        ("year", pa.int32()),
        ("display_label", pa.string()),
        ("semantic_groups_csv", pa.string()),
        ("relation_categories_csv", pa.string()),
        ("is_in_base", pa.bool_()),
        ("base_rank", pa.float32()),
        ("text_availability", pa.string()),
        ("paper_author_count", pa.int32()),
        ("paper_reference_count", pa.int32()),
        ("paper_entity_count", pa.int32()),
        ("paper_relation_count", pa.int32()),
    ]
)


def build_point_projection_select_sql(
    source_table: str,
    *,
    where: str,
    order_by: str,
) -> str:
    """Project canonical point rows into the frontend source-table shape."""
    return f"""
        SELECT
            point_index,
            'paper:' || corpus_id::TEXT AS id,
            COALESCE(paper_id, 'corpus:' || corpus_id::TEXT) AS paper_id,
            CASE
                WHEN COALESCE(cluster_id, 0) = 0 THEN '#555555'
                ELSE (ARRAY[
                    'rgba(43, 85, 168, 0.85)',
                    'rgba(153, 82, 213, 0.85)',
                    'rgba(240, 105, 180, 0.85)',
                    'rgba(255, 149, 131, 0.85)',
                    'rgba(254, 224, 139, 0.85)'
                ])[1 + MOD(COALESCE(cluster_id, 0), 5)]
            END AS hex_color,
            CASE
                WHEN COALESCE(cluster_id, 0) = 0 THEN '#999999'
                ELSE (ARRAY[
                    'rgba(43, 85, 168, 0.85)',
                    'rgba(153, 82, 213, 0.85)',
                    'rgba(240, 105, 180, 0.85)',
                    'rgba(255, 149, 131, 0.85)',
                    'rgba(254, 224, 139, 0.85)'
                ])[1 + MOD(COALESCE(cluster_id, 0), 5)]
            END AS hex_color_light,
            x,
            y,
            cluster_id,
            cluster_label,
            title,
            NULL::TEXT AS citekey,
            journal_name AS journal,
            year,
            title AS display_label,
            semantic_groups_csv,
            relation_categories_csv,
            is_in_base,
            base_rank,
            text_availability,
            author_count AS paper_author_count,
            COALESCE(reference_count, 0) AS paper_reference_count,
            entity_count AS paper_entity_count,
            relation_count AS paper_relation_count
        FROM {source_table}
        WHERE {where}
        ORDER BY {order_by}
    """
