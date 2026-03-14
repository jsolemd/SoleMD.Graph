# Handoff: Bundle Column Cleanup (SoleMD.App)

## Problem

The `graph_points` and `paper_points` web parquet tables ship columns the web app never reads. Total bundle is 17.8 MB; `graph_points` alone is 1.3 MB (43 cols, 4,072 rows).

## Columns to drop from `graph_points` web export

| Column | Reason |
|--------|--------|
| `graph_run_id` | Internal, never displayed |
| `source_embedding_id` | Internal UUID |
| `block_id` | Parser internal |
| `block_type` | Parser internal (4 values: marker_block, table_body, figure_caption, table_caption) |
| `section_type` | 674 raw values — `section_canonical` (11 clean values) is used instead |
| `section_path` | Raw heading path, never surfaced in UI |

## Columns to drop from `paper_points` web export

| Column | Reason |
|--------|--------|
| `abstract` | ALL null (106/106) |
| `abstract_preview` | ALL null (106/106) |
| `incoming_citation_count` | All zeros — revisit when citation links are built |
| `outgoing_citation_count` | All zeros — revisit when citation links are built |

## Estimated savings

~200-300 KB compressed (mainly `section_type` strings). Modest but keeps the schema honest.

## Where to change

The `_web` table views in the graph export pipeline — wherever `graph_points_web` and `paper_points_web` SELECT columns are defined.

## Web-side impact

None. These columns are not referenced in any component, hook, or type that renders data. The `ChunkNode` and `PaperNode` TypeScript types include them but they can be made optional (`?`) after the pipeline change.
