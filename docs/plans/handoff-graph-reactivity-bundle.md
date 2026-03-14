# Handoff: Graph Reactivity Bundle Tables

> **From**: SoleMD.Web (graph UI)
> **To**: SoleMD.App (graph bundle pipeline)
> **Context**: You are working on graph runs, DuckDB manifest exports, and embeddings. This handoff requests two new tables in the bundle to support graph reactivity — the "living graph" feature where typing in the UI lights up related nodes in real-time.
> **Full spec**: `/workspaces/SoleMD.Web/docs/plans/graph-reactivity.md`

---

## What We Need

Two new tables added to the DuckDB bundle export, registered in the manifest alongside existing tables like `graph_points`, `graph_clusters`, etc.

---

### 1. `graph_entity_vocab` — Entity Vocabulary for Instant Lookup

**Purpose**: As the user types in the web UI, we tokenize their input and look up each token against this vocabulary table. Only recognized biomedical terms (entities, drugs, genes, diseases) trigger graph highlighting. Pre-computed `chunk_indices` arrays mean zero scanning at query time — the mapping is already materialized.

**Schema**:

```sql
CREATE TABLE graph_entity_vocab (
    term            TEXT NOT NULL,     -- display form: "dopamine", "BDNF", "treatment-resistant depression"
    term_lower      TEXT NOT NULL,     -- lowercase for case-insensitive lookup
    entity_type     TEXT,              -- NER label: "COMPOUND", "DISEASE", "PROTEIN", "GENE", etc.
    canonical_name  TEXT,              -- from vocab.terms if linked, else NULL
    mention_count   INTEGER NOT NULL,  -- total mentions across all chunks in the bundle
    chunk_count     INTEGER NOT NULL,  -- distinct chunks that mention this entity
    chunk_indices   INTEGER[]          -- pre-computed array of graph_points_web index values
);
```

**Data source** — join path through existing tables:

```
solemd.rag_chunk_entities (chunk ↔ entity association)
  → solemd.entities (entity text, label/type)
  → solemd.entity_links (entity → vocab.terms, optional)
  → vocab.terms (canonical name, optional)
```

**Build logic** (pseudocode for `loader.py` or `tables.py`):

```python
def build_entity_vocab(
    chunk_entity_rows: list,   # from solemd.rag_chunk_entities
    entity_rows: list,         # from solemd.entities
    entity_link_rows: list,    # from solemd.entity_links
    point_index_map: dict,     # rag_chunk_id → graph_points_web index (from build_point_records)
) -> list[dict]:
    """
    Aggregate entity mentions across chunks, resolve canonical names,
    and pre-compute the chunk_indices array for each vocabulary term.
    """
    # Group by normalized entity text (lowercase)
    # For each unique entity term:
    #   - Count total mentions (sum of rag_chunk_entities.mention_count)
    #   - Count distinct chunks
    #   - Collect the graph_points_web index for each chunk (via point_index_map)
    #   - Look up canonical name via entity_links → vocab.terms (if linked)
    #   - Take the most common entity_type across mentions
    #
    # Deduplicate: if "Dopamine" and "dopamine" both appear, merge into one row
    # with term = most frequent casing, term_lower = "dopamine"
    #
    # Filter: only include terms with chunk_count >= 1
    # (future: could add a minimum mention_count threshold)
```

**Critical detail**: `chunk_indices` values must match the `index` column in `graph_points_web`. The `index` column is assigned in `duckdb.ts` via `ROW_NUMBER() OVER (ORDER BY cluster_id, paper_id, chunk_index, node_id) - 1`. The point_index_map must use the same ordering to produce correct indices, OR the indices should be assigned during bundle build (not at web load time) so both tables agree.

**Expected size**: ~3,000-10,000 rows depending on corpus. At 5,000 entities with average 10 chunk_indices each, this is ~150 KB in Parquet.

---

### 2. `graph_chunk_embeddings` — Full-Dimension Embeddings for Client-Side Similarity

**Purpose**: Semantic search in the browser. When the user types "reward circuitry," we compute a query embedding and find the nearest chunks by cosine similarity — entirely client-side in DuckDB-WASM. This lights up semantically related nodes even without exact keyword match.

**Schema**:

```sql
CREATE TABLE graph_chunk_embeddings (
    rag_chunk_id    TEXT NOT NULL,       -- matches graph_points id
    index           INTEGER NOT NULL,    -- matches graph_points_web index
    embedding       FLOAT[768] NOT NULL  -- full-dimension vectors, no reduction
);
```

**Data source**: `solemd.graph_chunk_embeddings.embedding` (768-dim, model_tag = current model). Already loaded via `load_chunk_embedding_rows()` in `loader.py`.

**No dimensionality reduction**: At ~2K chunks, 768-dim = 6.7 MB in Parquet — negligible alongside the existing ~2 MB bundle. Reduction is lossy and could degrade cosine similarity ranking, which defeats the purpose. If the corpus scales to 100K+ chunks and the ~670 MB becomes a bandwidth problem, we can revisit reduction then.

**Priority**: This is Phase B (lower priority than the vocab table). If you're already exporting embeddings for other purposes, adding this table is trivial. If not, this can wait — the vocab table alone (Phase A) gives us the core reactivity feature.

**Expected size**: 768 × 4 bytes × 2,184 chunks ≈ 6.7 MB.

---

## Integration Points

### Where these fit in the existing pipeline

**`loader.py`** — already has `load_chunk_entity_candidates()` which queries `rag_chunk_entities + entities + entity_links + vocab.terms`. The entity vocab loader is a sibling query with different aggregation.

**`tables.py`** — already has `build_bundle_tables()` returning a list of `GraphBundleTable`. Add the new tables to this list:

```python
def build_bundle_tables(layer_seed, ...) -> list[GraphBundleTable]:
    tables = [
        # ... existing 7 tables ...
        GraphBundleTable(name="graph_entity_vocab", records=vocab_records, ...),
    ]
    if include_embeddings:
        tables.append(
            GraphBundleTable(name="graph_chunk_embeddings_reduced", records=emb_records, ...)
        )
    return tables
```

**`bundle.py`** — `write_graph_bundle()` already iterates over the table list, exports each to Parquet, computes SHA256, and registers in the manifest. No changes needed here — new tables are automatically picked up.

**`build.py`** — orchestration. Call the new loaders, pass results to `build_bundle_tables()`.

### Manifest registration

The new tables will automatically appear in `bundle_manifest.tables` with their schema, row_count, sha256, and bytes — same as existing tables. The Web side reads `bundle_manifest.tables` to know what's available.

### Web side consumption

The Web side (`lib/graph/duckdb.ts`) will:

1. Check `bundle.bundleManifest.tables.graph_entity_vocab` exists
2. Load the table (same pattern as `graph_facets` — conditional on manifest)
3. Query it for vocabulary lookups during typing

No changes needed to the bundle serving API (`/api/graph-bundles/[checksum]/[asset]`) — it already serves any asset in the bundle directory.

---

## The index alignment problem

**This is the most important technical detail.**

Currently, `graph_points_web.index` is assigned at **Web load time** in `duckdb.ts`:

```sql
ROW_NUMBER() OVER (ORDER BY cluster_id, paper_id, chunk_index, node_id) - 1 AS index
```

But `graph_entity_vocab.chunk_indices` needs to reference these same index values, which means the pipeline needs to know the ordering at **bundle build time**.

**Options** (pick one):

1. **Assign index during bundle build** (recommended): Add an `index` column to `graph_points` in the bundle, computed with the same `ROW_NUMBER()` ordering. The Web side uses this column directly instead of computing its own. This is cleaner and guarantees alignment.

2. **Use `rag_chunk_id` instead of index**: Store `chunk_ids TEXT[]` in the vocab table instead of `chunk_indices INTEGER[]`. The Web side resolves IDs to indices at load time. Simpler for the pipeline but adds a join step on the client.

3. **Deterministic ordering contract**: Document the exact `ORDER BY` clause as a contract between pipeline and Web. Fragile — any ordering change breaks alignment.

Option 1 is strongly preferred. The `graph_points` table should own its index.

---

## Summary

| Table | Priority | Data Source | Estimated Size | Pipeline Changes |
|-------|----------|-------------|----------------|------------------|
| `graph_entity_vocab` | **High (Phase A)** | `rag_chunk_entities` + `entities` + `entity_links` + `vocab.terms` | ~150 KB | New loader + new table builder |
| `graph_chunk_embeddings` | Medium (Phase B) | `solemd.graph_chunk_embeddings` (full 768-dim) | ~6.7 MB | Export existing vectors + add index column |
| `graph_points.index` column | **High** | Computed (`ROW_NUMBER`) | 0 (existing table) | Add column to `build_point_records()` |

The entity vocab table is the critical path — it enables the core "type and watch the graph respond" feature with zero additional infrastructure. The embeddings table enables semantic matching but can follow later.

---

*See `/workspaces/SoleMD.Web/docs/plans/graph-reactivity.md` for the full feature spec including UX behavior, Cosmograph API usage, implementation architecture, and phasing.*
