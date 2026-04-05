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


# Cluster palette (20 colors) — baked fallback for cluster_id-based coloring.
# Frontend categorical color scheme is authoritative; these are the Parquet fallback.
_CLUSTER_PALETTE_DARK = [
    '#4e79a7', '#f28e2c', '#e15759', '#76b7b2', '#59a14f',
    '#edc949', '#af7aa1', '#ff9da7', '#9c755f', '#bab0ab',
    '#6a4c93', '#1982c4', '#8ac926', '#ffca3a', '#ff595e',
    '#3dc1d3', '#f15bb5', '#00bbf9', '#00f5d4', '#9b5de5',
]

# Light theme: darker/more saturated for contrast on white backgrounds.
_CLUSTER_PALETTE_LIGHT = [
    '#3a5d87', '#c06e1e', '#b83a3d', '#4d8a85', '#3f7a35',
    '#c4a020', '#8a5a80', '#d47078', '#7a5840', '#8a827c',
    '#4e3670', '#0f6a9e', '#6a9e1a', '#d4a020', '#d43a40',
    '#2a9db0', '#c83a98', '#0090cc', '#00c4a8', '#7a40b8',
]


def _build_color_case_sql(palette: list[str], column: str, noise_color: str) -> str:
    """Build a SQL CASE expression mapping a cluster ID column to palette colors."""
    array_literal = ", ".join(f"'{c}'" for c in palette)
    n = len(palette)
    return f"""CASE
                WHEN COALESCE({column}, 0) = 0 THEN '{noise_color}'
                ELSE (ARRAY[{array_literal}])[1 + MOD(COALESCE({column}, 0), {n})]
            END"""


def build_point_projection_select_sql(
    source_table: str,
    *,
    where: str,
    order_by: str,
) -> str:
    """Project canonical point rows into the frontend source-table shape."""
    color_col = "cluster_id"
    hex_color_sql = _build_color_case_sql(
        _CLUSTER_PALETTE_DARK, color_col, '#555555',
    )
    hex_color_light_sql = _build_color_case_sql(
        _CLUSTER_PALETTE_LIGHT, color_col, '#999999',
    )
    return f"""
        SELECT
            point_index,
            'paper:' || corpus_id::TEXT AS id,
            COALESCE(paper_id, 'corpus:' || corpus_id::TEXT) AS paper_id,
            {hex_color_sql} AS hex_color,
            {hex_color_light_sql} AS hex_color_light,
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
