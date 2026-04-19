# 07 — OpenSearch Plane

> **Status**: locked for plane shape — **two-tier serving model** (warm
> = paper-level, hot = evidence-unit-level), two release-scoped indexes
> (`paper_index` covers both tiers, `evidence_index` covers hot only)
> behind stable aliases, Faiss HNSW + fp16 scalar quantization on dense
> lanes, native `hybrid` compound query + `score-ranker-processor` (RRF)
> for lane fusion, MedCPT encoders in engine FastAPI (not ML Commons),
> bulk-then-freeze build via Dramatiq actors on the `serve_read` pool,
> atomic alias-swap cutover paired with the projection cohort.
> Microdesign details (HNSW `m` / `ef_construction` / `ef_search`,
> exact `refresh_interval` cadence, per-shard sizing, RRF rank constant
> beyond the 60 default, snapshot retention) are **provisional until
> the first sample bulk-load** validates them on real data. The hot
> tier ceiling (~10 K papers, ~100 K chunks) and the 500-paper start
> are **provisional**, operator-tunable as RAM allows; the warm-tier
> split is **locked**, while the historical ~14 M-paper universe is the
> eventual full-backfill ceiling for the selected canonical corpus rather
> than a day-one live requirement.
>
> **Date**: 2026-04-16
>
> **Scope**: the OpenSearch retrieval plane end-to-end. Mappings, ingest
> pipelines, search pipelines, hybrid query shape, encoder placement,
> bulk-indexer (Dramatiq actor) shape, alias-swap cutover, evidence-key
> round-trip, snapshot/backup pointers, observability hooks, and the
> wire contract that `08-retrieval-cascade.md` consumes.
>
> **Schema authority**: this doc is the OpenSearch-native authority for
> index mappings, ingest pipelines, search pipelines, and alias
> protocol. Engine code under `engine/app/opensearch/` derives from here.
> Index-build lineage on the PG side (`serving_runs.opensearch_index`
> artifact rows) is owned by `03 §4.3` and `04`; this doc fixes the
> OpenSearch side and the boundary contract.

## Purpose

Define the OpenSearch retrieval plane so every consumer — engine FastAPI
search handler, Dramatiq indexer actor, projection cohort orchestrator,
operational runbook, observability dashboard — resolves its mapping,
pipeline, alias, and cutover contract against the same shape.

OpenSearch is the **runtime retrieval substrate**. Canonical truth and
grounding round-trip stay on PG warehouse (`02 §4.5`,
`03 §3 — paper_evidence_units` over FDW). OpenSearch owns lane fusion
(BM25 + dense, optional sparse later) and top-k retrieval at request
time. The retrieval cascade orchestrator
(query encoding → hybrid retrieve → cross-encoder rerank → parent-child
promotion → packet assembly) is `08-retrieval-cascade.md`'s scope. This
doc owns the OpenSearch-side primitives `08` calls.

Scope clarification: the ~14 M-paper counts below are capacity and full-backfill
numbers for the historically selected canonical corpus, not an instruction to
index all raw S2 papers immediately. Until `05e-corpus-selection.md` publishes a
full mapped backfill wave, warm indexing may operate on a smaller mapped wave.

Seven load-bearing properties:

1. **Two-tier serving model.** **Warm tier** = paper-level discovery
   and paper-grounded support (title + abstract + paper-level dense vector)
   over the selected canonical corpus. The active warm wave may be smaller than
   the historical ~14 M-paper full backfill; warm lives only in `paper_index`;
   citation goes back to the
   paper. **Hot tier** = evidence-unit retrieval over the canonical
   warehouse sentence/block spine; starts at ~500 papers, ceiling ~10 K
   papers (~100 K evidence units at ~10 units each); lives in both
   `paper_index` (paper-level row, marked `tier=hot`) and
   `evidence_index` (one retrieval doc per promoted evidence unit,
   carrying sentence/block coordinates for round-trip grounding). Hot
   cohort selection is a product decision driven by `serving_members`
   per `03 §4.3` (cohort_kind = `practice_hot`). (§3, §3.5, §4)
2. **Two release-scoped indexes behind stable aliases.** `paper_index`
   covers both tiers (warm + hot, distinguished by a `tier` byte field);
   `evidence_index` covers the hot tier only. Aliases `paper_index_live`
   and `evidence_index_live` are what every reader knows. Index names
   carry a serving-run suffix; aliases flip atomically per cohort. (§3, §8)
3. **Faiss HNSW + fp16 scalar quantization on dense lanes.** `sq_fp16`
   halves dense-vector memory per the OpenSearch docs; the exact recall
   trade-off for MedCPT 768d remains benchmark-owned for this project.
   Memory math sized against ~21 GB of paper-level vectors (~14 M)
   plus ~150 MB of evidence-unit vectors (~100 K) — single-node fits
   comfortably on the 68 GB host today and on the 128 GB host. (§4)
4. **Hybrid retrieval is OpenSearch-native.** Live retrieval uses
   native `hybrid` + top-level `hybrid.filter` + `score-ranker-processor`
   (RRF, added 2.19) inside the cluster. Engine FastAPI sends one query
   and gets back fused candidates; cross-encoder rerank is a separate
   engine-side step on the top-30. Score-breakdown / normalization is a
   separate benchmark-debug path, not the live combiner. (§5, §6, §14)
5. **MedCPT encoders live in engine FastAPI, not ML Commons.** Model
   lifecycle, GPU residency, batching, and cross-encoder rerank stay
   on the engine by project choice. OpenSearch can host ML models via
   ML Commons, but that is not the day-one path here. (§6)
6. **Bulk-then-freeze indexer, two parallel actors.**
   `opensearch.build_paper_index` (warm + hot, selected mapped wave,
   eventual ~14 M docs on full backfill, slow path)
   and `opensearch.build_evidence_index` (hot only, ~100 K docs, fast
   path). Both follow `06 §6.3`, read from `serve_read` + `warehouse_read`,
   stream via `_bulk` with `refresh_interval=-1`, force-merge, restore
   live settings, warm ANN, then alias-swap. Idempotent on `_id`
   (`evidence_key` for evidence; `corpus_id` for paper). The fast path
   can run more often than the slow path. (§7)
7. **Alias swap is one atomic API call.** Single `_aliases` POST with
   add+remove pair flips both indexes together at OpenSearch level —
   partial state inside the cluster is impossible by construction. The
   PG-side cohort (`04 §5`) flips first; OpenSearch alias swap follows
   within seconds; failure of the alias swap after PG flip is "retry
   alias swap; never roll back PG." That sequence is a SoleMD.Graph
   cutover policy, not a cross-system atomic guarantee from OpenSearch.
   Warm and hot tiers can rebuild on independent cadences when only one
   needs to change. (§8, §12)

What this doc does **not** cover:

- **Cascade orchestration.** Query encoding budgets, cross-encoder
  rerank top-N, parent-child promotion, packet assembly, MMR
  diversification — `08-retrieval-cascade.md`.
- **OpenSearch host tuning.** Heap-target ratio, OS file-cache
  reservation, GC flags, `vm.max_map_count`, NVMe scheduler — surfaces
  in `09-tuning.md`. This doc names the requirements; `09` owns the
  numbers.
- **Backup runbook.** Snapshot cadence and restore drill —
  `11-backup.md`. This doc names the snapshot-repo contract only.
- **Dashboards / SLOs.** `10-observability.md`. This doc names the
  required metrics and structured-log events.
- **Synonym artifact build.** Filtered `concept_search_aliases` →
  synonym bundle — owned by the projection cohort (`04 §6`) and the
  serving-control rows (`03 §4.3 — synonym_bundle artifact_kind`). This
  doc consumes the bundle as one of the search-pipeline inputs (§5.4).

## §0 Conventions delta from `00` / `04`

Inherits every convention from `00 §1`, `02 §0`, `03 §0`, `04 §0`,
`06 §0`, and `research-distilled §6`. OpenSearch adds:

| Concern | This doc adds |
|---|---|
| **Index naming protocol** | `paper_index_<run_token>` and `evidence_index_<run_token>` where `<run_token>` is the full hyphenless `serving_run_id` UUIDv7 (`03 §2`). Stable aliases `paper_index_live` / `evidence_index_live` are what every reader knows. Previous-run alias `_prev` retained 24 h then dropped, mirroring `04 §3.6` `_prev` retention. **locked**. |
| **`opensearch_index` artifact_kind contract** | Per `03 §4.3`, every OpenSearch build emits a `serving_artifacts` row with `artifact_kind = opensearch_index`. This doc fixes the row shape: `alias_or_index_name` carries the concrete index name (not the alias); `artifact_uri` is `opensearch://<index_name>`; `row_count` carries the post-bulk doc count; `artifact_checksum` is a SHA-256 of the canonical mapping JSON for the index, so mapping drift is detectable. **locked**. |
| **`opensearch_alias_swap_status` serving-run audit tail** | Adds three additive `serving_runs` columns — `opensearch_alias_swap_status`, `opensearch_alias_swap_attempted_at`, `opensearch_alias_swap_error` — to close the Saga risk named in `04` open items. See §8.4 / §11.2 / the serve SQL schema delta. **locked** for shape; **provisional** for whether one combined status column later splits per index. |
| **Encoder-placement boundary** | MedCPT encoders and the MedCPT-Cross-Encoder live in engine FastAPI on the RTX 5090, not ML Commons, by project choice. OpenSearch can host models via ML Commons, but that is intentionally not the day-one path; the day-one vector query surface is raw `knn`, not `neural`. (§6) **locked**. |
| **Bulk-then-freeze workflow** | `refresh_interval=-1`, `number_of_replicas=0` during bulk; `force_merge` to reduce segments; restore live settings; `_warmup` k-NN endpoint to warm Faiss graph; alias swap last. (§7) **locked**. |
| **Per-cohort index lifecycle** | Index build is part of the projection cohort manifest (`04 §5.1`). The cohort manifest's `families` list adds two opaque "families" `opensearch_paper_index` and `opensearch_evidence_index` so cohort-build order, idempotency, and resume work the same way as PG projections. (§7.4) **locked**. |
| **Two-tier model** | Warm tier = paper-level grounding over the selected canonical corpus; the active warm wave may be smaller than the historical ~14 M-paper full backfill, while hot tier = evidence-unit retrieval (~500 papers initially, ~10 K ceiling, ~10 evidence units/paper, ~100 K evidence units max). `paper_index` carries a `tier` byte field (`1=warm`, `2=hot`); `evidence_index` is hot-tier-only. Tier promotion is driven by `serving_members` (cohort_kind = `practice_hot` per `03 §4.3`) + `evidence_priority_score` (`02 §4.4`). (§3.5) **locked** for the split; ceiling **provisional**. |

## §1 Identity / boundary

No new identity types. Confirmed:

- **`evidence_key` UUIDv5** (per `02 §2`) is the join key for
  `evidence_index` documents. Round-trippable to canonical coordinates
  via `warehouse_grounding.paper_evidence_units` (`03 §3`). The `_id`
  of every `evidence_index` doc **is** the `evidence_key`.
- **`corpus_id` BIGINT** (per `02 §2`) is the join key for `paper_index`
  documents. The `_id` of every `paper_index` doc is the stringified
  `corpus_id`.
- **`serving_run_id` UUIDv7** (per `03 §2`) is what binds the OpenSearch
  index name to the active runtime pointer. The concrete index name
  uses the full hyphenless UUIDv7 token (`<run_token>`), while the
  canonical UUID remains in `serving_artifacts.serving_run_id`.

The boundary contract for `08`:

- `08` sends `(query_text, query_vector, k, filter, search_pipeline)` to
  OpenSearch and receives `[(doc_id, score, optional fields)]` back.
- For paper hits, `doc_id` is `corpus_id` (string-typed at the
  OpenSearch wire boundary; engine casts to `int`).
- For evidence hits, `doc_id` is `evidence_key` (uuid-typed; engine casts
  to `uuid.UUID`).
- The cross-encoder rerank, parent-child promotion, packet assembly,
  and grounding round-trip all live engine-side. OpenSearch returns
  the ranked candidate set only — no enrichment, no joins.

This minimal boundary is what makes the "OpenSearch as runtime
retrieval substrate, PG as canonical state" split safe: the only thing
OpenSearch hands back that PG must trust is the candidate set; every
field used in the response shape is round-tripped from PG by
`evidence_key` / `corpus_id`. **locked**.

## §2 Cluster topology

Single-node OpenSearch on the current serving line from
`16-version-inventory.md`, sized for ~14 M papers + ~140 M
evidence chunks. Production-readiness story (read replicas + multi-node
+ cross-cluster snapshot) is **deferred** per `00 §6` — listed in §13
deferred decisions.

### 2.1 Container and network attachment

Per `00 §1`, the container is `graph-opensearch`, pinned to the
current OpenSearch serving line recorded in `16-version-inventory.md`,
attached to the shared-infra Docker network. Data
volume `graph_opensearch_data` lives on NVMe under `/var/lib/docker`
per `01 §2`, not on the E-drive bind. NVMe is non-negotiable — Faiss
HNSW with fp16 SQ is mmap-served from disk at query time, and
random-access latency on the VHDX is too uneven to size a query budget
against.

### 2.2 Node role

Single-node cluster has all roles by default. Explicit declaration in
`opensearch.yml`:

```yaml
# /usr/share/opensearch/config/opensearch.yml — graph-opensearch single node
cluster.name: solemd-graph
node.name: graph-opensearch-1
node.roles: [cluster_manager, data, ingest]

# Single-node cluster discovery
discovery.type: single-node
cluster.initial_cluster_manager_nodes: ["graph-opensearch-1"]

# Disable dynamic mapping at index level by default (mappings strict
# in §3); plugin-level guardrails on:
action.auto_create_index: false
indices.query.bool.max_clause_count: 4096   # safety against pathological hybrid queries

# k-NN plugin: Faiss is the engine of record (research-distilled §6)
knn.algo_param.index_thread_qty: 16          # Faiss build parallelism — matches host logical-core budget for ingest
knn.memory.circuit_breaker.enabled: true
knn.memory.circuit_breaker.limit: "55%"      # of JVM heap; 09-tuning.md owns final
knn.cache.item.expiry.enabled: false         # k-NN graphs stay resident; no per-query rebuild

# Ingest node thread pool: bulk indexing only — no LLM inference (§6)
thread_pool.write.queue_size: 2000
```

Per-cluster GUC owners:
- `09-tuning.md` owns heap (`-Xms`, `-Xmx`), GC flags, `vm.max_map_count`,
  open-file limits.
- This doc owns `node.roles`, `discovery.type`, k-NN plugin GUCs, and
  the per-index settings in §3.

**locked** for shape; **provisional** for the k-NN circuit-breaker
percentage (revisit after first bulk-load measures peak Faiss graph
memory against the heap target).

### 2.3 JVM heap budget

OpenSearch heap **target**: 31 GB on the 68 GB host today, 50 % of
physical RAM with a hard ceiling at 31 GB to stay under the
compressed-oops boundary. At 128 GB host the target stays at 31 GB —
extra memory goes to the OS file cache (Faiss mmap) and the engine
side, not to JVM heap. `09-tuning.md` owns the exact `-Xms` / `-Xmx`
values; this doc's contract is "heap target 31 GB regardless of host
RAM upgrade."

The k-NN graph memory (Faiss HNSW + fp16) sits **off-heap** as mmap
under the OS file cache. §4 sizes it.

### 2.4 Open-file limits and `vm.max_map_count`

- `nofile`: 65 535 on the container, set in compose ulimits.
- `vm.max_map_count`: 262 144, set on the WSL2 host via `sysctl`. With
  one Faiss segment per shard at <1 GB after force-merge, only a
  handful of mmap regions are needed; the OpenSearch default ceiling
  is generous. `01 §6` already calls out NVMe placement; mmap concerns
  are NVMe-side only.

### 2.5 Production-readiness story

Single-node is intentional for the solo-dev rebuild window. Multi-node
+ shard replica + snapshot mirror are tracked as deferred per `00 §6`:

- **Read replica**: trigger when search p95 plateaus on JVM
  saturation rather than mapping/quantization choices.
- **Off-box snapshot mirror**: trigger per `00 §6 — Off-box backup
  mirror (Backblaze B2)` once any irreplaceable data lands.

§13 enumerates the deferred set.

## §3 Index mappings — `paper_index` and `evidence_index`

Two indexes. Strict mappings (`dynamic: strict`) so a wrong field at
ingest time fails fast instead of polluting the mapping with
inferred types. Per-index settings tuned for bulk-then-freeze.

### 3.1 Shared component template

Common analyzer + index-settings live in a component template so
multi-node migration is a shard-count change later (per
`research-distilled §6`).

```json
PUT _component_template/solemd_graph_common
{
  "template": {
    "settings": {
      "index": {
        "number_of_shards": 1,
        "number_of_replicas": 0,
        "refresh_interval": "1s",
        "codec": "best_compression",
        "merge.policy.max_merged_segment": "5gb",
        "knn": true,
        "knn.algo_param.ef_search": 100,
        "max_result_window": 10000,
        "search.idle.after": "30s",
        "queries.cache.enabled": true
      },
      "analysis": {
        "analyzer": {
          "biomedical_text": {
            "type": "custom",
            "tokenizer": "standard",
            "filter": [
              "icu_normalizer",
              "lowercase",
              "asciifolding",
              "biomedical_synonyms_runtime",
              "porter_stem"
            ]
          },
          "biomedical_text_no_synonyms": {
            "type": "custom",
            "tokenizer": "standard",
            "filter": [
              "icu_normalizer",
              "lowercase",
              "asciifolding",
              "porter_stem"
            ]
          }
        },
        "filter": {
          "biomedical_synonyms_runtime": {
            "type": "synonym_graph",
            "synonyms_path": "analysis/biomedical_synonyms.txt",
            "updateable": true
          }
        }
      }
    }
  }
}
```

Notes:

- **`number_of_shards: 1`** is correct on single-node and on the
  expected at-scale shape (~14 M papers fits one shard comfortably;
  ~140 M evidence chunks justifies revisit at multi-node migration
  time, listed in §13).
- **`codec: best_compression`** trades CPU for ~10–15 % disk savings on
  the 638 GB warehouse-backed corpus's text payloads. Worth it on a
  read-heavy serving plane where disk space is the constraint.
- **`refresh_interval: 1s`** is the live-index value (set after bulk).
  During bulk it flips to `-1` (§7.3).
- **`merge.policy.max_merged_segment: 5gb`** lets force-merge collapse
  to a small segment count without re-merging massive segments later.
- **`knn: true`** + **`knn.algo_param.ef_search: 100`** is the per-index
  k-NN runtime knob; per-shard tuning lives in §4. Provisional.
- **`biomedical_synonyms_runtime`** is the search-time synonym filter
  fed by the `concept_search_aliases` artifact (`02 §4.3` /
  `04 §6 — synonym_bundle`). `updateable: true` enables hot reload via
  `_reload_search_analyzers` without a full reindex
  (research-distilled §6). Synonym artifact build is owned by `04`.
- **`icu_normalizer`** comes from the `analysis-icu` plugin (bundled in
  OpenSearch 3.x); handles Unicode normalization on biomedical
  identifiers (Greek letters in gene/protein names, accented author
  affiliations).

### 3.2 `paper_index` mapping

One doc per paper **across both tiers**, keyed by `corpus_id`. Every
doc carries a `tier` byte field (`1=warm`, `2=hot`) so `08` can scope
retrieval with an explicit filter. Indexes per-paper text (title +
abstract + optional s2orc snippets when available) plus the paper-level
dense vector (768d MedCPT-Article-Encoder, fp16-quantized on the Faiss
HNSW graph). Used by the cards-list lane fusion query, the paper-level
recommendation surfaces, and as the parent set for hot-tier evidence hits.

```json
PUT _index_template/paper_index_template
{
  "index_patterns": ["paper_index_*"],
  "composed_of": ["solemd_graph_common"],
  "priority": 200,
  "template": {
    "settings": {
      "index": {
        "knn.algo_param.ef_search": 100,
        "knn.space_type": "innerproduct"
      }
    },
    "mappings": {
      "dynamic": "strict",
      "_source": {
        "enabled": true,
        "excludes": ["dense_vector"]
      },
      "properties": {
        "corpus_id":               { "type": "long" },
        "serving_run_id":          { "type": "keyword", "doc_values": true },
        "chunk_version_key":       { "type": "keyword", "doc_values": true },
        "title": {
          "type": "text",
          "analyzer": "biomedical_text",
          "search_analyzer": "biomedical_text",
          "fields": {
            "raw":          { "type": "keyword", "ignore_above": 1024 },
            "no_synonyms":  { "type": "text",   "analyzer": "biomedical_text_no_synonyms" }
          }
        },
        "abstract": {
          "type": "text",
          "analyzer": "biomedical_text",
          "search_analyzer": "biomedical_text",
          "term_vector": "with_positions_offsets",
          "fields": {
            "no_synonyms": { "type": "text", "analyzer": "biomedical_text_no_synonyms" }
          }
        },
        "s2orc_snippet_text": {
          "type": "text",
          "analyzer": "biomedical_text",
          "search_analyzer": "biomedical_text"
        },
        "tldr": {
          "type": "text",
          "analyzer": "biomedical_text"
        },
        "venue_display":           { "type": "keyword" },
        "publication_year":        { "type": "short" },
        "publication_date":        { "type": "date", "format": "strict_date_optional_time" },
        "article_type":            { "type": "byte" },
        "language":                { "type": "byte" },
        "is_retracted":            { "type": "boolean" },
        "is_open_access":          { "type": "boolean" },
        "tier":                    { "type": "byte" },
        "package_tier":            { "type": "byte" },
        "text_availability":       { "type": "byte" },
        "has_full_grounding":      { "type": "boolean" },
        "citation_count":          { "type": "integer" },
        "influential_citation_count": { "type": "integer" },
        "evidence_priority_score": { "type": "float" },
        "concept_ids_top":         { "type": "long" },
        "external_ids": {
          "properties": {
            "pmid":  { "type": "keyword" },
            "doi":   { "type": "keyword" },
            "pmc":   { "type": "keyword" },
            "s2":    { "type": "keyword" }
          }
        },
        "dense_vector": {
          "type": "knn_vector",
          "dimension": 768,
          "data_type": "float",
          "space_type": "innerproduct",
          "method": {
            "name": "hnsw",
            "engine": "faiss",
            "parameters": {
              "m": 16,
              "ef_construction": 256,
              "encoder": {
                "name": "sq",
                "parameters": { "type": "fp16" }
              }
            }
          }
        }
      }
    }
  }
}
```

Mapping notes:

- `_source` excludes `dense_vector` so `_source` payloads don't carry
  768 floats per hit. The vector is needed at query time only as the
  ANN graph; the engine never reads the vector back.
- `title.raw` (keyword) and `*.no_synonyms` (text without synonym
  expansion) are present so `08` can run synonym-blind exact matches
  and exact-title sorting on the same hit set without a second
  request.
- `concept_ids_top` is the per-paper top-N concept set
  (denormalized from `paper_top_concepts`, `02 §4.4`) for in-OpenSearch
  filter pushdown. Avoids a PG round-trip when `08` filters by concept.
- `serving_run_id` and `chunk_version_key` are stamped on every doc so
  any debug query can attribute a hit to its build cohort without a
  PG join. Both `keyword` for exact-match filter use.
- `tier` is the two-tier scope field — `1=warm` for paper-level-only
  papers, `2=hot` for evidence-indexed papers. `08` passes
  `filter.tier_in: [1, 2]` (default: both) or `[2]` (hot-only) to
  scope retrieval. Derived at index-build time from `serving_members`
  membership in a `practice_hot` cohort (`03 §4.3`); see §3.5.
- `dense_vector.method.parameters` defaults from research-distilled §6;
  see §4 for the fp16 quantization math and `m` / `ef_construction` /
  `ef_search` rationale. **provisional**.
- `dynamic: strict` rejects unknown fields at ingest — schema drift
  becomes a loud `_bulk` error, not a silent type pollution.

### 3.3 `evidence_index` mapping

One doc per promoted evidence unit (backed by
`02 §4.5 paper_evidence_units`), keyed by `evidence_key`.
**Hot-tier only** — contains evidence-unit docs for the ~500–10 K
papers in the hot cohort, capped at roughly ~100 K evidence units total
at the hot-tier ceiling. Each doc carries the retrieval text surface,
parent `corpus_id`, and the sentence/block coordinates needed for
engine-side packet assembly. Used by `08` for "deep grounding" queries
that need sentence-coordinated citations into the hot cohort.

```json
PUT _index_template/evidence_index_template
{
  "index_patterns": ["evidence_index_*"],
  "composed_of": ["solemd_graph_common"],
  "priority": 200,
  "template": {
    "settings": {
      "index": {
        "knn.algo_param.ef_search": 100,
        "knn.space_type": "innerproduct"
      }
    },
    "mappings": {
      "dynamic": "strict",
      "_source": {
        "enabled": true,
        "excludes": ["dense_vector"]
      },
      "properties": {
        "evidence_key":             { "type": "keyword", "doc_values": true },
        "corpus_id":                { "type": "long" },
        "serving_run_id":           { "type": "keyword", "doc_values": true },
        "chunk_version_key":        { "type": "keyword", "doc_values": true },
        "evidence_kind":            { "type": "byte" },
        "section_role":             { "type": "byte" },
        "section_ordinal":          { "type": "integer" },
        "block_ordinal":            { "type": "integer" },
        "sentence_start_ordinal":   { "type": "integer" },
        "sentence_end_ordinal":     { "type": "integer" },
        "derivation_revision":      { "type": "byte" },
        "chunk_text": {
          "type": "text",
          "analyzer": "biomedical_text",
          "search_analyzer": "biomedical_text",
          "term_vector": "with_positions_offsets",
          "fields": {
            "no_synonyms": { "type": "text", "analyzer": "biomedical_text_no_synonyms" }
          }
        },
        "publication_year":         { "type": "short" },
        "is_retracted":             { "type": "boolean" },
        "package_tier":             { "type": "byte" },
        "evidence_priority_score":  { "type": "float" },
        "concept_ids":              { "type": "long" },
        "dense_vector": {
          "type": "knn_vector",
          "dimension": 768,
          "data_type": "float",
          "space_type": "innerproduct",
          "method": {
            "name": "hnsw",
            "engine": "faiss",
            "parameters": {
              "m": 16,
              "ef_construction": 256,
              "encoder": {
                "name": "sq",
                "parameters": { "type": "fp16" }
              }
            }
          }
        }
      }
    }
  }
}
```

Mapping notes:

- Most paper-level filter fields (`publication_year`, `is_retracted`,
  `package_tier`, `evidence_priority_score`) are denormalized onto every
  evidence-unit doc. At the hot-tier ceiling (~100 K units) this denorm
  cost is ~3 MB total — trivial; benefit is paper-level filter
  pushdown at the evidence-lane query without a parent-join detour.
- `evidence_key` is `keyword` (not `uuid`) because OpenSearch's
  keyword codec is the path the `_id`-equivalent lookup tooling
  expects; UUID semantics are an engine-side concern.
- `concept_ids` is multi-valued — the engine fans annotations from
  `paper_entity_mentions` (`02 §4.5`) onto every evidence unit whose
  sentence span overlaps the entity span. Used by `08` to scope a
  vector-search to "evidence units mentioning concept X."
- Same `dense_vector` shape as `paper_index`: Faiss HNSW + sq_fp16.
  Per-evidence-unit vectors are MedCPT-Article-Encoder embeddings of
  the canonical evidence-unit text surface; query side uses the
  MedCPT-Query-Encoder for both the paper and evidence lanes (see §6).

### 3.4 Per-index settings during build vs live

Per `research-distilled §6`, bulk indexing flips two settings:

| Setting              | Bulk value | Live value |
|----------------------|-----------:|-----------:|
| `refresh_interval`   | `-1`       | `1s`       |
| `number_of_replicas` | `0`        | `0` (single-node today; revisit at multi-node migration) |

Both flips happen inside the §7 actor — set on index create, restored
post-force-merge, alias-swap last.

Primary source for the bulk pattern:
<https://docs.opensearch.org/latest/api-reference/index-apis/update-settings/>;
research-distilled §6 cites the OpenSearch 3.6 announcement.

### 3.5 Hot-tier cohort selection

The hot cohort is the universe of papers whose promoted evidence units
get indexed into `evidence_index` and whose paper rows are stamped
`tier=2` in `paper_index`. Selection is a product decision driven
entirely by serve-side state — this doc fixes the contract; cohort
policy lives in `04 §5` / `03 §4.3`.

**Source of truth.** The hot cohort is defined by membership in a
`serving_cohorts` row with `cohort_kind = 'practice_hot'` (`03 §4.3`),
joined to `serving_members` for the corpus_id list. The cohort can
include explicit operator inclusion / exclusion plus an
`evidence_priority_score` cutoff (`02 §4.4`).

**Promotion / demotion semantics.**

- **Warm → hot promotion.** Adding a `corpus_id` to the
  `practice_hot` cohort triggers an evidence-index batch in the next
  cohort cycle. The next `04` projection cycle's manifest names
  `opensearch_evidence_index` as a family; `opensearch_paper_index`
  is also re-built (or hot-fix re-indexed per §11.2) so the affected
  paper's `tier` field flips from `1` to `2`.
- **Hot → warm demotion.** Removing a `corpus_id` from the cohort
  drops its evidence units from the next `evidence_index` build and flips its
  `paper_index` row's `tier` back to `1`. The drop is automatic —
  the bulk loader simply doesn't write hot-only docs for excluded
  corpus_ids.
- **No incremental hot-mutation.** All tier changes flow through the
  cohort cutover (`04 §5` cohort manifest), never as live
  document-level UPSERTs against `evidence_index`. Build-once-then-
  read-only is preserved.

**Sizing operator contract.**

| Knob | Default | Operator-tunable bounds |
|---|---:|---|
| Hot-tier ceiling | 10 000 papers | 500 (cold start) → ~50 000 (128 GB host upper bound, revisited) |
| Evidence units per paper (mean) | ~10 | 5 → 30 depending on document length |
| Evidence-unit vector memory budget | ~150 MB at 100 K units | enforced by ceiling × per-paper estimate |

**Initial load.** First launch starts at ~500 hot-tier papers,
selected via `evidence_priority_score DESC` from the
`practice_hot` cohort manifest. Operator scales up as RAM headroom and
recall-quality measurements warrant. **provisional** ceiling.

**Failure mode.** A `corpus_id` in the `practice_hot` cohort that has
no `paper_evidence_units` rows on warehouse is dropped from the
evidence-index build and logged as a structured event
`hot_cohort_member_missing_chunks`. The paper still appears in
`paper_index` with `tier=2` (so the cohort intent is visible), but
evidence-lane retrieval against it returns no hits.

**locked** for the contract; **provisional** for the 500-start /
10 K-ceiling specific values.

## §4 HNSW + fp16 quantization

Faiss HNSW with `space_type=innerproduct` (dot-product on
L2-normalized vectors equals cosine similarity; MedCPT outputs are
L2-normalized in the engine before write). `sq_fp16` halves
dense-vector memory per the OpenSearch docs; the exact recall trade-off
for MedCPT 768d remains benchmark-owned for this project.

### 4.1 Memory math

Dense-vector storage on disk (Faiss segment) under fp16 is
`dim × 2 bytes/dim + HNSW graph overhead (~1.5×)`. The two-tier model
makes the totals tractable on a single workstation — `paper_index`
holds ~14 M paper-level vectors regardless of tier; `evidence_index`
holds only the hot-tier evidence units (capped at ~100 K).

| Index             | Doc count          | Raw fp16 vectors | HNSW (~1.5×)  | Total per index |
|-------------------|-------------------:|-----------------:|---------------:|----------------:|
| `paper_index`     | ~14 M (warm + hot) | ~21.5 GB         | ~10.7 GB       | ~32.2 GB        |
| `evidence_index`  | ~100 K (hot only)  | ~150 MB          | ~75 MB         | ~225 MB         |

Per-doc breakdown:
- `paper_index`: 14 M × 768 × 2 B = 21.5 GB raw fp16; HNSW edge
  overhead at `m=16` adds ~50 % → ~32 GB. Includes both warm-tier
  (~14 M minus ~10 K) and hot-tier (~10 K) papers; the per-row
  difference is just the `tier` byte field.
- `evidence_index`: 10 K hot papers × ~10 evidence units each × 768 ×
  2 B = ~150 MB raw fp16; ~50 % overhead → ~225 MB. Initial load at
  500 papers × 10 units → ~7.5 MB.

These numbers sit **off-heap** as mmap under the OS file cache. The
JVM heap target (31 GB, §2.3) is for query / aggregation / circuit
breakers, not for the ANN graph.

### 4.2 RAM allocation against host budget

| Host RAM       | OS file cache budget                       | `paper_index` mmap-resident | `evidence_index` mmap-resident | Headroom            |
|----------------|-------------------------------------------:|----------------------------:|--------------------------------:|---------------------|
| 68 GB today    | ~25 GB (after JVM 31 GB + engine ~12 GB)   | fully resident (~32 GB)*    | trivially resident (~225 MB)    | comfortable         |
| 128 GB planned | ~80 GB                                     | fully resident              | trivially resident              | very comfortable    |

> \* `paper_index` at ~32 GB exceeds the strict ~25 GB OS cache budget
> on the 68 GB host once JVM + engine workloads peak. In practice the
> Linux page cache shares with the rest of the system dynamically;
> after the §7.5 `_warmup` sweep the hot working set (cards-list +
> typical query traffic) fits comfortably, and cold pages page in on
> demand from NVMe in microseconds. The 128 GB upgrade gives clean
> headroom; today's posture is "warm enough" with measured-then-tuned
> circuit-breaker limits (§4.4).

Implications:

- The corrected two-tier model removes the prior draft's ~322 GB
  `evidence_index` problem entirely. `evidence_index` is now a
  trivial ~225 MB hot-cohort artifact; the variable to size against
  is the ~32 GB `paper_index`.
- Single-node OpenSearch on a workstation is a comfortable shape for
  this scale, not a stretch. Multi-node migration is gated on paper
  count growth (>50 M) or explicit warm-tier sharding by year/venue —
  both deferred per §13.

The fp16 quantization keeps the paper-level lane tractable: at fp32
`paper_index` would be ~64 GB raw + HNSW → ~96 GB, blowing past the
68 GB host's RAM entirely. **locked** for the sq_fp16 choice;
**provisional** for the hot-tier ceiling that drives `evidence_index`
sizing (§3.5).

### 4.3 Hot-tier growth ceiling

The §3.5 ceiling of ~10 K hot papers translates to ~225 MB of
`evidence_index` Faiss storage. Even a 5× ceiling expansion (~50 K
hot papers × ~10 evidence units → ~500 K units → ~1.1 GB) stays trivial
against the 68 GB host. The chunk-index lane is not the memory
constraint; the warm-tier `paper_index` is.

Practical operator headroom: hot-tier ceiling can grow to ~50 K
papers on the 68 GB host before chunk-index memory shows up in cache
contention. On 128 GB the ceiling is bounded by encoder throughput
(~250 K MedCPT-Query encodes per hour on the RTX 5090, per
research-distilled §6) more than by storage. **provisional** —
revisit at first sample build with real timing.

### 4.4 HNSW parameters

Per research-distilled §6, the locked decision is the engine
(Faiss) + the quantization (sq_fp16). The parameter triple is
provisional:

| Parameter            | Default | Rationale | Status |
|----------------------|--------:|-----------|--------|
| `m`                  |      16 | Standard quality/memory balance for biomedical embeddings; `m=24` is the higher-quality alternative if recall@10 < 0.95 on benchmark. | **provisional** |
| `ef_construction`    |     256 | Bulk-build quality knob — higher = better graph + slower build. OpenSearch Faiss HNSW defaults to 100; 256 is a quality-biased override taken from the scalar-quantization examples, not a platform default. Lock only after recall/build-time measurement on our corpus. | **provisional** |
| `ef_search`          |     100 | Query-time recall knob — set per-request via `08`'s search pipeline parameter override. 100 is a balanced default; `08` may raise to 200 on the rerank-candidate path. | **provisional** |

These are the per-index template values in §3.2 / §3.3. Real recall@k
benchmarking against the cascade evaluation suite (`research-distilled §6`)
is the trigger to lock concrete values.

Primary sources cited in research-distilled §6:
- `https://docs.opensearch.org/latest/mappings/supported-field-types/knn-methods-engines/` —
  Faiss engine defaults (`m=16`, `ef_construction=100`, `ef_search=100`) and scalar-quantization syntax.
- `https://docs.opensearch.org/2.16/search-plugins/knn/knn-vector-quantization/` —
  SQfp16 example family and memory-estimation formulas that use the higher `ef_construction` example values.
- `https://opensearch.org/blog/introducing-opensearch-3-6/` — 1-bit SQ
  is new in 3.6 but recall loss is not trivial; deferred (§13).

### 4.5 Circuit breaker

`knn.memory.circuit_breaker.limit: "55%"` (§2.2) caps k-NN graph
memory at 55 % of JVM heap. With 31 GB heap that's ~17 GB. This is
NOT the off-heap mmap budget — it's the on-heap working set for
graph traversal scratch space + ef_search frontiers. Trips of the
circuit breaker show as `circuit_breaking_exception` in the search
pipeline; engine FastAPI catches it, logs structured event, returns
degraded response (no dense lane, BM25 only). **locked**.

## §5 Hybrid retrieval pipeline

Native OpenSearch `hybrid` compound query for lane fusion. Per
research-distilled §6, `score-ranker-processor` (added 2.19, in 3.6)
runs the live RRF combination at search-pipeline time. A separate
normalization-based debug pipeline exists for benchmark/explain runs;
it is not the production combiner.

### 5.1 Search pipeline definitions

```json
PUT _search/pipeline/solemd_hybrid_rrf
{
  "description": "Hybrid lane fusion: BM25 + dense (Faiss HNSW + sq_fp16) → RRF.",
  "phase_results_processors": [
    {
      "score-ranker-processor": {
        "combination": {
          "technique": "rrf",
          "rank_constant": 60
        }
      }
    }
  ]
}
```

`rank_constant: 60` is the canonical RRF default
(<https://docs.opensearch.org/latest/search-plugins/search-pipelines/score-ranker-processor/>;
research-distilled §6). Higher values flatten the rank-bias curve;
lower values amplify the contribution of top-ranked items. **locked**
at 60 for the first sample build; **provisional** thereafter.

```json
PUT _search/pipeline/solemd_hybrid_debug
{
  "description": "Benchmark/debug hybrid path: normalization + explanation payloads.",
  "phase_results_processors": [
    {
      "normalization-processor": {
        "normalization": { "technique": "min_max" },
        "combination": {
          "technique": "arithmetic_mean",
          "parameters": { "weights": [0.5, 0.5] }
        }
      }
    }
  ],
  "response_processors": [
    { "hybrid_score_explanation": {} }
  ]
}
```

### 5.2 Pipeline selection rule

Search-pipeline selection is explicit from the engine request surface,
not hidden in `index.search.default_pipeline`. Live requests name
`search_pipeline=solemd_hybrid_rrf`. Benchmark/debug runs that need
score-breakdown payloads name `search_pipeline=solemd_hybrid_debug`
and set `explain=true`. This keeps the rank-based live path and the
normalization-based debug path from drifting into one another.

### 5.3 Hybrid query shape — paper lane

Default queries hit `paper_index` and span both tiers (`tier in [1, 2]`).
"Hot-only" queries pass `tier in [2]` to scope to the evidence-indexed
universe (used by `08` when the user explicitly wants deep-grounding-
eligible papers).

```json
GET paper_index_live/_search
{
  "size": 200,
  "query": {
    "hybrid": {
      "filter": {
        "bool": {
          "filter": [
            { "term":  { "is_retracted": false } },
            { "range": { "publication_year": { "gte": 2010 } } },
            { "terms": { "tier": [1, 2] } }
          ]
        }
      },
      "queries": [
        {
          "bool": {
            "should": [
              { "match": { "title":    { "query": "<query_text>", "boost": 2.0 } } },
              { "match": { "abstract": { "query": "<query_text>", "boost": 1.0 } } },
              { "match": { "s2orc_snippet_text": { "query": "<query_text>", "boost": 0.5 } } }
            ]
          }
        },
        {
          "knn": {
            "dense_vector": {
              "vector": [/* 768 floats from MedCPT-Article-Encoder */],
              "k": 200
            }
          }
        }
      ]
    }
  },
  "_source": ["corpus_id", "tier", "package_tier", "publication_year", "evidence_priority_score"]
}
```

Notes:

- Current OpenSearch supports a top-level `hybrid.filter` that applies
  to all subqueries, and that is the default SoleMD shape
  (<https://docs.opensearch.org/latest/query-dsl/compound/hybrid/>).
  If a compatibility path ever duplicates filters inside subqueries, it
  still flows from one engine-side `RetrievalFilter` model and is not
  the normative shape.
- `tier` is always included as an explicit filter, even when both
  tiers are eligible. Saves the cost of OpenSearch's "missing field"
  fallback path, and makes hot-only queries a one-character change
  in the engine helper.
- `_source` is restricted to the fields engine FastAPI needs for
  ranking + parent promotion. Title / abstract are not pulled
  back — text fetch goes through `paper_api_profiles` on serve
  (`03 §4.2`) or through `warehouse_grounding` over FDW (`03 §3`).
- `hybrid` remains the top-level query. SoleMD does not wrap it in
  `function_score`, `script_score`, `constant_score`, or `boosting`,
  because current OpenSearch docs forbid those wrappers for `hybrid`.

### 5.4 Hybrid query shape — evidence lane

`evidence_index` is hot-tier-only by construction (§3.5), so no `tier`
filter is needed at query time. The evidence lane is what `08` reaches
for when the user wants sentence-coordinated grounding ("deep grounding"
queries).

```json
GET evidence_index_live/_search
{
  "size": 100,
  "query": {
    "hybrid": {
      "filter": {
        "bool": {
          "filter": [
            { "term":  { "is_retracted": false } },
            { "terms": { "concept_ids":  [/* optional concept scope */] } }
          ]
        }
      },
      "queries": [
        {
          "bool": {
            "should": [
              { "match": { "chunk_text": { "query": "<query_text>" } } }
            ]
          }
        },
        {
          "knn": {
            "dense_vector": {
              "vector": [/* 768 floats from MedCPT-Query-Encoder */],
              "k": 100
            }
          }
        }
      ]
    }
  },
  "_source": ["evidence_key", "corpus_id", "section_role",
              "block_ordinal", "sentence_start_ordinal", "sentence_end_ordinal",
              "evidence_priority_score"]
}
```

The chunk lane returns sentence-coordinate fields so engine FastAPI
can build the parent paper set + the bounded grounding round-trip
(`03 §3.3`) without a second OpenSearch query.

This evidence-unit dense surface is a SoleMD retrieval choice, not a
claim that evidence-unit-level dense indexing is the canonical MedCPT usage
pattern. MedCPT's native literature posture is query/article retrieval;
article-style dense retrieval remains the default reference surface for
benchmark comparison.

### 5.5 Optional sparse lane (deferred)

Per `00 §6 — Neural sparse (SPLADE) lane in OpenSearch`, a sparse lane
is **deferred** until "MedCPT cascade is live and top-1 conversion
plateaus." Mapping shape preserved as a future `sparse_vector` field
inside both index templates (commented out in §3.2 / §3.3 above; lands
when the trigger fires).

### 5.6 Filtering and pre-filter pushdown

OpenSearch efficient k-NN filtering is more nuanced than "always
pre-filter during ANN traversal." Depending on engine behavior and
thresholds, OpenSearch may choose exact pre-filtering or approximate
search with modified post-filtering. Engine FastAPI's request builder
(`engine/app/opensearch/queries.py`, see §14) may still use local
selectivity heuristics, but those heuristics are benchmark-owned for
this project, not vendor-backed thresholds. **provisional** until
measured on real query workload.

## §6 Encoder placement

MedCPT-Article-Encoder (paper-level + evidence-unit document dense),
MedCPT-Query-Encoder (query-side dense), and MedCPT-Cross-Encoder
(rerank top-30) live
in **engine FastAPI**, not OpenSearch ML Commons. This is the locked
architectural split.

### 6.1 Why engine, not ML Commons

Three reasons:

1. **Model lifecycle and GPU residency are engine concerns.** RTX 5090
   sits on the worker host; PyTorch / Sentence-Transformers on Python
   3.13 is the model runtime. OpenSearch's `text_embedding` processor
   requires a model deployed in OpenSearch, and ML Commons deployment
   loads that model into cluster-managed memory / nodes. That is a good
   fit when the search cluster owns inference, but here it would couple
   model deploys and GPU scheduling to OpenSearch itself while the
   engine already owns batching, fallback, and rerank orchestration.
   Engine-side keeps models and GPU memory under one operator.
2. **Cross-encoder is invoked on the top-30 from the cascade, not on
   every query.** Putting the cross-encoder in OpenSearch would mean
   either (a) every query pays the cross-encoder cost (untenable —
   cross-encoder is ~50× the cost of bi-encoder retrieval), or
   (b) implementing the cascade orchestration logic inside ML Commons,
   duplicating `08`. Cleaner to keep the cross-encoder on the engine
   side, called explicitly by `08`.
3. **Failover and degraded-mode story.** When the GPU is busy with
   graph build / projection, query-side encoder calls can route to a
   smaller MedCPT-distill on CPU; OpenSearch ML Commons would not
   gracefully share GPU contention with the on-demand worker.

### 6.2 Boundary contract

Engine FastAPI request flow (the `08` orchestration is the consumer):

1. `08` receives `query_text`.
2. Engine encodes `query_text` → 768d float vector via the
   MedCPT-Query-Encoder. The locked baseline is the official MedCPT
   asymmetric retrieval split: query encoder for queries, article
   encoder for indexed documents. Any symmetric-query experiment is a
   benchmark branch, not the default runtime contract.
   The vector is L2-normalized in the engine before write/query so
   `space_type=innerproduct` matches cosine.
3. Engine POSTs the §5.3 / §5.4 hybrid query to OpenSearch with the
   vector embedded inline.
4. OpenSearch runs hybrid retrieve + RRF fusion → returns top-200
   paper hits or top-100 evidence hits.
5. `08` cross-encodes the top-30 (typical) on the GPU; reorders the
   candidate set; promotes parents; issues the bounded
   `paper_evidence_units` round-trip via FDW for grounding.

Current SoleMD.Graph posture keeps query encoding and reranking in the
engine. Every ML-Commons-shaped feature (text-embedding ingest
pipeline, model-id references, `neural_query`) is **explicitly absent**
from `paper_index` and `evidence_index` on day one, even though
OpenSearch can support model-hosted flows. **locked**.

Primary source (model card + GitHub):
- <https://github.com/ncbi/MedCPT> — encoder + cross-encoder cards.
- <https://huggingface.co/ncbi/MedCPT-Query-Encoder>
- <https://huggingface.co/ncbi/MedCPT-Article-Encoder>
- <https://huggingface.co/ncbi/MedCPT-Cross-Encoder>

### 6.3 Vector field on ingest

Index docs carry the dense vector inline as a JSON array of 768 floats.
Engine indexer (§7.2) emits the vector into the `dense_vector` field on
the bulk request payload; OpenSearch persists it into the Faiss segment
under the per-index template's `sq_fp16` encoder.

The same field is **not** in `_source` (§3.2 / §3.3 `_source.excludes`)
because we never need it on the read path — at query time the inline
query vector + Faiss graph are sufficient, and skipping the field from
`_source` saves disk + network on every read.

## §7 Bulk indexing pipeline

Two parallel Dramatiq actors per `06 §6.3`,
`engine/app/workers/opensearch.py`:

- **`opensearch.build_paper_index`** — slow path. Builds the full
  ~14 M paper-level index (warm + hot). Wall-clock: ~2–4 h. Triggered
  on full serving cutover or when the warm-tier set changes (rare).
- **`opensearch.build_evidence_index`** — fast path. Builds the
  hot-tier-only ~100 K-evidence-unit index. Wall-clock: ~5–15 min. Triggered
  on hot-cohort change or on demand.

Both actors read from serve via the `serve_read` pool and warehouse
via the `warehouse_read` pool; both write to OpenSearch over HTTP.
Independent cadence is the win — hot-cohort tweaks don't pay the
14 M-doc rebuild cost.

### 7.1 Trigger

The actor is enqueued by the projection cohort orchestrator (`04`) when
the cohort manifest names `opensearch_paper_index` or
`opensearch_evidence_index` as a family. Per `04 §5.1`, the cohort
manifest's `families` list grows two new opaque entries:

```python
# delta to engine/app/projection/cohort.py — extends 04 §5.1
FamilyCode = Literal[
    "paper_api_cards", "paper_api_profiles", "graph_cluster_api_cards",
    "graph_points", "graph_clusters", "paper_semantic_neighbors", "graph_run_metrics",
    # OpenSearch-plane families:
    "opensearch_paper_index",
    "opensearch_evidence_index",
]
```

The OpenSearch families have build dependencies on
`paper_api_cards` / `paper_api_profiles` (so projection state is in
place before any `_id` / metadata field is built into the OpenSearch
doc) and on `paper_semantic_neighbors` (so `paper_index` can carry
denormalized `concept_ids_top` from the same cohort). Build order:

| Family                       | Build order | Depends on |
|------------------------------|------------:|-----------|
| `opensearch_paper_index`     |          70 | `paper_api_cards`, `paper_api_profiles`, `paper_semantic_neighbors` |
| `opensearch_evidence_index`  |          80 | `opensearch_paper_index` |

Build order > 60 keeps OpenSearch families after the `04 §5.2`
default PG projections complete. **locked**.

### 7.2 Source data

Per-source decision (FDW vs projection): **read from serve via the
projection-built tables**, not via FDW into warehouse. The FDW
boundary (`03 §3`) is reserved for runtime grounding round-trip, not
for bulk index reads. The actor reads:

- **For `paper_index`**: `solemd.paper_api_cards` (live) for IDs and
  list-shaped fields; `solemd.paper_api_profiles` (live) for the
  full text + abstract; `solemd.paper_top_concepts` (warehouse, via
  `warehouse_read` pool — bounded analytical read, justified because
  the cohort already gates the read window) for `concept_ids_top`.
  Dense vectors come from the MedCPT paper-lane path in §7.6:
  PMID-aligned published bootstrap embeddings where available, then
  local MedCPT-Article-Encoder batches for the remainder. Graph
  embeddings in `solemd.paper_embeddings_graph` stay graph-only.
- **For `evidence_index`**: `solemd.paper_evidence_units` (warehouse,
  via `warehouse_read` — read-only bulk traversal during the cohort
  window) for evidence-unit identity + offsets; chunk text by joining
  `paper_blocks` / `paper_sentences` (warehouse, via `warehouse_read`)
  on the member sentence spans; vectors by per-evidence-unit MedCPT
  Article-Encoder encoding (engine-side; §7.6).

This split honors `00 §4`: FDW is **only** for runtime grounding
dereference. The cohort-window read of warehouse tables happens through
direct asyncpg connections, not through the FDW boundary. Justified
because the warehouse is up during the projection cohort anyway.
**locked**.

### 7.3 Bulk-load loop

```python
# engine/app/workers/opensearch.py — sketch, follows 06 §6.4 actor pattern
import dramatiq
from app.workers._boot import get_pool
from app.opensearch.client import os_client
from app.opensearch.indexer import (
    create_release_index, bulk_load_paper_index, bulk_load_evidence_index,
    finalize_index_for_serving,
)


@dramatiq.actor(
    queue_name="opensearch",
    max_retries=2, min_backoff=10_000, max_backoff=600_000,
    time_limit=6 * 60 * 60 * 1000,   # 6 h ceiling — paper_index slow path
)
async def build_paper_index_actor(serving_run_id: str) -> None:
    """Slow path: ~14 M paper-level docs (warm + hot)."""
    await _build_index(
        serving_run_id, family="opensearch_paper_index",
        bulk_loader=bulk_load_paper_index,
    )


@dramatiq.actor(
    queue_name="opensearch",
    max_retries=2, min_backoff=10_000, max_backoff=600_000,
    time_limit=30 * 60 * 1000,       # 30 min ceiling — evidence_index fast path
)
async def build_evidence_index_actor(serving_run_id: str) -> None:
    """Fast path: ~100 K hot-tier evidence-unit docs."""
    await _build_index(
        serving_run_id, family="opensearch_evidence_index",
        bulk_loader=bulk_load_evidence_index,
    )


async def _build_index(serving_run_id, family, bulk_loader):
    serve_read   = get_pool("serve_read")
    warehouse_rd = get_pool("warehouse_read")
    client       = os_client()
    run_token    = serving_run_id.replace("-", "")
    index_name   = f"{family.removeprefix('opensearch_')}_{run_token}"

    # 1. Create release-scoped index from the matching index template
    await create_release_index(client, index_name, family)

    # 2. Set bulk-load index settings: refresh_interval=-1, replicas=0
    await client.indices.put_settings(
        index=index_name,
        body={"index": {"refresh_interval": "-1", "number_of_replicas": 0}},
    )

    # 3. Stream docs from serve (+ warehouse where needed) → _bulk
    await bulk_loader(client, index_name, serve_read, warehouse_rd, serving_run_id)

    # 4. Force-merge to a small segment count + restore live settings + warmup
    await finalize_index_for_serving(client, index_name)

    # 5. Insert serving_artifacts row (kind=opensearch_index)
    await _insert_opensearch_serving_artifact(serve_read, serving_run_id, index_name)

    # NOTE: alias swap is NOT in this actor — the cohort orchestrator (§8)
    # runs it once both OpenSearch indexes report ready (or just one, when
    # only one tier rebuilt this cycle), paired with the PG-side pointer
    # flip per 04 §3.5.
```

Inside `bulk_load_*`, each batch is a single `_bulk` HTTP POST of
1 000–5 000 actions (`research-distilled §6`):

```python
# engine/app/opensearch/indexer.py — sketch
async def bulk_load_paper_index(client, index_name, serve_read, warehouse_rd, serving_run_id):
    BATCH = 2_000
    async with serve_read.acquire() as serve, warehouse_rd.acquire() as wh:
        # MedCPT-Article-Encoder is loaded once at process start and lives in
        # the engine's GPU process (06 §6.3 rag.py worker). The opensearch
        # worker process calls a thin engine-side encode RPC for batched
        # encoding — see §7.6.
        async for batch in _stream_paper_docs(serve, wh, serving_run_id, batch_size=BATCH):
            actions = []
            for doc in batch:
                actions.append({"index": {"_index": index_name, "_id": str(doc["corpus_id"])}})
                actions.append(doc)
            resp = await client.bulk(operations=actions, refresh=False)
            _assert_no_bulk_errors(resp)
```

Per-batch idempotency: `_id` is `str(corpus_id)` for `paper_index`;
`_id` is `str(evidence_key)` for `evidence_index`. A re-run of the
actor with the same `serving_run_id` upserts deterministically because
the `_id` is content-bound (`evidence_key` UUIDv5) or sequence-bound
(`corpus_id` BIGINT identity). **locked**.

Primary source for the bulk pattern:
<https://docs.opensearch.org/latest/api-reference/document-apis/bulk/>;
research-distilled §6 cites the OpenSearch bulk-load best practice.

### 7.4 Force-merge + restore live settings + warmup

```python
async def finalize_index_for_serving(client, index_name: str):
    # 1. Force-merge to a small segment count (1 segment max for query speed)
    #    Single call; blocks until done — wrap in asyncio shield + tight
    #    Dramatiq time_limit on the parent actor (§7.3).
    await client.indices.forcemerge(index=index_name, max_num_segments=1, wait_for_completion=True)

    # 2. Restore live settings: refresh, then replica count (still 0 today on single-node).
    await client.indices.put_settings(
        index=index_name,
        body={"index": {"refresh_interval": "1s", "number_of_replicas": 0}},
    )
    await client.indices.refresh(index=index_name)

    # 3. Warm the k-NN graph mmap so first query doesn't pay a cold-cache hit.
    #    OpenSearch k-NN warmup endpoint loads native segment graphs into memory.
    await client.transport.perform_request(
        "GET", f"/_plugins/_knn/warmup/{index_name}",
    )
```

Force-merge is irreversible from a segment-count perspective — once
collapsed to 1 segment, future writes (which we don't do; index is
immutable post-build) would create a giant new segment that's hard to
merge. Acceptable here because the index is build-once-then-read-only.
**locked**.

`_warmup` is the canonical k-NN plugin endpoint to load Faiss graphs
into the OS file cache before the alias swap exposes the index to
queries
(<https://docs.opensearch.org/latest/vector-search/api/knn/#warmup>).
**locked**.

### 7.5 Failure and idempotency

Failure modes:

- **Mid-bulk crash.** Index exists, partially populated. Recovery:
  drop the half-built index (`DELETE /<index_name>`); re-enqueue the
  actor with the same `serving_run_id`. Idempotency on `_id` makes a
  second pass safe even if the first wrote some docs.
- **Force-merge crash.** Index exists, segments un-merged. Recovery:
  re-run `finalize_index_for_serving` directly — force-merge is
  idempotent on `max_num_segments`.
- **Warmup crash.** Cosmetic; the alias swap can proceed without it
  at the cost of cold-cache p99 on the first ~100 queries.

Cohort-level: a half-built OpenSearch index never becomes the
`*_live` alias target; failure inside the actor leaves the
serving_run in `building` (per `04 §5.3`); the cohort marks itself
`failed`; PG side stays untouched.

### 7.6 Encoder-side coordination and bootstrap

The dense vectors for both indexes are generated **at index time**
on the engine side, with one bootstrap exception for the paper lane:
published PMID-aligned MedCPT paper embeddings may be reused where
available. They are never pulled from `paper_embeddings_graph`. Why the
two encoder families stay separate:

- `paper_embeddings_graph` (`02 §4.6`) is **SPECTER2** — owned by the
  graph build, not by retrieval.
- `paper_index.dense_vector` and `evidence_index.dense_vector` are
  **MedCPT-Article-Encoder** vectors — one document-representation
  family across both retrieval lanes, preserving query/article
  asymmetry with the MedCPT-Query-Encoder on the request side.

So at OpenSearch index-build time, the indexer worker:

1. Reuses the published PMID-aligned MedCPT paper embeddings for the
   paper lane where a canonical PMID match exists.
2. Locally encodes the remaining paper docs through the engine's
   MedCPT-Article-Encoder, using the canonical paper text composition
   (`title + abstract`, plus optional approved support fields).
3. Locally encodes every evidence-unit doc through the same
   MedCPT-Article-Encoder, using the canonical evidence-unit text
   surface.

Batching, GPU residency, and backpressure are the engine's problem; the
indexer treats the encode call as a synchronous RPC.

Implication for §02: `paper_embeddings_graph` stays the SPECTER2 graph
embedding store, untouched. The MedCPT vectors are **not** persisted to
PG — they live only inside the OpenSearch Faiss segment. Reproducibility
comes from the release-scoped artifact archive
(`/mnt/solemd-graph/archives/serving-packages/<serving_run_id>/`,
`01 §4`) where the indexer writes a parquet snapshot of `(doc_id,
dense_vector)` after a successful build. **locked** for the two-encoder
split; **provisional** for the parquet snapshot codec choice (`zstd`
default per `04 §7.2`).

> **Reviewer flag**: this commits to a two-encoder warehouse posture —
> SPECTER2 in `paper_embeddings_graph` for graph build, MedCPT for
> retrieval (live only in OpenSearch, snapshot to archive). Confirm
> this is acceptable — the alternative is to add a PG table
> `paper_embeddings_retrieval` (explicitly omitted in `02 §4.6`),
> which would duplicate ~21 GB of fp16 vectors that already sit in
> the OpenSearch Faiss segment.

## §8 Alias-swap cutover

Atomic alias rotation for `paper_index_live` and `evidence_index_live`,
paired with the PG-side `04 §3.5` swap transaction.

### 8.1 Pre-flight

Before the alias swap, the cohort orchestrator confirms:

1. **`cluster.health` is `green`.** Single-node so this is a one-call
   check; multi-node will need replica health reasoning later.
2. **Doc-count delta within tolerance.** `GET <index>/_count` against
   the new index, compared to the manifest's `expected_row_count`;
   default tolerance ±5 % (mirrors `04 §11` cohort drift threshold).
3. **k-NN warmup completed.** The `_warmup` endpoint (§7.4) returned
   200; otherwise the alias swap proceeds with a logged structured
   warning, since cold cache is recoverable.
4. **Mapping checksum recorded.** SHA-256 of the canonical mapping
   JSON is in the corresponding `serving_artifacts` row (`opensearch_index`
   kind), so a future drift detection has the baseline.

### 8.2 Atomic swap

Single `_aliases` POST with add+remove pair. When both tiers rebuilt
this cycle, all four actions land in one POST; when only the hot
tier rebuilt (chunk-cohort change without warm-tier touch), only the
`evidence_index_live` actions appear and `paper_index_live` stays
pointed at the prior index. Either way, the atomicity property holds
for the indexes being swapped:

```http
POST /_aliases
{
  "actions": [
    {
      "add": {
        "index": "paper_index_<new_run_token>",
        "alias": "paper_index_live"
      }
    },
    {
      "remove": {
        "index": "paper_index_<prev_run_token>",
        "alias": "paper_index_live"
      }
    },
    {
      "add": {
        "index": "evidence_index_<new_run_token>",
        "alias": "evidence_index_live"
      }
    },
    {
      "remove": {
        "index": "evidence_index_<prev_run_token>",
        "alias": "evidence_index_live"
      }
    }
  ]
}
```

The `_aliases` API is atomic at the cluster-state level — a single
cluster-state update applies all four actions in one transaction (per
<https://docs.opensearch.org/latest/im-plugin/index-alias/>). Partial
swap state inside OpenSearch is impossible by construction. **locked**.

The `add` for `paper_index_<new>` and the `remove` for
`paper_index_<prev>` are paired so a reader of `paper_index_live`
between the two actions never sees an unbound alias — the remove can't
take effect mid-update because cluster-state changes are applied
atomically. (This is a common alias-swap mistake elsewhere — listing
add then remove in two separate API calls; the OpenSearch docs
specifically call out the single-call form.)

### 8.3 PG ↔ OpenSearch ordering

Default contract: **PG flips first; OpenSearch alias swap follows
within seconds.** Both swaps live inside the same Dramatiq
"cohort orchestrator" actor; the actor:

1. Runs the §04 §3.5 PG swap transaction (admin pool, multi-statement
   transaction, atomic).
2. Immediately follows with the §8.2 `_aliases` POST.

OpenSearch guarantees atomicity only for the `_aliases` call itself.
The PG-first / alias-second ordering is a SoleMD.Graph application-level
cutover policy with a bounded inconsistency window, not a vendor-backed
cross-system transaction.

The "few seconds" gap between PG swap commit and OpenSearch alias
swap is acceptable because:

- Engine FastAPI reads `active_runtime_pointer` per request (cached
  ≤ 1 s, `06 §11.4`); for that ≤ 1 s window post-PG-flip, the
  request path may still see the prior `serving_run_id`. The
  OpenSearch read uses the alias `*_live`, so it sees prior or new
  consistently.
- During the seconds-long window where PG is on `<new>` and
  OpenSearch is still on `<prev>`, the worst case is that an
  evidence-key from a chunk hit doesn't resolve in PG's
  `paper_evidence_units` (because PG is on the new chunk_version_key
  and OpenSearch returned an evidence_key from the old). The §3.4
  `WAREHOUSE_OFFLINE` degraded shape is the recovery — engine logs
  structured event `cohort_alias_swap_lag`, returns the projection-only
  card, client retries on next request when consistency catches up.

**locked** for split cutover; the open-item-from-`04` "should the swap
transaction also flip OpenSearch aliases" is closed here as **no** — a
true cross-system Saga (PG + OpenSearch in one transaction) is not
worth the operational complexity, and the seconds-long degraded window
is bounded.

### 8.4 Saga risk closure — `serving_runs.opensearch_alias_swap_status`

Adds three columns to `serving_runs` (schema delta lands in
`db/schema/serve/*.sql` plus `db/migrations/serve/*.sql`):

```sql
ALTER TABLE solemd.serving_runs
  ADD COLUMN opensearch_alias_swap_status smallint NOT NULL DEFAULT 0,
  ADD COLUMN opensearch_alias_swap_attempted_at timestamptz,
  ADD COLUMN opensearch_alias_swap_error text;

COMMENT ON COLUMN solemd.serving_runs.opensearch_alias_swap_status IS
  '0=pending, 1=swapped, 2=failed. Tracks the OpenSearch alias swap separately from the PG cohort swap so retry and runbook decisions are durable. See 07 §8.4.';
COMMENT ON COLUMN solemd.serving_runs.opensearch_alias_swap_attempted_at IS
  'Wall-clock of the most recent alias-swap attempt for this run. Drives 07 §11 retry logic.';
COMMENT ON COLUMN solemd.serving_runs.opensearch_alias_swap_error IS
  'Last OpenSearch alias-swap error (HTTP status + body, truncated to 4 KB) when opensearch_alias_swap_status=2.';
```

Operator runbook for `opensearch_alias_swap_status = 2` (failed
after PG flip):

1. Inspect `opensearch_alias_swap_error` for the OpenSearch
   error class (cluster red, mapping conflict, permission, network).
2. **Never roll back PG.** PG is already on `<new>`. Rolling back
   PG without rolling back OpenSearch leaves the same Saga gap in
   the other direction.
3. Resolve the OpenSearch issue, re-run the alias-swap step alone
   via `python -m engine.app.opensearch swap-aliases --serving-run
   <id>`; on success, the worker UPDATEs
   `opensearch_alias_swap_status = 1`.

**locked** for the contract. The single-column shape may split into
per-index columns if observability queries grow muddled
(`opensearch_paper_alias_swap_status` /
`opensearch_evidence_alias_swap_status`); flagged in §13 provisional.

### 8.5 Post-cutover retention

Previous-run indexes are retained for 24 h then dropped, mirroring
`04 §3.6` `_prev` retention. A `pg_cron` job on serve enqueues a
Dramatiq `opensearch.drop_stale_index` actor:

```sql
-- staggered against the 04 §6.5 jobs
SELECT cron.schedule('opensearch-drop-stale-indexes', '23 4 * * *',
  $$SELECT solemd.enqueue_opensearch_drop_stale()$$);
```

The actor reads `serving_artifacts` rows of kind `opensearch_index`
older than 24 h whose `serving_run_id` is **not** the active runtime
pointer's `serving_run_id`, and issues `DELETE /<index_name>` against
each. Operator rollback inside 24 h is possible by re-running the
§8.2 swap with the prior index names. **locked** for the contract;
**provisional** for the 24 h window.

## §9 Evidence-key round-trip

Every evidence-unit doc in `evidence_index` carries `evidence_key` (UUIDv5
derived from `(corpus_id, evidence_kind, section_ordinal,
block_ordinal, sentence_start_ordinal, sentence_end_ordinal,
chunk_version_key)` per `02 §2`). Engine code dereferences
`evidence_key` → PG via the FDW `warehouse_grounding.paper_evidence_units`
(`03 §3`).

This contract makes "OpenSearch returns evidence hits" safe:

- No chunk text drift is possible. The serving doc holds the chunk
  text as `chunk_text` (for snippet / highlight rendering) and the
  `evidence_key` (for the round-trip). PG holds canonical chunk
  identity. The two converge because `evidence_key` is content-bound:
  the same `(corpus_id, kind, …, chunk_version_key)` always derives the
  same `evidence_key`.
- The serving doc is allowed to lag PG by one cohort, because
  `evidence_key` is stable across cohorts. A chunk identified at cohort
  N+1's ingest time keeps the same `evidence_key` it had at cohort N,
  so an OpenSearch hit from `<prev>` resolves cleanly in PG's `<new>`
  — the key didn't change.
- The reverse — an `evidence_key` exists in OpenSearch but not in
  PG — happens only during the seconds-long swap-lag window (§8.3),
  and triggers the §3.4 degraded shape.

`08` consumes this contract. The full cycle:

```
OpenSearch evidence_index hit
  → engine FastAPI extracts {evidence_key, corpus_id, …}
  → cross-encoder rerank top-30 (engine-side)
  → bounded PG dereference: SELECT * FROM warehouse_grounding.paper_evidence_units
     WHERE evidence_key = ANY($1::uuid[])  (≤ 256 ids per 03 §3.3)
  → SELECT text FROM warehouse_grounding.paper_sentences
     WHERE corpus_id = $1 AND sentence_ordinal BETWEEN $2 AND $3
  → packet assembly + citation rendering
```

`08` owns the orchestration; this doc owns the contract that makes it
safe. **locked**.

## §10 Snapshot / backup (delegate detail to `11`)

Single S3-compatible local snapshot repository at
`/mnt/solemd-graph/opensearch-snapshots/`, registered with
OpenSearch's snapshot-restore plugin via `repository-fs`. Daily
snapshot of both live indexes plus a JSON dump of `serving_artifacts`
rows of kind `opensearch_index` (so a restore can identify which
indexes belong to which serving runs).

```http
PUT /_snapshot/solemd_graph_local
{
  "type": "fs",
  "settings": {
    "location": "/mnt/solemd-graph/opensearch-snapshots",
    "compress": true,
    "max_snapshot_bytes_per_sec": "200mb",
    "max_restore_bytes_per_sec":  "200mb"
  }
}
```

A `pg_cron`-triggered Dramatiq actor `opensearch.snapshot_daily`
issues `PUT /_snapshot/solemd_graph_local/<snapshot_name>` daily;
naming uses the same full hyphenless `serving_run_id` token as the
release-scoped index names for traceability and uniqueness.

Snapshot retention, off-box mirror cadence, and restore drill live in
`11-backup.md`. Off-box snapshot mirror is **deferred** per `00 §6 —
Off-box backup mirror (Backblaze B2)`. **locked** for the repo path
and contract; **deferred** for the off-box mirror.

Primary source: <https://docs.opensearch.org/latest/tuning-your-cluster/availability-and-recovery/snapshots/snapshot-restore/>.

## §11 Operational cadence

### 11.1 Cohort-driven build

Standard path: `pg_cron` on serve (`04 §11.1`) detects an
`ingest_runs.status='published'` flip on warehouse, enqueues a
projection cohort, the cohort manifest names
`opensearch_paper_index` and/or `opensearch_evidence_index` as families
(may name both, may name only the hot lane), the `04 §3` flow runs PG
projections first, then the §7 actors build the named OpenSearch
indexes (in parallel where dependencies allow), then the §8 swap
(paired with the PG-side single-row pointer flip).

Wall-clock for the OpenSearch portion:

- **Full both-tier rebuild**: ~2–4 h for `paper_index` (encode +
  bulk + force-merge + warmup at ~14 M docs); ~5–15 min for
  `evidence_index` (~100 K docs). Both actors run in parallel where
  encoder GPU contention permits.
- **Hot-tier-only refresh**: ~5–15 min total (skip the slow path).
  This is the everyday cadence for hot-cohort tweaks; warm-tier
  rebuilds are rare (mapping change or full ingest cycle).

**provisional** until measured.

### 11.2 Hot-fix re-index

Operator path:

```bash
python -m engine.app.opensearch hot_fix \
  --serving-run <id> \
  --index paper_index
```

The CLI:

1. Validates `serving_run` is in `published` status.
2. Builds a new `paper_index_<run_token>_hotfix` index using the same
   §7 flow against the live cohort source data (no new
   `serving_run_id` is minted).
3. Runs the §8 alias swap for `paper_index_live` only.
4. UPDATEs the existing `serving_artifacts` row to point at the new
   index name (or inserts a new artifact row keyed by an action
   counter — preserves the audit trail).

Used for: mapping fixes, synonym updates that needed a re-index
rather than an `_reload_search_analyzers` call, encoder revision bumps.
**locked**.

### 11.3 Synonym hot reload

When the synonym artifact (`04 §6 — synonym_bundle`) changes but the
mapping doesn't, no re-index is needed:

```http
POST /paper_index_live/_reload_search_analyzers
POST /evidence_index_live/_reload_search_analyzers
```

OpenSearch reloads the `synonyms_path` file in place. The synonym file
on disk is replaced atomically by the projection actor that produces
the bundle. **locked**.

Primary source:
<https://docs.opensearch.org/latest/api-reference/index-apis/refresh/>.

### 11.4 Kill-switches

Per the kill-switch pattern in `04 §11.4` / `05 §11.3`:

1. **Per-family freeze**: `app.opensearch_disabled_families =
   'opensearch_paper_index'` (PG GUC). The cohort orchestrator skips
   listed OpenSearch families; PG projections still run; alias swap
   uses prior OpenSearch indexes.
2. **Whole-OpenSearch halt**: `app.opensearch_enabled = false`. No
   OpenSearch-side build runs; reads continue against existing
   indexes.

Both kill switches are non-destructive — live serving continues against
the prior OpenSearch indexes, only future builds are blocked.
**locked**.

## §12 Failure & recovery

### 12.1 Mid-bulk crash

UNLOGGED-equivalent state: `<index_name>` exists but is partially
populated. Recovery: drop the index (`DELETE /<index_name>`); re-enqueue
the §7 actor with the same `serving_run_id`. Idempotency on `_id`
makes re-runs deterministic.

If the actor died during force-merge (post-bulk, pre-alias-swap), the
recovery is to call `finalize_index_for_serving` directly — force-merge
is idempotent on `max_num_segments`. **locked**.

### 12.2 Alias-swap failure mid-rotation

**Impossible by construction.** The §8.2 `_aliases` POST is a single
HTTP call that produces a single OpenSearch cluster-state update.
Cluster-state updates are atomic — either the whole add-remove-add-remove
batch applies, or none does. There is no intermediate state where
`paper_index_live` is unbound or bound to two indexes.

The **outer** failure mode is "PG swap committed, OpenSearch
`_aliases` POST returned non-200." Handled per §8.4: column status
flip to 2 (failed), runbook is "retry alias swap; never roll back PG."
**locked**.

### 12.3 Cluster red

Cluster-state corruption or data-volume failure. Single-node has no
replicas, so the only recovery path is snapshot-restore (§10):

```http
POST /_snapshot/solemd_graph_local/<snapshot_name>/_restore
{
  "indices": "paper_index_*,evidence_index_*",
  "include_global_state": false,
  "rename_pattern":      "(.+)",
  "rename_replacement":  "$1_restored"
}
```

The restore creates `<index>_restored` indexes; operator runs the
§8.2 swap with the restored names against `*_live` aliases. PG side
does not move. Cluster-red recovery wall-clock: ~30–60 min for
`paper_index`; ~3–6 h for `evidence_index` (NVMe-bound on the
snapshot read). **locked** for the recovery contract; concrete RTO
in `11-backup.md`.

### 12.4 Single-node power-loss

OpenSearch's translog (write-ahead log) replays on restart. Live
indexes recover to last-checkpoint state without operator action.
Verify with `GET /_cluster/health` post-restart — `status: green` is
the success signal. **locked**.

If the translog itself is corrupt (rare), the recovery falls back to
§12.3 snapshot-restore.

## §13 Observability hooks (delegate detail to `10`)

`10-observability.md` owns dashboards. This doc emits the
requirements `10` must surface for the OpenSearch plane.

### 13.1 Required Prometheus metrics

| Metric | Type | Labels | Purpose |
|---|---|---|---|
| `opensearch_search_latency_seconds` | histogram | `index`, `query_type` (`hybrid_paper` / `hybrid_evidence` / `bm25_only` / `knn_only`) | Per-lane search latency p50/p95/p99. |
| `opensearch_knn_search_latency_seconds` | histogram | `index` | Sub-metric for the k-NN sub-query inside hybrid; isolates Faiss traversal. |
| `opensearch_segment_count` | gauge | `index` | Should be ≤ a small constant (1 immediately post-force-merge); growth indicates re-indexing or background merges. |
| `opensearch_jvm_heap_used_bytes` | gauge | (none) | Heap pressure; alert at > 75 % of `-Xmx`. |
| `opensearch_circuit_breaker_trips_total` | counter | `breaker_name` (`knn`, `request`, `fielddata`) | k-NN circuit-breaker trips trigger §4.4 degraded path. |
| `opensearch_bulk_throughput_docs_per_second` | gauge | `index` | Live indexer throughput; sized in `09-tuning.md`. |
| `opensearch_alias_swap_total` | counter | `index_alias`, `outcome` (`success` / `failed`) | §8 audit log. |
| `opensearch_alias_swap_lag_seconds` | gauge | `index_alias` | `now() - opensearch_alias_swap_attempted_at` for `serving_runs` rows where `opensearch_alias_swap_status=0`. Should be 0 in steady state. |
| `opensearch_index_doc_count` | gauge | `index` | Doc-count drift detection vs cohort manifest. |
| `opensearch_synonym_reload_total` | counter | `index`, `outcome` | §11.3 hot-reload audit. |

### 13.2 Required structured log events

Worker logs (jsonlog format per `06 §10.3`):

- `opensearch.index.create_started` — `serving_run_id`, `index_name`, `family`.
- `opensearch.index.bulk_progress` — `index_name`, `docs_indexed`, `bytes_indexed`.
- `opensearch.index.bulk_complete` — `index_name`, `total_docs`, `duration_seconds`.
- `opensearch.index.force_merge_complete` — `index_name`, `final_segment_count`, `duration_seconds`.
- `opensearch.index.warmup_complete` — `index_name`, `duration_seconds`.
- `opensearch.alias.swap_attempted` — `serving_run_id`, `actions`.
- `opensearch.alias.swap_success` — `serving_run_id`, `aliases`.
- `opensearch.alias.swap_failed` — `serving_run_id`, `error`, `http_status`.
- `opensearch.snapshot.complete` — `snapshot_name`, `duration_seconds`, `bytes_written`.

`10-observability.md` routes these into Grafana panels and alert rules.

## §14 Boundary contract for `08`

The exact JSON shape of the request/response that
`08-retrieval-cascade.md` consumes. `08` orchestrates and **chooses
the lane**: `paper` for general retrieval (default; spans both tiers),
`evidence` for hot-tier deep-grounding queries that need
sentence-coordinated citations. This doc fixes the wire contract.

### 14.1 Request — paper-lane retrieve

```python
# engine/app/opensearch/queries.py — paper-lane request shape
class PaperLaneRequest(BaseModel):
    lane:          Literal["paper"] = "paper"
    query_text:    str
    query_vector:  list[float]                # 768d, L2-normalized, MedCPT-Article-Encoder output
    k:             int = 200                  # candidate count returned to 08
    ef_search:     int | None = None          # per-request override (§4.4)
    filter:        PaperFilter                # publication_year range, tier, package_tier, retracted, concept scope
    search_pipeline: str = "solemd_hybrid_rrf"

class PaperFilter(BaseModel):
    is_retracted:         bool | None = False
    publication_year_gte: int | None = None
    publication_year_lte: int | None = None
    tier_in:              list[int] = [1, 2]         # [1=warm, 2=hot]; default both
    hot_only:             bool = False                 # convenience: equivalent to tier_in=[2]
    package_tier_in:      list[int] | None = None    # legacy product-tier flag (orthogonal to warm/hot)
    concept_ids_any:      list[int] | None = None    # OR semantics over concept_ids_top
```

Engine helper translates `hot_only=True` → `tier_in=[2]` before
materializing the §5.3 hybrid query JSON. Filters duplicate across both
sub-queries (§5.3 note).

### 14.2 Response — paper-lane

```python
class PaperHit(BaseModel):
    corpus_id:               int
    rrf_score:               float
    bm25_subscore:           float | None       # if engine asked for explain
    knn_subscore:            float | None
    package_tier:            int
    publication_year:        int | None
    evidence_priority_score: float | None

class PaperLaneResponse(BaseModel):
    hits:           list[PaperHit]              # length ≤ k
    total_hits:     int                         # OpenSearch total.value, capped at 10000 (max_result_window)
    took_ms:        int
    timed_out:      bool
    serving_run_id: str                         # echoed from doc; engine-side consistency check
```

### 14.3 Request — evidence-lane retrieve

The evidence lane targets `evidence_index_live` (hot-tier-only by
construction, §3.5). `08` picks this lane explicitly when the query
needs sentence-coordinated grounding into the hot cohort.

```python
class EvidenceLaneRequest(BaseModel):
    lane:          Literal["evidence"] = "evidence"
    query_text:    str
    query_vector:  list[float]                  # 768d, L2-normalized, MedCPT-Query-Encoder output
    k:             int = 100                    # candidate count for cross-encoder rerank top-30
    ef_search:     int | None = None
    filter:        EvidenceFilter
    search_pipeline: str = "solemd_hybrid_rrf"

class EvidenceFilter(BaseModel):
    is_retracted:        bool | None = False
    publication_year_gte: int | None = None
    package_tier_in:      list[int] | None = None
    concept_ids_any:      list[int] | None = None     # multi-valued field on evidence-unit doc
    corpus_ids_in:        list[int] | None = None     # parent-restrict, e.g. for "rerank in this paper set"
    # No tier filter: evidence_index is hot-only by construction.
```

### 14.4 Response — evidence-lane

```python
class EvidenceHit(BaseModel):
    evidence_key:            UUID                # _id
    corpus_id:               int
    rrf_score:               float
    bm25_subscore:           float | None
    knn_subscore:            float | None
    section_role:            int
    block_ordinal:           int
    sentence_start_ordinal:  int
    sentence_end_ordinal:    int
    evidence_priority_score: float | None

class EvidenceLaneResponse(BaseModel):
    hits:           list[EvidenceHit]
    total_hits:     int
    took_ms:        int
    timed_out:      bool
    serving_run_id: str
```

### 14.5 Error shape

OpenSearch errors surface to `08` as engine-side exceptions with
structured `error_class`:

| OpenSearch error | engine `error_class` | `08` recovery |
|---|---|---|
| Connection refused / timeout | `OPENSEARCH_OFFLINE` | Skip OpenSearch; serve PG-cards only with `retrieval_unavailable: true` flag in response. |
| Cluster red | `OPENSEARCH_RED` | Same as above + alert. |
| `circuit_breaking_exception` (k-NN) | `OPENSEARCH_KNN_BREAKER_TRIPPED` | Retry without `knn` sub-query (§4.4 degraded — BM25-only). Log + Prometheus counter. |
| `query_shard_exception` | `OPENSEARCH_BAD_QUERY` | Engine-side bug; log + 500. |
| `index_not_found_exception` on `*_live` alias | `OPENSEARCH_ALIAS_MISSING` | This is the §8.4 Saga gap; emit `cohort_alias_swap_lag` event; degraded shape per `03 §3.4`. |

**locked** for the boundary contract.

## Cross-cutting invariants

Beyond `06 §`-level invariants:

1. **One index template per family.** Mapping authoritative in this
   doc; component template lifecycle managed by Dramatiq actor at
   process start (idempotent `PUT _index_template`).
2. **No model in OpenSearch.** ML Commons not used; `neural_query`
   not used; text-embedding ingest pipeline not configured. Engine-side
   only. (§6)
3. **`_id` is content-bound.** `corpus_id` for paper docs;
   `evidence_key` for evidence docs. Re-indexing the same logical doc
   with a different `_id` would create a duplicate; structurally
   impossible if the indexer code uses the §1 boundary types
   correctly. CI lint scans `engine/app/opensearch/indexer.py` for
   any `_id` derivation that doesn't go through the
   `to_doc_id(corpus_id|evidence_key)` helper.
4. **Aliases are the only thing readers know.** Engine FastAPI
   `engine/app/opensearch/queries.py` is forbidden from referencing
   any `paper_index_<short>` directly; only `paper_index_live` /
   `evidence_index_live`. Lint rule.
5. **One alias swap per cohort.** Multiple `_aliases` POSTs across the
   build run is a bug — the `04 §3.5` PG swap and the §8.2 OpenSearch
   swap are paired, never independent.
6. **Mapping checksum is recorded on every build.** Drift detection
   compares `serving_artifacts.artifact_checksum` against the
   recomputed canonical mapping JSON for the index.
7. **Force-merge is irreversible per index.** Build-once-then-read-only
   contract; live-index writes are not supported.
8. **Synonym artifact and analyzer config are decoupled from
   re-indexing.** Hot reload (§11.3) is the path; full re-index is
   only for mapping changes.

## Write patterns (indexer)

The Dramatiq `opensearch.build_index` actor is the only writer of
OpenSearch indexes. Per process:

- Reads from `serve_read` and `warehouse_read` pools (`06 §6.3`,
  `06 §2.3`).
- Calls engine MedCPT encoders for dense vector generation per doc.
- Writes to OpenSearch via the OpenSearch Python client over HTTP;
  one client per worker process.
- Writes to PG: `serving_artifacts` rows of kind `opensearch_index`
  via the `serve_read` pool (UPDATE-shaped — not the `admin` pool,
  because no DDL is involved).

Auxiliary actors:

- `opensearch.swap_aliases` — only the §8.2 alias-swap step, used
  for §8.4 retry and §11.1 cohort orchestration. Reads + UPDATEs
  `serving_runs.opensearch_alias_swap_status`.
- `opensearch.drop_stale_index` — §8.5 retention; reads
  `serving_artifacts` of kind `opensearch_index`, issues
  `DELETE /<index>`.
- `opensearch.snapshot_daily` — §10 snapshot.

Engine FastAPI **never writes** OpenSearch — read-only on the request
path.

## Read patterns (engine FastAPI search request)

Per `08`, the canonical request flow:

1. Engine FastAPI receives a search request.
2. Engine calls MedCPT-Query-Encoder on the GPU process; receives 768d
   vector.
3. Engine constructs the §14 request payload via the boundary
   helpers (`engine/app/opensearch/queries.py`).
4. Engine POSTs to `paper_index_live` or `evidence_index_live` with
   the `solemd_hybrid_rrf` search pipeline. OpenSearch returns
   the §14 response.
5. Engine cross-encodes the top-30 (engine-side, GPU).
6. Engine performs parent-child promotion + bounded
   `paper_evidence_units` FDW round-trip per `08`.
7. Engine assembles the response packet.

Per-request pool acquires:

- **OpenSearch HTTP**: connection-pooled in
  `engine/app/opensearch/client.py`; budget per `09-tuning.md`.
- **`serve_read` pool**: one acquire for active-pointer lookup (cached
  ≤ 1 s, `06 §11.4`); one acquire for `paper_api_cards` /
  `paper_api_profiles` enrichment.
- **`serve_read` pool, FDW path**: one acquire for the bounded
  `warehouse_grounding.paper_evidence_units` query when grounding is
  needed.

Hot-path budget (provisional, per `08` SLO):

- OpenSearch hybrid retrieve: < 50 ms p95 paper-lane, < 100 ms p95
  evidence-lane.
- Cross-encoder rerank top-30: < 80 ms p95 GPU-side.
- Total search request: < 250 ms p95 end-to-end.

`09-tuning.md` finalizes the numbers; `10-observability.md` measures
them.

## §N Decisions — locked / provisional / deferred

### Locked now

| Decision | Rationale |
|---|---|
| Two-tier serving model: warm = paper-level (~14 M), hot = evidence-unit-level (~500–10 K papers, ~100 K evidence units at ceiling) | Single workstation can hold full warm-tier paper-level vectors (~32 GB Faiss) plus a tractable evidence index (~225 MB at ceiling). Evidence indexing for the entire corpus would be ~322 GB, infeasible. |
| `paper_index` carries both tiers, distinguished by a `tier` byte field (`1=warm`, `2=hot`); `evidence_index` is hot-only | Paper-level retrieval spans both tiers by default; deep-grounding queries scope with `tier=[2]`. One paper-level lane removes a join class for `08`. |
| Hot-tier cohort sourced from `serving_members` with `cohort_kind = 'practice_hot'` (`03 §4.3`) | Single source of truth for the evidence-indexed universe; promotion/demotion flows through standard cohort cutover (`04 §5`). |
| Two parallel build actors: `opensearch.build_paper_index` (slow) + `opensearch.build_evidence_index` (fast) | Independent cadence; hot-cohort tweaks don't pay the 14 M-doc rebuild cost. |
| Two release-scoped indexes: `paper_index` (paper-level, both tiers) + `evidence_index` (evidence-unit-level, hot only) | Lane separation matches MedCPT cascade; `00 §1` and research-distilled §6 set the shape. |
| Stable aliases `paper_index_live` / `evidence_index_live` are the only names readers know | Cutover invisible to request path; one alias-swap API call per cohort. |
| Index naming: `<family>_<serving_run_id-without-hyphens>` | Full UUIDv7 token is unique, sortable, and safe. Using only the leading hex chars is wrong for UUIDv7 because the high bits are timestamp-heavy. |
| Faiss HNSW + sq_fp16 quantization on dense lanes | Official docs support the 2x memory reduction; exact recall loss remains benchmark-owned for MedCPT 768d. |
| `space_type=innerproduct` with engine-side L2-normalized MedCPT vectors | Equivalent to cosine; cheaper at query time (no per-vector normalization in OpenSearch). |
| Native `hybrid` compound query + top-level `hybrid.filter` + `score-ranker-processor` (RRF, rank_constant=60) for live lane fusion | Supported on the current OpenSearch serving line; no engine-side fusion code path needed. |
| Search pipeline selected explicitly by the engine (`solemd_hybrid_rrf` live, `solemd_hybrid_debug` benchmark/explain) | Keeps live rank-based retrieval separate from normalization-based debug analysis. |
| MedCPT encoders in engine FastAPI; OpenSearch ML Commons not used day one | Model lifecycle, GPU residency, and cross-encoder cost-shape stay engine-owned in the current posture, while ML Commons remains an optional later path (§6). |
| Two-encoder warehouse posture: SPECTER2 in `paper_embeddings_graph` for graph build, MedCPT vectors live only in OpenSearch + parquet archive | Avoids duplicating ~21 GB of fp16 vectors that already sit in Faiss. (Reviewer: confirm acceptable.) |
| Bulk-then-freeze indexer: `refresh_interval=-1`, `replicas=0` during bulk; force-merge to 1 segment; restore live; `_warmup`; alias swap | Canonical OpenSearch bulk pattern (research-distilled §6). |
| Per-batch idempotency: `_id = corpus_id` (paper), `_id = evidence_key` (chunk) | Re-runs upsert deterministically; content-bound identity. |
| `cohort_manifest.families` extends to include `opensearch_paper_index` and `opensearch_evidence_index`; depends on PG projection families | Cohort atomicity stays single-source-of-truth; no separate OpenSearch lifecycle to coordinate. |
| Atomic alias-swap: single `_aliases` POST with add+remove pair for both indexes | Cluster-state atomicity makes partial state impossible inside OpenSearch. |
| PG swap first; OpenSearch alias swap follows within seconds; no cross-system Saga transaction | Bounded degraded window during seconds-long lag is cheaper than two-phase coordination. |
| `serving_runs.opensearch_alias_swap_status` SMALLINT column tracks the OpenSearch side post-PG flip | Closes the Saga risk named in `04` open items; runbook is "retry alias swap; never roll back PG." |
| Encoder boundary: engine encodes, POSTs hybrid query with vector, gets candidates back; cross-encoder rerank engine-side on top-30 | OpenSearch returns the candidate set only — no enrichment, no joins. |
| `evidence_key` UUIDv5 round-trip via `warehouse_grounding.paper_evidence_units` FDW | Content-bound identity; no chunk text drift possible (§9). |
| Single S3-compatible local snapshot repo at `/mnt/solemd-graph/opensearch-snapshots/`; daily snapshot of both live indexes | Recovery path for cluster-red (§12.3). |
| 24 h retention of previous-run indexes after alias swap; `pg_cron`-triggered Dramatiq drop actor | Mirrors `04 §3.6` `_prev` retention. |
| `dynamic: strict` mappings; `_source` excludes `dense_vector` | Schema drift fails fast; read-side bandwidth saved. |
| `hybrid` remains top-level and is never wrapped in score-query containers | Matches current OpenSearch hybrid-query constraints; prevents undocumented scoring semantics from creeping in. |
| Synonym artifact at search-time via `synonym_graph` with `updateable: true`; hot-reload via `_reload_search_analyzers` | No re-index on synonym change (research-distilled §6). |
| `biomedical_text` analyzer with `icu_normalizer + lowercase + asciifolding + synonym_graph + porter_stem`; `*_no_synonyms` sibling field for synonym-blind exact match | Standard 2026 biomedical search pipeline. |
| Component template `solemd_graph_common` shared by both index templates | Multi-node migration is a shard-count change later. |
| `number_of_shards: 1`, `number_of_replicas: 0`, `codec: best_compression` | Single-node correct; shard count revisited at multi-node migration. |
| `knn.memory.circuit_breaker.enabled: true`, limit `55%` of heap | Bounds k-NN scratch space; trips degrade to BM25-only. |
| Heap target 31 GB regardless of host RAM upgrade; extra RAM goes to OS file cache | Compressed-oops boundary; Faiss mmap is the variable that scales with host RAM. |
| Synonym hot reload as the path for non-mapping changes | Avoids full re-index; retains alias atomicity. |

### Provisional (revisit after first sample build)

| Decision | Revisit trigger |
|---|---|
| Hot-tier ceiling = 10 000 papers; initial start = 500 papers | Operator-tunable as RAM headroom and recall-quality measurements warrant; 50 K is the practical upper bound on the 68 GB host before evidence-index memory shows up in cache contention. |
| Hot-tier mean evidence-units-per-paper = 10 | Real document-length distribution from PT3 grounding spine; range 5–30 acceptable. |
| HNSW `m=16`, `ef_construction=256`, `ef_search=100` | Recall@k benchmarking against the cascade evaluation suite. |
| RRF `rank_constant=60` | Top-1 / top-10 conversion measured on real query workload. |
| Per-index doc-count tolerance ±5 % vs cohort manifest | Real release-to-release variability over multiple cohorts. |
| `bulk` batch size 1 000–5 000 | Throughput measurement on the 68 GB host. |
| `evidence_index` k-NN p95 budget `< 100 ms` | First sample query workload at hot-tier scale (initially ~100 K docs, not the warehouse-scale evidence surface). |
| `_warmup` after every alias swap | Whether the cold-cache p99 hit is genuinely user-visible. |
| Per-request `ef_search` override budget | `08`'s per-lane decision based on rerank-candidate quality. |
| Pre-filter vs post-filter fallback threshold (0.5 % match rate) | Real query selectivity distribution. |
| Single `opensearch_alias_swap_status` column vs splitting into per-index columns | Operator-query muddiness at scale. |
| Build wall-clock estimates (~2–4 h paper full rebuild, ~5–15 min evidence-only refresh) | First sample build. |
| `merge.policy.max_merged_segment: 5gb` | Force-merge wall-clock + post-merge segment health. |
| 24 h previous-index retention window | Operator rollback frequency. |
| MedCPT-Article-Encoder vs MedCPT-Query-Encoder choice for paper-lane index-time encoding | Recall@k difference; today the Article-Encoder is the default for paper docs per the MedCPT card. |

### Deferred (trigger-gated)

| Decision | Trigger |
|---|---|
| Neural sparse (SPLADE) lane in OpenSearch | `00 §6` — MedCPT cascade is live and top-1 conversion plateaus. |
| ColBERTv2 late-interaction sidecar | `00 §6` — SPLADE fails to close the top-1 gap. |
| 1-bit scalar quantization on the dense lane | Supported on the current OpenSearch serving line, but recall loss is not trivial; revisit when quantization research catches up. |
| Multi-node OpenSearch cluster (`number_of_replicas > 0`, multiple primaries on `paper_index`) | Paper count grows >50 M, or warm tier needs sharding by year/venue; until then single-node is the comfortable shape (§4.2). |
| Year/venue-based shard split for warm tier `paper_index` | Warm-tier `paper_index` exceeds ~50 M docs, or cold-cache p99 on warm-tier queries becomes user-visible. |
| Off-box snapshot mirror (Backblaze B2) | `00 §6` — any irreplaceable data lands. |
| OpenSearch Performance Analyzer remote scrape integration | `10-observability.md` decides; today Prometheus scrape via the OpenSearch exporter is sufficient. |
| ML Commons text-embedding ingest pipeline | Hard "no" today — would require reversing §6 architectural decision. |
| `neural_query` syntax for query-side encoding | Same as above. |
| Painless / search-time scoring scripts | Not used today; would couple business logic to OpenSearch queries. Engine-side is the place. |
| Index-template versioning schema | Mapping evolution today is via release-scoped re-index + alias swap; an explicit `template_version` column on `serving_artifacts` would help once mappings drift across cohorts. |
| `cross_cluster_search` for federated retrieval | Multi-cluster topology lands. |
| Per-cohort search pipelines (e.g. different RRF rank_constants per cohort) | A/B testing infrastructure. |

## Open items

Forward-tracked; none block subsequent docs:

- **HNSW parameter triple lock-in.** §4.4 keeps `m=16, ef_construction=256,
  ef_search=100` provisional; first sample build measures recall@10
  against the benchmark suite, then locks. The locked decision is the
  engine + quantization, not the parameters.
- **Hot-tier ceiling growth path.** §3.5 starts at 500 papers, ceiling
  10 K. The 50 K practical upper bound on the 68 GB host (§4.3) is a
  back-of-envelope; revisit once measured encoder throughput +
  cache-pressure curves are in hand.
- **Hot-cohort change frequency.** Drives the cadence of
  `opensearch.build_evidence_index` runs. If hot cohort changes daily,
  the fast-path actor's ~5–15 min budget keeps it tractable; if it
  changes hourly, batch the changes within a tighter `pg_cron` window.
- **Single vs split `opensearch_alias_swap_status` column.** §8.4 keeps
  one column; revisit at observability-build time if per-index queries
  proliferate.
- **MedCPT-Article-Encoder vs MedCPT-Query-Encoder for paper-index
  encoding.** §6 default is the Article-Encoder for paper docs; if
  recall@k benchmarking shows the Query-Encoder is better on the paper
  lane (asymmetric retrieval is sometimes worse than symmetric), swap.
- **Snapshot retention window and cadence.** Daily snapshot is locked;
  retention (7 d local) is provisional and lives in `11-backup.md`.
- **Reviewer flag (§7.6)**: two-encoder warehouse posture — SPECTER2
  (graph) + MedCPT (retrieval, OpenSearch only) — confirmed
  acceptable? Alternative is restoring `paper_embeddings_retrieval` on
  warehouse PG that `02 §4.6` explicitly omits.
- **Reviewer flag (§5.5)**: sparse lane mapping shape is stubbed in
  prose; if `00 §6 SPLADE deferred` resolves before this doc lands, add
  the explicit `sparse_vector` field block to both index templates.
- **Cross-cluster search for the `auth` plane (`03 §4.4`)**: if user
  data lands and the auth surface ever needs full-text search, a
  third index might join the topology. Scoped out today.

No contradictions discovered with `00–06` or `research-distilled.md`.

The single judgement call worth flagging is the encoder-placement
boundary (§6) — locked engine-side, but a reviewer who prefers
ML Commons can reverse it; the cost is tighter coupling between model
deploys and OpenSearch upgrades, plus a more constrained cross-encoder
cost story.
