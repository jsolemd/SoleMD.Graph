# SoleMD.Graph Evidence and RAG Plan

Status: Canonical plan  
Updated: 2026-03-29  
Project: `SoleMD.Graph`  
Scope: canonical evidence substrate, engine API, frontend integration, retrieval baseline, future evidence warehouse, and future Qdrant retrieval plane  
Supersedes: duplicate implementation-spec draft now archived at `docs/archive/plans/full-evidence-system-schema-and-api-spec.md`

Stable architecture and current contract state now live in
`docs/map/rag.md`.
This file is the implementation tracker, milestone list, and future/provisional
work plan.

## Why This Rewrite Exists

The prior evidence documents were directionally strong but too split, too
spec-heavy relative to the live code, and too willing to let preview-era
`paper_chunks` thinking leak into the canonical design.

The repo truth on 2026-03-28 is:

- the graph runtime is now explicitly `base -> universe -> overlay -> active -> evidence`
- PostgreSQL is the canonical live substrate for the graph and evidence spine
- `engine/app/rag` is effectively empty
- `engine/app/main.py` is still only a health endpoint
- `app/actions/graph.ts` is still returning typed stubs for graph detail and RAG
- `features/graph/lib/detail-service.ts` already defines the frontend-facing typed
  shapes the future engine will need to satisfy

This plan is therefore not just an aspirational architecture note. It is the
program plan that should drive the next implementation passes.

The immediate implementation posture also matters:

- the live graph rebuild against `solemd_graph` is still running
- no heavy database work should start right now
- no RAG migrations should be applied yet
- no backfills, chunk builds, embedding jobs, or large scans should start yet

The right move now is to lock the contracts, own the backend boundary, and build
the cheap engine-side retrieval baseline on the current tables.

## Stable vs Provisional Doc Split

Use the docs this way:

- `docs/map/rag.md`
  - stable-now RAG architecture
  - stable integration points between frontend, DuckDB/Cosmograph, FastAPI,
    and PostgreSQL
  - current paper-level baseline behavior
  - explicit warehouse-era unknowns
- `docs/plans/full-evidence-system-plan.md`
  - active implementation tracker
  - open tasks and next milestones
  - provisional warehouse design
  - future Qdrant and parsing work

Rule:

- do not treat this plan file as the canonical stable contract
- move finalized behavior into `docs/map/rag.md`
- keep open questions, sequencing, and provisional designs here
- keep DB-side preview and migration-helper code under `engine/db`
- keep active retrieval/grounding/serving code under `engine/app/rag`
- keep refresh/backfill/archive/source-locator operations under
  `engine/app/rag_ingest`

## Implementation Tracker

Current implementation tracker for the first evidence vertical slice:

- [x] canonical evidence plan consolidated into one active document
- [x] scale target and hierarchical retrieval posture documented
- [x] FastAPI versus Supabase posture documented
- [x] graph-signal contract direction documented
- [x] `engine/app/rag/` package scaffold landed
- [x] canonical FastAPI evidence search endpoint landed
- [x] baseline retrieval over current tables landed
- [x] graph-signal projection landed
- [x] Next.js engine adapter landed
- [x] Ask -> evidence -> graph-lighting baseline landed for already-active papers
- [x] DuckDB universe point-id resolution helper landed for overlay promotion
- [x] Ask -> evidence -> overlay activation loop landed for non-active universe papers
- [x] namespaced overlay ownership landed for concurrent overlay producers
- [x] answer surface finalized without obscuring the graph
- [x] `@`-triggered support/refute interaction finalized for composition mode
- [x] shared engine-to-graph RAG adapter landed for server action and route reuse
- [x] Ask-mode `Vercel AI SDK` streaming landed on top of the canonical evidence contract
- [x] typed engine error envelope landed across server action and streaming route
- [x] DuckDB/Cosmograph runtime hard constraint documented for future RAG work
- [x] paper-centric RAG result adapter naming normalized away from legacy `chunk_*` result slots
- [x] bundle artifact taxonomy clarified as distinct from browser startup/autoload policy
- [x] DuckDB graph-resolution helpers renamed around explicit `graph_paper_ref` semantics
- [x] frontend-to-engine request contract now separates selected graph paper refs from canonical paper ids
- [x] compose evidence-assist trigger parsing moved into a modular registry rather than hard-coded `@` editor logic
- [x] selected-paper semantic neighbors now participate in evidence candidate ranking instead of graph-lighting only
- [x] support/refute intent now shapes baseline answer framing and primary answer graph-signal semantics
- [x] selection-only evidence scope added as an explicit backend contract rather than inferred frontend state
- [x] prompt-surface selection-only toggle now sends explicit selected graph-paper refs through DuckDB-backed query resolution
- [x] prompt selection scope now auto-applies by default when graph selection exists, with manual opt-out
- [x] support/refute intent now influences baseline paper ordering through bounded cue-language affinity heuristics
- [x] Ask-mode AI SDK streaming now preserves explicit selection scope through the backend contract instead of dropping it at the route-schema seam
- [x] DuckDB graph activation now depends on an explicit `ensureGraphPaperRefsAvailable(...)` seam rather than an implicit local-universe side effect
- [x] safe engine optimization pass landed for the current paper-level baseline: empty-result searches now bail out before enrichment work, and paper-search SQL now computes shared search expressions once per query instead of repeating them inline
- [x] answer-linked paper grounding is now explicit in the paper-level baseline contract: the engine returns an answer-grounding subset, overlay activation can stay broader, and DuckDB selection is applied only to the answer-linked subset
- [x] optional structured `grounded_answer` payload now flows end to end through the existing evidence response contract, with no second citation-specific stream protocol
- [x] live Ask submit path debugged and fixed for local development: request null/default normalization now matches the FastAPI contract, engine transport failures now surface actionable messages instead of raw `fetch failed`, and the global lexical candidate stage now uses the indexed title path so submit stays responsive on the live schema
- [x] graph-resolution buckets are now explicit in the prompt interaction layer: already-active evidence, universe-promoted evidence, and evidence-only papers are tracked separately after DuckDB resolution instead of being implicit side effects
- [x] stable evidence transport now omits null/default request noise at the web -> engine boundary, so the outer seam stays compact and aligned with backend defaults instead of depending on serializer chatter
- [x] future demand-attachment seam is now implemented behind `ensureGraphPaperRefsAvailable(...)` as an optional registered provider hook, with no current behavior change until a real non-base row fetch/materialization path is wired in
- [x] remote narrow-row demand attachment is now live behind `ensureGraphPaperRefsAvailable(...)`: missing graph-paper refs fetch bundle-shaped Arrow rows from FastAPI, materialize into local DuckDB `attached_universe_points`, and continue through the existing overlay/canvas contract
- [x] live graph-row demand attachment is now fully wired end to end: FastAPI `/api/v1/graph/attach-points`, Next.js `/api/graph/attach-points`, and browser-side DuckDB Arrow IPC insertion all use the same narrow point-row contract
- [x] bounded entity-normalized paper recall landed on the live paper-level backend via `solemd.entities` concept normalization plus PubTator joins, without claiming warehouse-era span grounding
- [x] bounded relation-normalized paper recall landed on the live paper-level backend through exact normalized `pubtator.relations.relation_type` matches, preserving the indexed current-table posture
- [x] bounded citation-neighbor candidate expansion landed on the live paper-level backend by pulling only from citation neighbors of the already-bounded candidate set, avoiding a global citation-context scan
- [x] lightweight engine-side parser contract/types scaffold landed with fixture-based tests, without starting warehouse migrations or backfills
- [x] parser-contract entity grounding now preserves raw source identifiers plus explicit `concept_namespace` / `concept_id` fields when source parsing can infer them safely
- [x] provisional warehouse-row contract now separates parser outputs from persisted citation/entity mention rows, with explicit `span_origin`, `alignment_status`, `alignment_confidence`, and canonical ordinals only after alignment
- [x] conservative alignment helper now codifies `exact`, `bounded`, and `source_local_only` outcomes against canonical block/sentence containment, with fixture-based tests
- [x] code-level serving contract now exists for `paper_chunk_versions`, `paper_chunks`, `paper_chunk_members`, `cited_span_packets`, `inline_citations`, and answer segments
- [x] first structural chunk assembler now exists against the code-level serving contract, with conservative section-boundary and caption-standalone behavior validated by fixtures
- [x] first cited-span packet and inline-anchor assembler now exists against aligned warehouse rows, with fixture coverage for sentence-grounded packets and answer-linked paper derivation
- [x] non-DB source-grounding adapters now bridge parsed `s2orc_v2` citation mentions and BioCXML entity overlays into cited-span packets and structured grounded-answer records
- [x] non-DB source-selection seam now chooses a primary structured text source plus annotation overlays, preferring viable `s2orc_v2` text and keeping BioCXML as an entity/offset overlay when both exist
- [x] end-to-end contract fixture now proves the intended future path: parse -> align -> warehouse mention rows -> cited-span packet -> inline anchor -> answer-linked papers
- [x] deferred warehouse table/index contract now exists in code for documents, sources, sections, blocks, sentences, references, mentions, chunk versions, chunks, and chunk members, without applying migrations
- [x] deferred warehouse write-batch contract now exists for validated parent-child persistence ordering, still without any live writes or migrations
- [x] deferred warehouse write-stage planner and repository seam now exist in code, with explicit stage order and COPY/staging-versus-upsert posture for future SQL writers
- [x] deferred warehouse SQL-template contract now exists in code, with canonical staging-table names, conflict keys, merge posture, and update-column derivation per logical write stage
- [x] deferred warehouse migration-sequencing contract now exists in code, so the future DDL rollout order is explicit before any migration is applied
- [x] deferred warehouse index matrix now exists in code, with explicit initial-schema vs post-load posture for lineage, grounding, serving, and lexical-fallback indexes
- [x] deferred non-executing warehouse write preview now exists in code, so planned stages and SQL templates can be rendered end-to-end without touching PostgreSQL
- [x] deferred DB helper previews now live under `engine/db/scripts` rather than `engine/app/rag`, so one-off helpers do not pollute the runtime RAG package
- [x] chunk-runtime helper names are now simplified around `chunk_seed.py`, `chunk_cutover.py`, and `engine/db/scripts/*`, reducing awkward runtime/one-off naming drift
- [x] operational chunk-runtime readiness inspection now exists under `engine/db/scripts/inspect_chunk_runtime.py`, so live table presence, chunk-version coverage, post-load index presence, and pending cutover phases can be checked from one script
- [x] first executable chunk cutover helper now exists under `engine/db/scripts/seed_default_chunk_version.py`, and live execution now seeds `default-structural-v1` through the runtime write seam
- [x] first real warehouse migrations are now applied for canonical document/source/section tables plus canonical block/sentence and aligned citation/entity mention tables
- [x] source-plan -> warehouse-write-batch builder now exists, so parsed/selected sources can be converted into validated core/span/mention write batches without inventing row shapes ad hoc
- [x] first runtime warehouse writer/repository path now exists for the live canonical tables, using staged COPY/upsert execution for documents, sources, sections, blocks, sentences, citations, and entities
- [x] source-plan -> runtime-writer orchestration now exists in code, so parsed sources can be selected, batched, and applied through one ingest seam without ad hoc SQL
- [x] runtime writer now explicitly defers logical `references` and chunk stages instead of pretending they already map cleanly to live physical storage
- [x] first read-side warehouse grounding bridge now exists in code: if aligned citation spans are present for answer-linked papers, the service can build a structured `grounded_answer`; otherwise the field remains `null`
- [x] grounded-answer reads are now explicitly gated on chunk-runtime readiness, so the live service will not populate `grounded_answer` unless required chunk tables exist, the default chunk version is seeded, and chunk rows are backfilled for the answer-linked papers
- [x] the future read-side cutover now has a concrete chunk-lineage path in code, so once runtime readiness is true the service reads cited spans through `paper_chunk_members` / `paper_chunks` instead of pretending raw warehouse rows are the final serving shape
- [x] live inspection now confirms the current chunk-runtime posture:
  `paper_chunk_versions`, `paper_chunks`, and `paper_chunk_members` are live,
  bounded backfill is now executing, grounded cited-span reads can be enabled
  for covered papers, and full cutover is still blocked only on broader
  coverage plus post-load chunk indexes
- [x] runtime bibliography adapter now maps logical `paper_reference_entries` onto the existing `solemd.paper_references` substrate, and chunk stages now have a live derived-serving lane
- [x] derived chunk rows can now be appended to warehouse write batches from
  canonical blocks/sentences, and the live runtime chunk lane now includes
  `paper_chunk_versions`, `paper_chunks`, and `paper_chunk_members`
- [x] default chunk policy seed now exists in code as `default-structural-v1`,
  with conservative section-role/block-kind inclusion and no-overlap defaults
- [x] derived-serving migration is now live for
  `paper_chunk_versions`, `paper_chunks`, and `paper_chunk_members`, plus a
  DB-side preview helper for seeding the canonical default chunk-version row
- [x] runtime chunk-version seeder now exists, so the first chunk policy row
  can be pushed through the existing write repository now that
  `paper_chunk_versions` is live
- [x] first bounded structural chunk backfill now succeeds against the live DB:
  `chunk-backfill-smoke-20260330` backfilled `231` chunk rows and `1836`
  chunk-member rows across `10` canonical papers with no deferred stages
- [x] chunk-quality rebackfill is now live-validated on the current covered
  subset:
  sentence-aware splitting removed all live hard-max chunk violations
  (`19 -> 0`), `paper_chunks.max_tokens` is now `379`, and the current derived
  serving totals are `paper_chunks = 648` and `paper_chunk_members = 4996`
- [x] the post-load lexical fallback path is now live and aligned with the real
  schema:
  `idx_paper_blocks_search_tsv` and `idx_paper_chunks_search_tsv` are valid
  expression indexes on `to_tsvector('english', coalesce(text, ''))`, and
  `inspect_chunk_runtime.py` now treats invalid parent placeholders as missing
  instead of marking the runtime ready too early
- [x] end-to-end bounded refresh now composes canonical ingest with chunk seed
  and chunk backfill in one operator pass: `refresh-chunk-lane-smoke-20260330-b`
  ingested `2` new papers, wrote `401` canonical rows, and backfilled `36`
  chunk rows plus `222` chunk-member rows with no deferred stages
- [x] runtime chunk backfill writer contract now exists, so canonical
  block/sentence rows can be converted into chunk write batches and passed
  through the same repository seam once chunk tables are live
- [x] executable chunk-content backfill helper now exists under
  `engine/db/scripts/backfill_structural_chunks.py`, loading canonical
  `paper_blocks` / `paper_sentences`, backfilling per-corpus chunk rows
  through the existing repository seam, and reporting executed vs deferred
- [x] S2 paragraph parsing now trims canonical block spans structurally and
  skips whitespace-only paragraph blocks, and chunk assembly now falls back to
  sentence text or skips truly empty blocks so live backfill does not emit
  invalid empty chunk records
  vs missing-canonical-row state cleanly
- [x] runtime chunk backfill now treats chunk-version seeding as a separate
  operational step, so per-paper backfill batches remain content-only and
  do not keep re-upserting the default chunk-version row
- [x] runtime chunk backfill is now batch-oriented rather than strictly
  per-paper, so multi-paper chunk rows can be assembled and written through
  one staged COPY/upsert batch
- [x] warehouse ingest is now able to merge multiple grounding plans into
  one validated write batch and apply them through one repository write,
  matching the bulk-load posture already used elsewhere in the engine
- [x] runtime chunk backfill now has resumable filesystem checkpoints under
  `engine/db/scripts`, with `--run-id` / `--reset-run` and a repo-local
  `.tmp` fallback when the mounted graph tmp root is unavailable
- [x] BioC source-document ids are now normalized against standard identifier
  forms (`PMID`, `PMCID`, `DOI`) before warehouse/audit resolution onto
  canonical `corpus_id`
- [x] BioC parsing now creates implicit section rows from structured
  `section_type` metadata when title passages are absent, so canonical blocks
  do not point at a missing section row or synthetic section `0`
- [x] BioC document titles now resolve from the first actual title passage
  instead of assuming the first XML passage is always the title
- [x] same-corpus overlay sources are now retained when they contribute
  structural or reference/entity value, not only when they carry entities
- [x] entity mentions no longer produce standalone cited-span / inline-citation
  packets without citation support; entity overlays can enrich cited spans, but
  grounded answers remain citation-led
- [x] chunk assembly now honors `sentence_source_policy`, so chunk lineage does
  not silently include fallback sentence segmentation when a chunk version
  disallows it
- [x] engine-owned refresh orchestration now exists in
  `engine/app/rag_ingest/orchestrator.py`, with
  `engine/db/scripts/refresh_rag_warehouse.py`
  as a thin wrapper and rerunnable operator flags for
  `--corpus-ids-file`, `--checkpoint-root`, `--report-path`,
  `--skip-s2-primary`, `--seed-chunk-version`, and `--backfill-chunks`
- [x] canonical operator entrypoints now exist under `engine/db/scripts`:
  `refresh_rag_warehouse.py`, `backfill_structural_chunks.py`, and
  `seed_default_chunk_version.py`, with one canonical flag spelling per option
- [x] reusable chunk-backfill runtime logic now lives in
  `engine/app/rag_ingest/chunk_backfill_runtime.py`, so the backfill script is
  a thin wrapper instead of the main implementation surface
- [x] row-wise warehouse COPY SQL now uses plain `COPY ... FROM STDIN`
  semantics aligned with psycopg3 `copy.write_row(...)`, rather than mixing
  row-wise COPY with CSV-format clauses
- [x] canonical `refresh_existing` ingest is now a real replace path for the
  affected paper set, deleting current paper-scoped warehouse rows inside the
  same transaction before staged rewrites
- [x] warehouse upsert SQL now uses `IS DISTINCT FROM` guards on update columns
  so refresh retries do not rewrite identical rows and churn WAL unnecessarily
- [x] chunk-backfill checkpoints now treat schema-deferred/no-op chunk writes
  as terminal paper reports, so resumable runs stop retrying the same
  unavailable chunk tables forever
- [x] chunk-backfill checkpoint storage is now batch-oriented: static run
  metadata lives in `checkpoint.json` and per-batch paper reports are written
  as separate files instead of rewriting one growing report JSON every batch
- [x] same-corpus BioC overlay discovery is now explicitly S2-aware:
  archive discovery can require existing `s2orc_v2` warehouse coverage before
  selecting candidates, and bounded live overlay smokes now exit cleanly with
  zero writes when early archive windows do not intersect the current S2 set

Implementation rule:

- update this checklist and the milestone notes as scope is uncovered during implementation

## Immediate Queue

Near-term work should stay bounded by the current paper-level baseline:

- [x] audit the live request/response contract against `docs/map/rag.md` and avoid adding speculative warehouse fields to the stable outer seam
- [ ] keep engine retrieval-quality work inside current-table paper retrieval rather than warehouse-era claim-verification logic
- [ ] start populating live canonical warehouse rows at batch scale through the
  refresh orchestrator, beginning with a bounded refresh over currently
  downloaded `s2orc_v2` plus BioC fallback
  - bounded live smoke now succeeds for `corpus_id = 9787212` through
    `engine/db/scripts/refresh_rag_warehouse.py`, writing canonical rows into
    `paper_documents`, `paper_sections`, `paper_blocks`, `paper_sentences`, and
    `paper_references`
  - first bounded native multi-paper refresh now succeeds from the WSL-native
    Semantic Scholar release root; `refresh-batch-20260330-b` ingested
    `253313057`, `280634650`, and `284324019`, skipped already-present
    `9787212`, and wrote `1345` canonical rows
  - next bounded native batch now succeeds too; `refresh-batch-20260330-c`
    ingested `2766040`, `52078348`, `202759708`, `237454355`, and `277656163`,
    skipped four already-present papers, and wrote `1832` canonical rows
  - the source-driven default now succeeds too; `refresh-batch-20260330-d`
    ran with plain `--limit 5`, filtered discovered shard ids through the
    canonical target loader, skipped nine already-present papers, and ingested
    `263615713`, `269327934`, `276284199`, `277853448`, and `281946597` with
    `1281` canonical rows written
  - a larger native source-driven batch now succeeds too; `refresh-batch-20260330-f`
    ran with plain `--limit 50`, skipped forty-five already-present papers,
    and ingested fifty new canonical papers from `s2orc_v2-0000.jsonl.gz`
    with `15254` rows written
  - the next larger single-worker native source-driven batch now succeeds too;
    `refresh-batch-20260331-g` honored `requested_limit = 50`,
    `selected_target_count = 50`, skipped ninety-six already-present papers,
    and wrote `16550` canonical rows
  - the next bounded native source-driven batch now succeeds too;
    `refresh-batch-20260331-h` honored `requested_limit = 25`,
    `selected_target_count = 25`, skipped one hundred fifty-nine
    already-present papers, and wrote `5850` canonical rows
  - stage-row-budgeted native refresh now succeeds too;
    `refresh-row-budget-smoke-20260330` honored `requested_limit = 3` and
    `stage_row_budget = 100`, wrote `1007` canonical rows, and split the S2
    ingest into `3` staged writes with `max_batch_total_rows = 422`
  - current canonical warehouse totals after the latest native batches, BioC
    growth, low-value BioC cleanup, and the newest later-window BioC runs:
    `paper_documents = 355`, `paper_sections = 4054`, `paper_blocks = 9494`,
    `paper_sentences = 45331`, `paper_references = 12603`,
    `paper_chunk_versions = 1`, `paper_chunks = 2269`,
    `paper_chunk_members = 15785`
  - live canonical warehouse source coverage is now:
    `solemd.paper_document_sources = 248` `s2orc_v2` rows and
    `solemd.paper_document_sources = 107` `biocxml` rows
  - explicit targeted refresh now has a release-sidecar locator path under
    release `manifests/` instead of scanning broad S2/BioC unit sets whenever
    the locator exists:
    - S2 sidecar:
      `s2orc_v2.corpus_locator.sqlite`
    - BioC sidecar:
      `biocxml.corpus_locator.sqlite`
  - explicit targeted warehouse refresh can now refresh source locators inline
    through `--refresh-source-locators` and use the resulting shard/archive
    coverage in the same run
  - inline locator refresh now reuses existing sidecar coverage and only scans
    missing corpus ids, which keeps rerunnable targeted refreshes bounded
  - operational refresh/backfill/archive workflows now live under
    `engine/app/rag_ingest/`, while active retrieval/grounding/runtime stays
    under `engine/app/rag/`
  - `engine/app/rag_ingest/` now also owns the warehouse writer,
    staged-write planning, chunk seed/backfill, and resumable ingest
    checkpoint helpers that support monthly refreshes
  - operator inspection for current sidecar coverage now lives in
    `engine/db/scripts/inspect_rag_source_locator.py`
  - bounded BioC archive target discovery now lives in
    `engine/db/scripts/discover_bioc_archive_targets.py`
  - bounded new-ingest BioC archive execution with direct locator seeding now
    lives in `engine/db/scripts/ingest_bioc_archive_targets.py`
  - bounded BioC archive-member cache prewarm now lives in
    `engine/db/scripts/prewarm_bioc_archive_member_cache.py`
  - a one-command bounded BioC window runner now lives in
    `engine/db/scripts/ingest_bioc_archive_window.py`
  - that same operator can now ingest directly from a bounded precomputed
    discovery report via `--discovery-report-path`, so archive-window prewarm
    and bounded ingest no longer require a second candidate-discovery pass
  - the one-command later-window runner is now validated at larger batch sizes:
    - `BioCXML.8`, `--limit 8`, `--max-documents 300`:
      `7` ingested, `1` low-value shell skip, `823` canonical rows,
      `42` chunk rows, `293` chunk-member rows, zero QA flags
    - `BioCXML.9`, `--limit 10`, `--max-documents 350`:
      `10` ingested, `0` low-value shell skips, `740` canonical rows,
      `46` chunk rows, `266` chunk-member rows, zero QA flags
  - the generic S2 refresh path now also supports inline warehouse QA through
    `--inspect-quality`
  - bounded live S2 proofs now exist on that generic path too:
    - `s2-quality-20260331-a`:
      `8` ingested `s2orc_v2` papers, `3022` canonical rows,
      `217` chunk rows, `1466` chunk-member rows, zero QA flags
    - `s2-quality-20260331-b` with byte-budgeted staged writes:
      `6` ingested `s2orc_v2` papers, `2574` canonical rows across `5`
      staged writes, `206` chunk rows, `1433` chunk-member rows,
      zero QA flags
    - `s2-quality-20260331-c` with a larger bounded byte budget:
      `12` ingested `s2orc_v2` papers, `3551` canonical rows across `6`
      staged writes, `267` chunk rows, `1894` chunk-member rows,
      zero QA flags
  - a sequential bounded S2 campaign path is now validated too:
    `s2-campaign-20260331-a` ran two source-driven S2 refreshes with
    `limit_per_run = 6` and aggregate results of `12` selected targets,
    `12` ingested papers, `4399` canonical rows, `303` chunk rows,
    `2072` chunk-member rows, and `0` QA-flagged papers
  - the sequential BioC campaign path is now live-validated too:
    `bioc-campaign-20260331-8b` ran two later windows over `BioCXML.8`
    with aggregate results of `12` selected candidates, `7` ingested papers,
    `5` low-value shell skips, `2920` canonical rows, `172` chunk rows,
    `1041` chunk-member rows, and `0` QA-flagged papers
  - a second sequential BioC campaign is now also validated:
    `bioc-campaign-20260331-9b` ran two later windows over `BioCXML.9`
    with aggregate results of `12` selected candidates, `10` ingested papers,
    `2` low-value shell skips, `2332` canonical rows, `156` chunk rows,
    `867` chunk-member rows, and `0` QA-flagged papers
  - release-sidecar BioC archive manifests now live in
    `manifests/biocxml.archive_manifest.sqlite`
  - bounded warehouse-quality inspection now lives in
    `engine/db/scripts/inspect_rag_warehouse_quality.py`
  - QA is no longer purely structural: it now also flags suspicious structural
    titles like `Introduction`, after a live spot-audit showed that a BioC
    paper with otherwise good sections/blocks/chunks could still persist a bad
    document title and pass the old zero-flag report
  - same-corpus overlay discovery can now target only already-ingested
    S2-backed warehouse papers with `--existing-s2-only`
  - bounded BioC overlay backfill over existing S2-backed warehouse papers now
    has a clean wrapper in `engine/db/scripts/backfill_bioc_overlays.py`
  - that overlay path can now discover archive-scoped candidates inline via
    `--archive-name` and `--discovery-max-documents` instead of requiring a
    manual intermediate corpus-id file
  - live locator coverage currently includes:
    - `209447147 -> s2orc_v2-0000.jsonl.gz:355`
    - `246836000 -> s2orc_v2-0001.jsonl.gz:2`
    - `249973141 -> BioCXML.0.tar.gz:4`
  - rerunnable locator refresh is now live-validated too:
    - `locator-covered-s2-fast-20260330b` reused existing S2 sidecar coverage
      for `209447147` and `246836000` with `scanned_documents = 0`
    - `locator-covered-bioc-fast-20260330` reused existing BioC sidecar
      coverage for `249973141` with `scanned_documents = 0`
  - live targeted BioC validation is now complete:
    `refresh-explicit-bioc-inline-20260330` refreshed the BioC locator inline,
    located `corpus_id = 249973141` in `BioCXML.0.tar.gz`, and wrote `571`
    canonical rows as the first live `biocxml` warehouse paper
  - the first bounded live BioC batch is also complete:
    `refresh-explicit-bioc-batch0-20260330` refreshed locator coverage inline
    for ten early `BioCXML.0.tar.gz` matches and wrote `216` canonical rows
    for `10` new `biocxml` warehouse papers
  - the discovery-driven follow-up batch is now complete too:
    `discover_bioc_archive_targets.py --archive-name BioCXML.0.tar.gz --limit 20`
    emitted a reusable corpus-id file, and
    `refresh-explicit-bioc-batch1-20260330` ingested those `20` ids with
    inline locator refresh for `2062` canonical rows
  - a cleaner archive-ingest fast path is now live too:
    `ingest_bioc_archive_targets.py --archive-name BioCXML.1.tar.gz --limit 3`
    discovered `3` new BioC targets, seeded `3` locator entries directly from
    discovery results, and ingested `631` canonical rows without a second
    locator-refresh scan
  - the same operator can now seed/backfill chunks inline as well:
    `ingest_bioc_archive_targets.py --archive-name BioCXML.1.tar.gz --limit 2 --seed-chunk-version --backfill-chunks`
    ingested `2` BioC papers and backfilled `2` chunk rows plus `23`
    chunk-member rows in the same bounded run
  - the same operator can now also run bounded warehouse QA inline:
    `ingest_bioc_archive_targets.py --archive-name BioCXML.2.tar.gz --limit 2 --seed-chunk-version --backfill-chunks --inspect-quality`
    ingested `2` BioC papers, backfilled `19` chunk rows plus `114`
    chunk-member rows, and returned a zero-flag quality report for the batch
  - later-window BioC archive execution is now live-validated too:
    `ingest_bioc_archive_targets.py --archive-name BioCXML.2.tar.gz --start-document-ordinal 1001 --limit 2 --max-documents 120 --seed-chunk-version --backfill-chunks --inspect-quality`
    scanned ordinals `1001..1120`, ingested `2` BioC papers, wrote `120`
    canonical rows, backfilled `4` chunk rows plus `34` chunk-member rows,
    and returned a zero-flag quality report
  - a second later-window validation batch also succeeded:
    `ingest_bioc_archive_targets.py --archive-name BioCXML.3.tar.gz --start-document-ordinal 1001 --limit 2 --max-documents 120 --seed-chunk-version --backfill-chunks --inspect-quality`
    scanned ordinals `1001..1120`, ingested `2` BioC papers, wrote `54`
    canonical rows, backfilled `2` chunk rows plus `22` chunk-member rows,
    and returned a zero-flag quality report
  - the member-cache prewarm path is now live-validated too:
    `prewarm_bioc_archive_member_cache.py --archive-name BioCXML.5.tar.gz --discovery-report-path ... --limit 6`
    fetched `6` selected members into the release-sidecar cache with
    `cache_hits = 0` and `archive_reads = 6`
  - the sequential cache-backed direct-ingest proof is now live too:
    `ingest_bioc_archive_targets.py --archive-name BioCXML.5.tar.gz --discovery-report-path ... --limit 6 --seed-chunk-version --backfill-chunks --inspect-quality`
    then reported `member_fetch.cache_hits = 6`,
    `member_fetch.archive_reads = 0`, ingested `5` BioC papers, skipped
    `1` low-value shell paper, wrote `520` canonical rows, backfilled
    `50` chunk rows plus `239` chunk-member rows, and returned a zero-flag QA
    report for the covered papers
  - the same cache-backed direct-ingest pattern is now validated at a larger
    bounded batch size too:
    `ingest_bioc_archive_targets.py --archive-name BioCXML.6.tar.gz --discovery-report-path ... --limit 10 --seed-chunk-version --backfill-chunks --inspect-quality`
    reported `member_fetch.cache_hits = 10`,
    `member_fetch.archive_reads = 0`, ingested `7` BioC papers, skipped
    `3` low-value shell papers, wrote `254` canonical rows, backfilled
    `9` chunk rows plus `86` chunk-member rows, and returned a zero-flag QA
    report for the covered papers
  - the joined one-command window runner is now live too:
    `ingest_bioc_archive_window.py --archive-name BioCXML.7.tar.gz --start-document-ordinal 1001 --limit 4 --max-documents 200 --seed-chunk-version --backfill-chunks --inspect-quality`
    discovered a bounded later window, prewarmed `4` members, then ingested
    the same `4` papers with `member_fetch.cache_hits = 4`,
    `member_fetch.archive_reads = 0`, wrote `1031` canonical rows, backfilled
    `43` chunk rows plus `468` chunk-member rows, and returned a zero-flag QA
    report for the covered papers
  - the important operational constraint is now explicit: later-window scans on
    gzipped BioC archives remain sequential at the archive layer even with
    `--start-document-ordinal`; the new flag gives bounded reproducible windows
    but not true random access
  - BioC discovery now writes a narrow archive-manifest sidecar as it scans,
    and repeat discovery over a covered window reuses that sidecar instead of
    rescanning the tar stream
  - live manifest reuse is now validated on `BioCXML.4.tar.gz`:
    - first pass at `--start-document-ordinal 1001 --limit 2` scanned `25`
      docs and wrote `25` manifest rows
    - immediate repeat used `25` manifest rows and wrote `0`
  - low-value BioC shell documents are now explicitly excluded:
    - title-only / empty-abstract BioC docs with `0` blocks, `0` sentences,
      and `0` references are skipped before warehouse persistence
    - archive manifests now remember those rows as
      `low_value_shell_document`, so later-window discovery advances past them
      instead of rediscovering them
    - two existing shell docs (`32037055`, `19630648`) were removed from the
      warehouse and marked in the manifest sidecar
    - BioC source locators now preserve `member_name` alongside
      `archive_name + document_ordinal`, so the next cache/index pass can key
      off a stable archive-member identity
    - precomputed discovery reports can now be loaded even when they predate
      the `member_name` field, so warmed reports remain usable across this
      schema evolution
    - the direct archive-ingest path now also consults manifest skip memory
      before fetch, so reruns do not reopen the archive for known low-value
      shell docs
    - bounded warehouse QA now reports `empty_shell_bioc_docs = 0`
  - manifest coverage accounting now advances past skipped ordinals too, so a
    skipped manifest row still counts as covered for later-window discovery
  - after that change, the dominant remaining cost on later-window BioC runs
    is actual archive parse traversal to the selected member ordinals, not
    candidate rediscovery; the next material speedup on this lane is archive
    parse/index strategy rather than more discovery plumbing
  - the one-step BioC operator now has a direct default path for bounded new
    papers from precomputed reports:
    - `bioc-archive-direct-live-20260331-a` ingested `41325340`, skipped
      low-value shell `37535630`, wrote `26` canonical rows, and backfilled
      `1` chunk plus `8` chunk-member rows
    - immediate rerun `bioc-archive-direct-live-20260331-b` collapsed to a
      fast no-op because one candidate was already ingested and the other was
      filtered by manifest skip memory before fetch
  - same-corpus BioC overlay backfill remains the right long-term path for
    already-ingested S2 papers, but a bounded probe over the first `1000`
    documents of `BioCXML.0.tar.gz` did not intersect the current S2-backed
    warehouse paper set with missing BioC overlays; current practical progress
    is therefore bounded new BioC warehouse ingest plus continued locator
    growth rather than forcing slow overlay-only archive scans
  - a narrower archive-aware overlay smoke is now validated too:
    `backfill_bioc_overlays.py --archive-name BioCXML.0.tar.gz --limit 5 --discovery-max-documents 100`
    exited cleanly with no candidates and no writes
  - broader bounded sampling over the first `500` documents of
    `BioCXML.0.tar.gz` through `BioCXML.9.tar.gz` also found no same-corpus
    overlay hits for the current S2-backed warehouse subset
  - next meaningful optimization on this lane is manifest coverage growth /
    refresh for hot BioC archives, so repeated later-window discovery stays
    cheap before we tackle true random-access alternatives
  - write-batch normalization now clears unresolved `source_reference_key`
    links on citation mentions before persistence rather than inventing fake
    bibliography rows or weakening the strict warehouse validator
  - S2ORC parsing now emits an implicit preamble section when paragraphs appear
    before the first `section_header`, so canonical blocks never reference a
    missing section row
  - refresh orchestrator semantics are now explicit:
    explicit corpus ids => targeted canonical refresh; no explicit corpus ids
    => source-driven S2 refresh filtered through the canonical target loader
  - `engine/db/scripts/inspect_chunk_runtime.py` now closes the psycopg pool
    explicitly on exit, so one-off runtime checks do not leave worker threads
    behind after printing
- [x] move the hot release trees and graph-temp/checkpoint paths off `/mnt/e`
  onto WSL-native ext4-backed storage before large canonical refresh and chunk
  backfill runs; future bulk downloads should land there directly
  - PubTator canonical root now lives at
    `/home/workbench/SoleMD/SoleMD.Graph-data/data/pubtator` and the repo mount
    points directly at that root instead of a `raw` alias
  - Semantic Scholar canonical root now lives at
    `/home/workbench/SoleMD/SoleMD.Graph-data/data/semantic-scholar`, the repo
    mount points directly at that root, the copied `s2orc-v2` alias is local,
    and the old `/mnt/e/SoleMD.Graph` tree has been removed
- [x] replace the coarse shared refresh checkpoint model with DB-backed
  source-unit claims before attempting true 200M-scale refresh runs
  - refresh source-unit ownership now lives in
    `solemd.rag_refresh_source_units`
  - `engine/app/rag_ingest/orchestrator_units.py` now provides atomic
    worker-safe
    claims over `s2_shard` / `bioc_archive` units using PostgreSQL
  - worker-local report/checkpoint files now live under
    `rag_refresh/<run_id>/<worker-key>/` instead of sharing one checkpoint JSON
  - `refresh_rag_warehouse.py` now accepts `--worker-count` and
    `--worker-index`
  - source-driven parallel refresh now supports a run-global `--limit` through
    `solemd.rag_refresh_runs` plus `solemd.rag_refresh_selected_targets`
- [x] add run-global budget coordination for source-driven parallel refresh so
  bounded `--limit` runs can scale safely without worker overshoot
  - `solemd.rag_refresh_runs` stores `requested_limit` and
    `selected_target_count`
  - `solemd.rag_refresh_selected_targets` reserves selected corpus ids once per
    run before expensive parse/write work begins
  - run-global budget coordination is live-validated for
    `refresh-bench-v3-1w-20260331`, `refresh-bench-v3-2w-20260331`, and
    `refresh-bench-v3-4w-20260331`; all three runs selected exactly `16`
    targets
- [x] benchmark `1 vs 2 vs 4` workers on bounded source-driven native refresh
  before defaulting to parallelism for warehouse population
  - `1 worker`: `0.589s`, `16` papers, `5705` rows
  - `2 workers`: `0.744s`, `16` papers, `6078` rows
  - `4 workers`: `65.051s`, `16` papers, `5865` rows
  - current recommendation: keep bounded source-driven native refresh at
    `1 worker` by default; reserve multi-worker mode for targeted runs or
    materially larger shard/domain sweeps where global-budget overscan is not
    dominant
- [x] add stage-row budgeting to canonical warehouse refresh so staged writes
  stay bounded by approximate row volume, not just paper count
  - refresh CLI now supports `--stage-row-budget`, with a current default of
    `25000` estimated canonical rows per staged write
  - row-budget estimation is structural and parser-aware: it is derived from
    normalized document/source/section/block/sentence/reference/citation/entity
    counts, not file-size heuristics
  - live smoke `refresh-row-budget-smoke-20260330` confirmed the split:
    `3` ingested papers, `1007` total rows, `3` staged writes,
    `max_batch_total_rows = 422`
- [x] add stage-byte budgeting to canonical warehouse refresh so staged writes
  can also flush on approximate serialized payload size, not only row count
  - refresh CLI now supports `--stage-byte-budget`
  - byte-budget estimation is structural and parser-aware: it is derived from
    normalized document/source/section/block/sentence/reference/citation/entity
    content lengths and JSON payload sizes, not filesystem heuristics
  - live smoke `refresh-byte-budget-smoke-20260330` confirmed the split:
    `3` ingested papers, `754` total rows, `3` staged writes,
    `estimated_bytes_total = 224775`, `max_batch_estimated_bytes = 108586`
  - this is intentionally a flush threshold, not a hard cap; a single paper may
    still exceed the byte budget and should be written alone
- [x] extend refresh progress beyond unit claims into finer shard/member-offset
  manifests for the live source-driven refresh path
  - `solemd.rag_refresh_source_units.metadata` now stores per-unit progress
    ordinals such as `last_processed_ordinal` and `last_corpus_id`
  - the same worker can now reclaim an interrupted `running` S2 or BioC unit
    and resume inside the unit instead of restarting it from row zero
  - targeted tests now cover mid-shard interruption plus same-worker resume from
    the saved ordinal
  - bounded live smoke `refresh-progress-smoke-20260330` confirmed the refresh
    path still works cleanly with `batch_size = 1`: `2` ingested papers,
    `455` total rows, `2` staged writes, and the completed shard row recorded
    `last_processed_ordinal = 567` in PostgreSQL
- [x] keep the live service honest: `grounded_answer` remains `null` unless warehouse-backed cited spans are actually available for the answer-linked papers
- [x] add bounded entity-driven paper recall to the current baseline through `solemd.entities` normalization and PubTator joins, while keeping the response contract paper-level
- [x] add bounded relation-driven paper recall to the current baseline through exact normalized `pubtator.relations.relation_type` matches, while keeping the response contract paper-level
- [x] add bounded citation-neighbor candidate expansion to the current baseline without introducing a global citation-context retrieval scan
- [x] implement the explicit runtime adapter from logical `paper_reference_entries`
  onto the current `solemd.paper_references` substrate before marking
  bibliography persistence live in the warehouse ingest path
- [x] decide the first chunk-table migration/runtime writer lane:
  `paper_chunk_versions` first as a conditional runtime policy-table write,
  with `paper_chunks` / `paper_chunk_members` still deferred behind the
  explicit chunk-runtime cutover
- [x] define the first default chunk-version seed in code so backfill and
  cutover work can reference one canonical policy key and inclusion posture
- [x] place the deferred derived-serving migration and default chunk-version
  seed preview under `engine/db` so chunk-runtime cutover assets stay out of
  the runtime RAG package
- [x] wire a runtime seeder for the default chunk-version row so the first
  chunk-policy lane is usable without improvising ad hoc batch shapes
- [x] add a paired runtime chunk-content backfill helper under
  `engine/db/scripts` so derived chunk rows can be loaded from canonical
  spans through the same write seam without polluting the runtime RAG package
- [x] switch the chunk-content backfill helper from one-paper-at-a-time
  writes to configurable multi-paper staged batches so it is structurally
  aligned with large backfill workloads
- [x] document the current backend honestly as a paper-level baseline wherever the UI could otherwise imply sentence-grounded verification
- [x] plan the deeper `s2orc_v2` + BioCXML structural parsing pass as a separate warehouse-phase design effort rather than leaking premature chunk/span contracts into the current app boundary
- [x] finalize the first warehouse serving hierarchy explicitly as
  `papers -> block-rooted chunks -> sentences`, with chunks derived from the
  canonical block/sentence spine rather than replacing it
- [x] define the first canonical block taxonomy and first `paper_chunk_version`
  policy from real source samples, including caption/table handling and
  sentence-fallback rules
- [x] define the future warehouse answer-grounding contract so `answer-linked`
  papers can later become cited block/span sets without changing the graph
  activation boundary
- [x] document the future engine-owned LLM answer path explicitly:
  retrieval, cited-span assembly, and citation semantics stay in FastAPI; the
  AI SDK route remains a streaming/presentation layer
- [x] define provisional cited-span and inline-citation payload shapes in docs
- [x] normalize BioC source document ids through standard `PMID` / `PMCID` /
  `DOI` handling before canonical `corpus_id` resolution, while keeping any
  remaining unresolved ids explicit instead of silently coercing them
- [x] make chunk-content backfill resumable with script-owned filesystem
  checkpoints so large derived-serving backfills can resume safely
- [x] build the first resumable canonical warehouse ingest runner so
  `paper_documents` / `paper_sections` / `paper_blocks` / `paper_sentences`
  can actually be populated at batch scale
  - the engine-owned runner is now
    `engine/app/rag_ingest/orchestrator.py` with the operator wrapper at
    `engine/db/scripts/refresh_rag_warehouse.py`
  - targeted, source-driven, and worker-partitioned runs are now all live
    exercised
  - targeted parallel smoke `refresh-parallel-smoke2` claimed two S2 shards via
    `solemd.rag_refresh_source_units` and ingested `209447147` plus
    `246836000`
- [ ] define the reconciliation lane for unresolved BioC source ids that are
  neither directly mappable PMIDs nor locally resolvable PMCIDs/DOIs
  before adding any warehouse-era Pydantic fields
- [x] plan how inline citations will stream and render in the response tray
- [x] keep inline citation transport on the existing `data-evidence-response` path rather than introducing a second AI SDK stream protocol
- [x] add source-parser fixture tests for `s2orc_v2` citation bridging and
  BioCXML entity/caption/reference handling before any warehouse write path
  without making the browser parse model text for citation meaning
- [x] treat captions, tables, and other structurally meaningful spans as
  first-class warehouse grounding targets, not abstract-only or body-only
  afterthoughts
- [x] move the future answer-grounding shape into `docs/map/rag.md` so the
  stable map explicitly distinguishes current paper-grounded answers from the
  later warehouse + LLM + inline-citation answer path
- [ ] decide whether local dev should keep requiring a separately started
  FastAPI engine or add a supported combined `web + engine` dev workflow
- [ ] keep frontend adaptation work at typed integration points; do not add graph hot-path shortcuts to compensate for missing backend capability
- [x] add a backend-owned query-enrichment seam so live Ask requests can
  populate `entity_terms` / `relation_terms` conservatively without pushing
  brittle extraction logic into the frontend
- [ ] define future semantic-expansion and contrast/diversity retrieval channels behind the same backend -> DuckDB alias resolution -> overlay producer path instead of inventing a second activation mechanism for non-base papers
- [x] design the demand-attachment path for globally mapped non-base papers so backend-returned graph refs can fetch only needed graph rows into local DuckDB before overlay promotion, rather than assuming the full mapped corpus is already browser-attached
- [x] implement the remote narrow-row attachment path behind `ensureGraphPaperRefsAvailable(...)` so non-base papers can be materialized on demand without changing the overlay/canvas contract
- [ ] once warehouse writes are live, upgrade the service from paper-level
  `answer` + `answer_graph_paper_refs` to real populated `grounded_answer`
  packets sourced from cited spans, while keeping graph selection paper-only
- [x] implement the first runtime warehouse writer/repository path for the new
  canonical core/span/mention tables, with the current logical
  `paper_reference_entries` -> physical `solemd.paper_references` adapter made
  explicit
- [ ] implement the first runtime chunk-table writer lane only after chunk
  storage is migrated into PostgreSQL and the deferred cutover contract is
  ready to execute
- [x] confirm the live index posture for `solemd.papers`, `solemd.graph_points`, `solemd.citations`, `solemd.corpus`, and `pubtator.*` from the running graph DB so deferred DDL can target real gaps instead of assumed ones
- [x] validate the provisional warehouse taxonomy and chunk-version policy on
  additional `s2orc_v2` shards and BioCXML archives before any warehouse
  migration work starts
- [x] define the parser-output contract for `paper_documents`,
  `paper_sections`, `paper_blocks`, `paper_sentences`,
  `paper_reference_entries`, and `paper_citation_mentions` before any
  migration or backfill work starts
- [x] tighten the parser/grounding quality rules in code before large-scale
  warehouse population:
  BioC section fidelity cannot depend on title passages, same-corpus
  structural overlays must be retained, citation grounding must remain
  citation-led, and chunk lineage must respect `sentence_source_policy`
- [x] define the deferred index matrix for the warehouse tables before
  migrations, including lineage indexes, lexical fallback indexes, and the
  boundary between PostgreSQL and future Qdrant serving
- [x] define deferred stage-level SQL merge templates for the future warehouse
  writer so COPY/staging and upsert paths are already specified before any
  migrations are applied
- [x] keep an explicit optimization register in the docs so query-shape wins,
  deferred DDL, and likely structural upgrades are tracked as work advances
- [x] align the warehouse write path with existing graph/corpus bulk-load
  posture: staged COPY/upsert for large mutable tables, pooled short-lived
  metadata access, and dedicated non-pooled connections reserved for long
  COPY lanes
- [x] record the current embedding recommendation explicitly: `SPECTER2` for
  paper recall, `MedCPT` for chunk retrieval, and `MedCPT-Cross-Encoder`
  for chunk reranking once dense retrieval is live
- [x] add an explicit deferred chunk-runtime cutover contract so derived serving
  tables, chunk writes, backfill, grounded-packet reads, and post-load indexes
  have a real staged plan before any runtime switch is attempted
- [x] add a structured chunk-runtime cutover preview under `engine/db/scripts`
  so deferred serving cutover can be inspected without applying DDL

Confirmed live posture from the running graph DB:

- [x] `pg_trgm` and `vector` extensions are installed
- [x] current cosmograph corpus release is ~2.45M graph points; `pubtator.relations` is ~24.8M rows; `pubtator.entity_annotations` is ~318M rows
- [x] `solemd.graph_points` already has unique `(graph_run_id, corpus_id)` support
- [x] `solemd.corpus (pmid)` is indexed
- [x] `pubtator.entity_annotations` and `pubtator.relations` already have PMIDs and signature indexes aligned with the current joins
- [x] `solemd.papers` currently has title-only FTS, not title+abstract FTS
- [x] `solemd.citations` currently has `cited_corpus_id` support but not the fuller two-direction/context-count index posture

Deferred PostgreSQL optimization candidates, based on the current query shape and confirmed live schema:

- [ ] upgrade paper lexical search from title-only FTS to a stored/generated
  title+abstract search vector with a GIN index
- [ ] add a trigram/expression index for normalized title lookup once the
  lexical fallback operator is finalized
- [ ] add citation-direction indexes aligned with
  `citing_corpus_id`, `cited_corpus_id`, and `context_count > 0`

## Optimization Register

This section is the running optimization list for the RAG stack. It should be
updated whenever a real query-shape, schema, or serving insight appears during
implementation.

Confirmed wins already landed:

- paper-search SQL now computes shared search expressions once per query stage
- empty-result retrieval bails out before enrichment/reference/asset work
- compact web -> engine transport now omits null/default request noise
- entity-normalized paper recall now uses `solemd.entities` plus PubTator joins
  instead of depending only on lexical paper search
- backend query enrichment now preserves exact concept-id matches when the raw
  query already contains them, so MeSH-style identifiers can stay exact and
  indexed instead of being rewritten into fuzzy name matches
- entity-seeded paper recall now aggregates matched concept hits by PMID before
  joining into corpus and graph scope, reducing duplicate annotation rows in
  later paper joins
- live Ask outage from entity-term SQL alias/parameter drift is fixed, and the
  global entity recall branch now joins graph scope through the indexed
  `solemd.graph_points (graph_run_id, corpus_id)` path instead of a redundant
  scoped-corpus materialization
- relation-normalized paper recall now uses exact normalized
  `pubtator.relations.relation_type` matches instead of depending only on
  post-retrieval relation enrichment
- relation-seeded paper recall now aggregates matches by PMID before joining
  into corpus and graph scope, which keeps paper-level relation recall from
  dragging the full relation row set through later joins
- citation-neighbor candidate expansion now only pulls from neighbors of the
  already-bounded candidate set instead of scanning citation contexts globally
- reusable refresh orchestration now lives in
  `engine/app/rag_ingest/orchestrator.py` with thin operator wrappers under
  `engine/db/scripts`
- row-wise warehouse COPY now uses plain `COPY ... FROM STDIN` semantics that
  match psycopg3 `copy.write_row(...)`
- warehouse merge/upsert SQL now guards updates with `IS DISTINCT FROM` so
  identical reruns do not rewrite unchanged rows
- canonical `refresh_existing` ingest is now a real replace path for the
  paper set in the current batch instead of a pure additive upsert
- chunk-backfill resumptions now treat schema-deferred/no-op batches as
  terminal paper reports instead of retrying them forever

Likely next safe current-table wins:

- if relation-intent traffic starts using broader natural-language verbs instead
  of canonical relation labels, introduce a deliberate normalization table or
  map rather than widening the current exact-match query into a fuzzy scan
- if live entity-seeded plans remain heavy even after exact-first query
  splitting, add a composite `pubtator.entity_annotations (entity_type,
  concept_id, pmid)` index before broadening entity semantics
- keep auto-enriched plain-text entity names on the lighter enrichment/ranking
  path unless they resolve to explicit concept ids or the user explicitly sends
  entity terms; do not reopen the heaviest seeded paper-recall path by default
  without a measured index-backed improvement
- if live relation-seeded plans remain heavy even after PMID pre-aggregation,
  add a composite `pubtator.relations (relation_type, pmid)` index before
  broadening relation semantics
- if citation expansion begins to dominate latency, prioritize the deferred
  citation-direction partial indexes before attempting any broader citation
  matching semantics
- if BioC canonical resolution becomes a sustained ingest hotspot, add
  `solemd.corpus (pmc_id) WHERE pmc_id IS NOT NULL` and a normalized DOI
  lookup index before widening any non-PMID source-id reconciliation path

Deferred DDL/index wins:

- weighted stored/generated `title + abstract` search vector with GIN on
  `solemd.papers`
- normalized-title trigram/expression index once the lexical fallback shape is
  stable
- composite `pubtator.entity_annotations (entity_type, concept_id, pmid)` if
  exact-first entity recall remains annotation-join heavy under live workloads
- composite `pubtator.relations (relation_type, pmid)` if exact relation-seeded
  recall remains scan-heavy under live workloads
- citation-direction partial indexes aligned with
  `(citing_corpus_id)`, `(cited_corpus_id)`, and `context_count > 0`
- `solemd.corpus (pmc_id) WHERE pmc_id IS NOT NULL` if BioC PMCID resolution
  becomes a regular ingest/runtime workload
- normalized DOI lookup index or normalized DOI column strategy if BioC/other
  source-id reconciliation starts depending on DOI resolution at scale
- re-check PubTator signature indexes after relation- and entity-seeded recall
  are exercised on broader live traces

Deferred orchestration/runtime wins:

- replace full-Python target/existing-id materialization with shard-local or
  DB-backed manifests before very large refreshes
- move refresh checkpoints from whole-shard / whole-report JSON snapshots to
  microbatch progress markers (shard/member offsets or committed manifest rows)
- batch ingest and backfill by stage-row budgets or serialized bytes instead of
  paper count once live refreshes move beyond bounded pilots
  - first stage-row budget control is now live in canonical refresh; the next
    upgrade, if needed, is byte-aware or manifest-aware budgeting rather than
    more ad hoc batch-size tuning

Measured recommendation after the current-table optimization pass:

- the live paper-level backend is now structurally in the right place
- remaining current-table uplift is mostly justified DDL/index work rather than
  more retrieval-channel invention
- representative live entity/relation `EXPLAIN ANALYZE` probes still remained
  active past ~45s after the SQL-shape fixes, which justifies keeping the next
  uplift focused on composite PubTator join indexes rather than more semantic
  widening
- after the deferred DDL list is stabilized, the next major engineering lane
  should shift back to warehouse write/migration implementation

Deferred warehouse structural wins:

- persist `paper_entity_mentions` and `paper_citation_mentions` so answer-time
  grounding does not repeat raw source joins
- add answer-grounding join indexes only once cited-span packet access patterns
  are frozen

Deferred warehouse index matrix to design before any migrations:

- current paper-level baseline
  - `solemd.papers`
    - generated/stored weighted search vector over `title + abstract`
    - GIN on that search vector
    - normalized-title trigram or expression index for fallback similarity
  - `solemd.citations`
    - partial btree on `(citing_corpus_id)` where `context_count > 0`
    - partial btree on `(cited_corpus_id)` where `context_count > 0`
  - `solemd.paper_references`
    - current corpus/reference indexes are sufficient for the baseline
  - `solemd.paper_assets`
    - current `corpus_id + asset_kind + source` posture is sufficient for the baseline
- future warehouse lineage tables
  - `paper_documents`
    - unique `(corpus_id, source_system, source_revision)`
  - `paper_sections`
    - unique `(document_id, section_ordinal)`
    - btree on `(document_id, section_role)`
  - `paper_blocks`
    - unique `(document_id, block_ordinal)`
    - btree on `(document_id, section_id, block_ordinal)`
    - btree on `(corpus_id, block_kind, section_role)` for filtered scans
  - `paper_sentences`
    - unique `(block_id, sentence_ordinal)`
    - btree on `(document_id, sentence_ordinal)` only if cross-block replay needs it
  - `paper_reference_entries`
    - unique `(document_id, reference_index)` or stable source ref id when present
    - btree on `(referenced_corpus_id)` and `(referenced_paper_id)` when populated
  - `paper_citation_mentions`
    - btree on `(document_id, ref_id)`
    - btree on `(sentence_id)` and `(block_id)` for answer-grounding joins
  - `paper_entity_mentions`
    - btree on `(document_id, entity_type, identifier)`
    - btree on `(sentence_id)` / `(block_id)` for local grounding joins
  - `paper_chunk_versions`
    - unique natural key over the version-defining policy fields or a stable
      content hash
  - `paper_chunks`
    - unique `(chunk_version_id, corpus_id, chunk_ordinal)`
    - btree on `(chunk_version_id, corpus_id)`
    - live lexical fallback is now an expression GIN index on
      `to_tsvector('english', coalesce(text, ''))`
  - `paper_chunk_members`
    - unique `(chunk_id, member_ordinal)`
    - reverse lookup on `(member_kind, member_id)` for lineage replay

Boundary rule:

- PostgreSQL should own canonical lineage, lexical fallback, and exact answer
  grounding joins
- Qdrant should later own high-scale ANN serving over derived chunks or other
  retrieval units, not the canonical evidence model

Current milestone note:

- the backend baseline now lands a canonical `POST /api/v1/evidence/search`
  path, typed evidence bundles, typed graph signals, unit tests, and a thin
  Next.js server adapter
- the graph integration path is now explicitly two-stage:
  resolve returned `paper_id` values against the active canvas first for
  immediate highlighting, then promote non-active evidence papers into the
  overlay/active canvas path through DuckDB instead of treating them as
  highlight-only misses
- the DuckDB side now carries both the universe point-id resolver and explicit
  producer-owned overlay membership, so manual overlay expansion, Ask mode,
  and future `@support` / `@refute` evidence overlays can coexist without
  clobbering one another
- overlay ownership is now a DuckDB session concern rather than a React ref
  concern:
  producer-backed memberships materialize into the existing overlay union table
  so the active canvas and renderer stay unchanged while feature ownership
  becomes explicit
- the old prompt-level read/modify/write overlay reconcile path is gone:
  Ask and compose flows now write only their own named overlay producer and
  clear only that producer on replacement, failure, or reset
- the prompt now uses a docked evidence tray above the composer instead of
  expanding the prompt card downward, so answers and evidence stay visible while
  the graph remains in view
- create mode now has an `@`-triggered evidence assist command path that
  extracts the current drafting context, sends explicit `support` / `refute` /
  `both` intent through the existing evidence contract, and reuses the same
  graph-lighting and overlay activation path as Ask mode
- the Ask path now uses a dedicated `Vercel AI SDK` route handler that streams
  assistant text to the docked response tray while still delivering the
  canonical structured evidence payload as a typed data part; graph-lighting
  and overlay activation continue to run from the same `GraphRagQueryResponsePayload`
  contract instead of a parallel UI-only shape
- the streaming route and one-shot server action path now share the same typed
  engine error envelope, so rate limits, auth failures, and engine errors can
  propagate through the frontend contract without ad hoc string handling
- the one-shot detail-service path now throws a typed request error wrapper
  instead of swallowing engine failures behind ad hoc casts, so both prompt
  modes can react to structured backend failures consistently
- the frontend evidence adapter now keeps `corpus_id` and nullable `paper_id`
  distinct while deriving an explicit `graph_paper_ref` for browser-side graph
  resolution, instead of overloading pseudo-paper ids as canonical identifiers
- the DuckDB/session query seam now names that contract explicitly:
  graph-to-point resolution happens through graph paper refs, not through a
  misleading “paper ids only” abstraction
- the prompt/evidence request contract now mirrors that split:
  `selected_graph_paper_ref` carries the browser/runtime graph selection key,
  while `selected_paper_id` remains available for canonical upstream paper ids
- compose-mode evidence assist now resolves trigger symbols through a shared
  trigger registry:
  `@` now opens a simple support/refute evidence menu, and the symbol mapping
  can still be changed later without rewriting the editor plugin
- the engine baseline now promotes selected-paper semantic neighbors into the
  same candidate pool as lexical hits before final ranking:
  semantically close papers can become real evidence bundles and not just
  graph-side highlight signals
- the current baseline fusion is now split into two stages:
  lexical and semantic channels seed release-scoped paper candidates first,
  then citation/entity/relation signals rerank within that bounded set
- the support/refute interaction contract is now semantically honest at the
  engine boundary:
  generic Ask returns `answer_evidence`, support flows return
  `answer_support`, refute flows return `answer_refute`, and the baseline
  answer text uses the same framing instead of labeling every request as
  support-oriented
- selection scoping is now an explicit evidence-contract concern:
  when the frontend turns on `selection_only`, it must send the concrete
  selected graph-paper refs to the engine, and the engine must stay inside
  that release-scoped paper set instead of silently widening back to global
- the prompt surface now implements that contract end-to-end:
  a local toggle reads the current selected graph-paper refs from DuckDB’s
  `selected_point_indices` state, passes them through the canonical evidence
  request, and the response tray reflects when retrieval was limited to the
  selected paper set
- selection scope defaults to on whenever a graph selection exists:
  users do not need to remember to enable it each time, but they can still
  turn it off explicitly when they want the same selected context visible on
  canvas while querying the broader release
- support/refute intent now affects ordering as well as framing, but only in a
  bounded, honest way:
  the baseline uses cue-language affinity from citation contexts and paper
  summaries to lightly reorder candidate papers and expose `intent_affinity`
  in bundle rank features; it does not claim sentence-grounded contradiction
  detection or true claim verification yet
- the current baseline optimization lane is now explicit:
  safe code-level improvements happen immediately inside `engine/app/rag`,
  while DDL/index work is treated as deferred operational work until the graph
  rebuild window is clear
- the first safe optimization pass is landed:
  empty-result searches return before citation/entity/relation/reference/asset
  enrichment, and the lexical paper-search SQL now computes the tsquery,
  normalized title query, and search vector once per query row path instead of
  recomputing those expressions multiple times inline
- the current paper-level baseline now separates two graph-facing sets:
  broader retrieval graph signals may activate multiple related papers, but the
  explicit answer-linked subset is returned separately and becomes the
  answer-owned DuckDB selection so users can immediately inspect the studies
  the answer was actually grounded on
- that answer-linked selection is intentionally still paper-level:
  the future warehouse phase must upgrade it to cited block/span grounding
  rather than implying sentence-level verification today
- bundle contract constants and export metadata now say the startup rule
  explicitly:
  `base` autoloads, `universe` attaches on demand, and `evidence` remains off
  the startup browser path even when artifacts are listed in the manifest
- compose-mode evidence assist intentionally stays on the simpler one-shot path
  for now so support/refute drafting remains cheap and deterministic while the
  deeper evidence warehouse is still pending
- the future warehouse lane is now documented explicitly:
  engine-owned LLM synthesis must sit on top of cited span packets and
  structured inline citation anchors, while the graph boundary stays paper-level
  and continues to resolve answer-linked papers through DuckDB plus overlay
  producers rather than exposing citation spans to the graph hot path
- the future streaming citation rule is now explicit as well:
  `answer_linked_papers` should ultimately be derived from structured cited
  anchors / cited spans, and the response tray should render inline citations
  from typed data parts instead of reparsing free-form model citation text
- the current graph regression suite now locks the paper-selection rule:
  broader graph signals may promote additional studies into overlay/active, but
  only the explicit answer-linked subset should become the selected graph set
- the first warehouse hierarchy decision is now explicit:
  canonical truth stays `documents -> sections -> blocks -> sentences`, while
  scalable serving uses `papers -> block-rooted chunks -> sentences` so chunks
  remain derived retrieval products rather than the evidence spine
- the first warehouse taxonomy decision is now explicit as well:
  `section_role` and `paper_block_kind` remain separate axes, so methods/result
  location is not collapsed into paragraph/caption structure and retrieval
  policy can evolve without rewriting lineage
- the parser-output contract is now explicit too:
  source parsers emit normalized document/section/block/sentence/reference/
  citation records with lossless provenance, while chunking and cross-source
  alignment remain downstream phases
- the first broader raw-source parser audit is now concrete instead of assumed:
  a 200-row S2ORC audit across 4 shards parsed cleanly with strong structural
  yield (`avg_blocks ~= 57.56`, `avg_sentences ~= 211.56`,
  `matched_reference_fraction ~= 0.6792`, fallback sentences in `37/200`
  docs), and a fast 200-document BioC pilot across 2 archives now parses
  `199/200` after dropping empty-text block/reference passages
- BioC source-id handling is now split correctly:
  canonical ingest/audit resolution uses standard `PMID` / `PMCID` / `DOI`
  normalization against `solemd.corpus`, while parser-quality audits can still
  structurally review unresolved PMID docs via explicit source-native fallback
  without pretending they are canonically ingested
- current 200-document BioC pilot posture:
  `59` canonically resolved docs, `140` structurally parseable PMID docs
  without a current corpus-table match, and `1` remaining unresolved PMCID
- the next milestone starts with runtime-contract hygiene before more feature
  surface:
  finish the remaining query-layer cleanup so non-canvas lookups consistently
  use `current_points_web` / `current_paper_points_web`, remove stale
  chunk-era naming where it still leaks through graph query modules, and keep
  render/query/evidence responsibilities explicit before broadening the Ask and
  composition UX further
- after that hygiene lane, the next bounded engine retrieval-quality step is to
  let `evidence_intent` influence retrieval ordering itself rather than only
  answer framing:
  do this inside `engine/app/rag` with cheap, testable heuristics over the
  current tables rather than speculative warehouse-era logic

## Locked Decisions

1. PostgreSQL remains the canonical source of truth for paper, evidence, and warehouse state.
2. The graph bundle remains lean. Rich evidence is served by the engine, not embedded into the default browser bundle.
3. `pubtator.*` remains an upstream source substrate. It is not replaced by the future evidence warehouse.
4. `solemd.paper_references` and `solemd.paper_assets` are evolved, not casually replaced.
5. The canonical evidence model is a span spine:
   - document
   - section
   - block
   - sentence
   - citation mention
   - bibliography entry
   - entity mention
   - relation mention
   - asset
6. `paper_chunks` are derived retrieval products, not the evidence spine.
7. The engine API is the canonical evidence contract. The frontend should not assemble evidence semantics from raw tables.
8. Drizzle is not required for the target architecture. The canonical plan should not depend on it.
9. FastAPI is the backend evidence boundary. Pydantic request and response models are the canonical typed contract.
10. Route Handlers and Server Actions are not interchangeable:
    - Server Actions are for UI-driven mutations or controlled server-side actions
    - Route Handlers are for HTTP endpoints
    - neither should become the canonical evidence business-logic layer
11. Next.js Server Components should call the engine server-to-server for evidence reads when possible. Do not insert an extra same-app HTTP hop unless the browser truly needs one.
12. Future sentence and block serving should target Qdrant once the warehouse exists and retrieval volume justifies it.
13. Bounded paper-level and warehouse-local validation can continue to use PostgreSQL and pgvector.
14. There is no backwards-compatibility requirement for preview-era `chunk_text` contracts.
15. Full-text parsing must use structural signals from `s2orc_v2` and BioCXML. Do not use regex as the parser.
16. The stack must support:
    - a paper catalog that can grow past `200M+` articles
    - a full-text evidence warehouse that can support at least `14M+` chunked articles
17. Launch-scale retrieval must be hierarchical. Do not assume one global sentence ANN index over the entire corpus is the default serving path.
18. Supabase is not the canonical evidence backend. If it is used later, it should complement the stack with managed infrastructure capabilities, not replace PostgreSQL plus FastAPI evidence orchestration.
19. Supabase Edge Functions are not the primary runtime for evidence retrieval, parsing, or warehouse orchestration.
20. The browser graph runtime stays DuckDB-first and corpus-only:
    `current_points_canvas_web` is render-only, while `current_points_web` and
    `current_paper_points_web` are the query/detail aliases.
21. `pointIncludeColumns` stays empty on the live graph page.
    RAG work must not widen point payloads for convenience.
22. Browser DuckDB is a local graph-state engine, not a second evidence service.
    Release-scoped evidence retrieval and rich payloads stay behind FastAPI.
23. Graph-side RAG integration resolves engine-returned ids through canonical
    DuckDB aliases and producer-owned overlay membership. It must not depend on
    older broad union views or rebuild graph state in JS.
24. The DuckDB registration layer may evolve between narrow local tables and
    narrow local views with strict canonical columns, but consumers must depend
    only on the stable alias contract above.
25. Selection-scoped evidence requests are explicit backend input:
    the frontend may derive the selected set from DuckDB/Cosmograph state, but
    it must pass concrete graph-paper refs to FastAPI instead of expecting the
    engine to reconstruct browser selection state on its own.

## Scale Target

The scale target is now explicit:

- `200M+` article-level records at full launch
- `14M+` full-text articles chunked and citable in the evidence system

This changes several earlier assumptions.

The graph runtime can still begin from a curated mapped subset, but the evidence
stack must be designed for a much larger retrieval surface than the current
graph build.

### What this means operationally

1. The paper catalog and the evidence warehouse are different scale domains.
2. The system must support exact citation and evidence inspection without assuming
   every sentence is a first-pass global ANN object.
3. Canonical truth and serving indexes must stay decoupled.
4. The launch target is beyond "single-node first" retrieval thinking, even if
   current development still runs locally.

### Required serving posture

Use a hierarchical retrieval funnel:

1. paper-level recall across the global paper catalog
2. evidence-level recall within a bounded candidate set
3. sentence resolution and exact citation grounding inside the bounded set
4. reranking and bundle assembly after grounding

That implies the default retrieval unit at launch scale should be:

- paper for global recall
- block or chunk for first-pass evidence recall
- sentence for grounding, citation, and display

Sentence remains canonical for exact evidence, but it does not need to be the
default first-pass ANN unit across the entire launch-scale corpus.

## Current Repo Truth

### Canonical graph/runtime posture

The live graph design is already clear in `docs/design/living-graph.md`:

- `base_points` is the opening scaffold
- `universe_points` is the mapped remainder
- `overlay_points` is the promoted subset
- `active_points` is the live browser-facing dense union
- `evidence_api` is the heavy retrieval path

That split is correct and should remain.

### Hard constraint for all future RAG work

All future evidence, AI, and RAG work must preserve the hardened browser/runtime
contract:

- the render path is `current_points_canvas_web` and the dense active link/canvas
  aliases only
- the DuckDB query path is `current_points_web` and `current_paper_points_web`
  for search, filters, tables, info widgets, and bundle-local point resolution
- `pointIncludeColumns` stays empty on the live graph page; rich metadata is not
  mirrored back into Cosmograph point payloads for convenience
- heavy detail, release-scoped evidence retrieval, and answer grounding stay in
  the FastAPI evidence boundary rather than becoming a second frontend SQL layer
- DuckDB local SQL is for bundle-local resolution, scope, and overlay activation,
  not a substitute evidence backend
- the implementation under those aliases may use narrow local tables or narrow
  local views when needed for stable row/filter behavior, but the alias contract
  stays canonical
- the graph runtime remains corpus/paper-only; chunk-capable evidence may exist
  API-side, but it must not reintroduce chunk assumptions into the live graph
  runtime

### Current canonical PostgreSQL substrate

These current tables already exist and are the baseline evidence substrate:

- `solemd.corpus`
- `solemd.papers`
- `solemd.citations`
- `solemd.paper_references`
- `solemd.paper_assets`
- `pubtator.entity_annotations`
- `pubtator.relations`

These graph-facing tables are useful for grounding but are not the warehouse:

- `solemd.graph_runs`
- `solemd.graph_points`
- `solemd.graph_clusters`
- `solemd.graph_base_features`

### Current code reality

Relevant live code surfaces:

- `engine/app/main.py` has only the health endpoint
- `engine/app/graph/export.py` still declares bundle evidence artifacts that exceed what the current bundle actually exports
- `engine/app/db.py` already provides the shared PostgreSQL connection boundary
- `engine/app/graph/export_bundle.py` still exports placeholder document and chunk-adjacent fields for the graph bundle
- `app/actions/graph.ts` is still stubbed for graph detail, neighborhoods, and RAG
- `features/graph/lib/detail-service.ts` already defines the frontend contracts that a real evidence API must satisfy
- `features/graph/components/panels/PromptBox.tsx` already asks for generated answers
- `features/graph/duckdb/session.ts` already provides `getPaperNodesByGraphPaperRefs(...)` for graph-paper-ref to point resolution
- `lib/db/index.ts` and `lib/db/schema.ts` show the current frontend use of Drizzle for graph metadata reads, but that is current scaffolding rather than a target architectural dependency

The architecture work therefore needs to close a real gap between the docs and
the implementation surface, not just refine an already-existing API.

### Observed raw-file findings

Small direct probes of the local bulk assets confirm several design-critical facts.

From sampled `s2orc_v2` rows:

- the top-level shape is `authors`, `bibliography`, `body`, `corpusid`,
  `openaccessinfo`, `title`
- `body.text` and `bibliography.text` are present
- `body.annotations` includes `section_header`, `paragraph`, `bib_ref`, and sometimes `sentence`
- each annotation kind is itself a JSON-encoded string and requires a second decode step
- annotation spans are character offsets, and `bib_ref` annotations carry
  reference linkage such as `attributes.ref_id`
- bibliography annotations expose `bib_entry` spans whose `attributes.id`
  values are the usable bridge target for `body.annotations.bib_ref.ref_id`
- `sentence` is absent in some rows, so deterministic sentence fallback remains necessary
- bibliography subfields are not uniformly populated, so author-name or venue
  substructures should not be treated as required canonical fields
- in a wider 300-row local probe across five shards (`60` rows per shard),
  `paragraph` remained universal, `section_header` appeared in `299/300`
  rows, `bib_ref` in `293/300`, and `sentence` in `240/300`
- across that same five-shard probe, roughly two thirds of both `bib_ref` and
  bibliography `bib_entry` annotations carried `matched_paper_id`
  (`0.655` and `0.659` respectively), so source-native citation linkage is
  useful but still not universal
- section-header numbering tokens are common (`1792` numbered headers across
  the 300-row probe), which is useful for section normalization but still too
  noisy to treat as retrieval blocks by default
- section-header spans are structurally useful but noisy enough that they
  should remain section metadata, not retrieval blocks by default

From sampled BioCXML members:

- passages have explicit `offset`
- passages carry `section_type` and `type`
- front matter contains identifiers and license metadata in `<infon>` tags
- inline `<annotation>` tags carry exact mention offsets
- annotation identifiers may appear in source-native `<id>` elements rather
  than only in `<infon key="identifier">`, so parser adapters must preserve
  both forms before normalization
- sampled offsets behave like document-global offsets rather than
  passage-relative offsets
- bibliography entries appear as separate `REF` passages with structured
  citation metadata such as PMID, source, year, and alternative citation text
- broader local inspection also shows frequent `FIG`, `TABLE`, `REF`,
  `INTRO`, `METHODS`, `RESULTS`, `DISCUSS`, and `CONCL` passage types, which
  supports treating captions and table-adjacent text as first-class block kinds
- in a broader 120-document cross-archive BioCXML probe, `paragraph` and `ref`
  passages dominated, but `fig_caption` (`555`), `table` (`270`),
  `table_caption` (`207`), and `table_footnote` (`166`) were all common enough
  to justify distinct block kinds instead of a generic table/caption bucket
- that same probe showed `REF` as the most common `section_type` by a wide
  margin, reinforcing the need to keep reference passages lineage-first by
  default rather than blindly mixing them into retrieval chunks
- annotation ids in the BioC probe were predominantly namespaced and usable for
  safe normalization, led by `mesh` (`17451`), with smaller but real `cvcl`,
  `tmvar`, and `omim` populations
- sampled `FIG` passages expose explicit `fig_caption` content and optional
  inline annotations
- sampled `TABLE` passages expose both `table_caption` text and richer table XML
  payloads or footnotes, which argues for separating `table_caption`,
  `table_footnote`, and `table_body_text`
- additional sample members also exposed `fig_caption`, `table_caption`,
  `table_footnote`, `table`, and `ref` passage types across multiple articles,
  which supports treating the first warehouse taxonomy as general rather than
  article-specific
- sampled BioCXML documents did not reliably expose `<relation>` elements, so
  relation mentions should remain optional/sparse warehouse inputs rather than
  assumed first-class dense content

Implication:

- `s2orc_v2` remains the likely primary text spine
- BioCXML is strong enough to justify a parallel annotation and caption enrichment track

## Future Warehouse Answer Grounding

This is the next major design lane after the current paper-level baseline.

The target is not "an LLM answer with some papers nearby." The target is:

- retrieval over the full paper universe
- bounded evidence recall within grounded paper candidates
- cited spans with stable warehouse lineage
- inline citations rendered from structured backend data
- answer-linked papers projected back into the graph through the existing
  DuckDB resolution and overlay path

### Durable principles

1. The model may contribute reasoning and synthesis, but the answer must be
   grounded on retrieved study content.
2. The engine owns retrieval, grounding, citation assembly, and answer
   semantics.
3. The Next.js / `Vercel AI SDK` layer owns streaming transport and UI
   presentation, not evidence semantics.
4. Graph activation remains paper-level even when the answer is grounded on
   blocks or sentences.
5. Cited spans remain evidence-panel detail, not graph-hot-path state.
6. Inline citations should come from structured anchors, not from reparsing raw
   model text after the fact.
7. Query entity terms should normalize toward concept ids where possible, and
   answer grounding should preserve aligned entity mentions inside cited spans.

### Intended warehouse-era answer flow

1. Retrieve candidate papers from the global paper universe.
2. Retrieve candidate blocks/spans inside that bounded paper set.
3. Resolve citation mentions, bibliography entries, and provenance for the
   cited spans.
4. Assemble cited evidence packets:
   - paper ref
   - span/block id
   - section and caption context
   - source offsets / provenance
   - short quoted text for inspection
5. Run answer synthesis from those packets.
6. Return:
   - answer text
   - answer-linked papers
   - cited spans
   - inline citation anchors
7. Resolve answer-linked papers through DuckDB and apply answer-owned graph
   selection / overlay activation.

### Biomedical parsing implications

The warehouse phase must preserve more than abstract or body paragraphs.

Required posture:

- keep `s2orc_v2` as the likely primary text and inline-citation spine
- use BioCXML as a parallel offset and annotation enrichment layer
- preserve section labels, caption/table context, bibliography entries, and
  mention offsets as first-class warehouse provenance
- support deterministic sentence fallback where `s2orc_v2` does not provide
  sentence annotations
- do not collapse full-text evidence into regex-derived chunks

### Recommended hierarchy and chunking decision

The current recommended design is:

- **canonical warehouse spine**
  - `paper_documents -> paper_sections -> paper_blocks -> paper_sentences`
- **citation/provenance siblings**
  - `paper_reference_entries`
  - `paper_citation_mentions`
  - `paper_entity_mentions`
  - `paper_relation_mentions`
  - `paper_assets`
- **derived serving layer**
  - `paper_chunk_versions -> paper_chunks -> paper_chunk_members`

Recommended retrieval funnel:

1. global paper recall
2. block-rooted chunk recall inside the bounded paper set
3. sentence and citation-mention grounding for answer assembly and inline
   citation display

Decision:

- we **do** need chunks for scalable retrieval and embeddings
- we **do not** want chunks to become the canonical evidence unit

Rationale:

- blocks are the best human-visible evidence units for scientific articles
  because they preserve paragraph, caption, and table-adjacent structure
- sentences are necessary for exact grounding but too fine-grained and costly
  as the default first-pass retrieval unit
- derived chunks remain useful because embedding models and token budgets will
  evolve, but chunk boundaries should be replaceable without rewriting the
  canonical evidence spine

Chunking rule:

- build chunks from canonical block/sentence members
- prefer chunks that stay inside one section or caption context
- avoid arbitrary windows that cross section boundaries
- if adjacent tiny blocks are merged for serving efficiency, track that only in
  `paper_chunk_members`; do not collapse the block model itself

### Provisional first warehouse taxonomy and chunk policy

This is a provisional serving policy, not a finalized schema contract.

The first warehouse schema should keep **section role** and **block kind**
separate.

Recommended first `section_role` normalization:

- `abstract`
- `introduction`
- `methods`
- `results`
- `discussion`
- `conclusion`
- `supplement`
- `reference`
- `front_matter`
- `other`

Recommended first `paper_block_kind` normalization:

- `narrative_paragraph`
- `figure_caption`
- `table_caption`
- `table_footnote`
- `table_body_text`

Why this is the right split:

- `methods` vs `results` is narrative location, not structural kind
- `paragraph` vs `fig_caption` vs `table_footnote` is structural kind, not
  narrative role
- collapsing those into one enum would make retrieval policy and warehouse
  lineage harder to evolve later

Non-block structural objects should stay separate:

- section headers stay section metadata or lightweight context, not standalone
  retrieval blocks by default
- bibliography entries stay `paper_reference_entries`
- citation mentions stay `paper_citation_mentions`
- document title and front-matter metadata stay on the document/section plane,
  not as generic retrieval chunks

Provisional warehouse table sketch:

- `paper_documents`
  - one canonical document/version row per source text plane
  - keep source system, source key, source hash, language, and document-level
    metadata
- `paper_sections`
  - `section_role`, display label, parent/child section lineage, and absolute
    source offsets
- `paper_blocks`
  - `block_kind`, section linkage, block ordinal, absolute source offsets,
    cleaned text, and retrieval-default flags
- `paper_sentences`
  - sentence ordinal inside block, absolute source offsets, and segmentation
    provenance (`s2orc_annotation` vs deterministic fallback)
- `paper_reference_entries`
  - bibliography entry lineage from `bib_entry.id` and/or BioC `REF` passages,
    with matched paper/corpus ids when available
- `paper_citation_mentions`
  - inline citation anchors keyed by source `ref_id`, sentence/block lineage,
    offsets, and matched paper ids when present
- `paper_entity_mentions`
  - source-specific mention spans, identifiers, entity type, and raw attrs/infons
- `paper_relation_mentions`
  - optional/sparse relation spans when a source truly provides them; do not
    assume uniform density from BioCXML alone

First `paper_chunk_version` posture:

- chunk from canonical sentence and block members, not raw text slices
- keep chunks inside one section/caption context
- allow merging adjacent tiny `narrative_paragraph` blocks only when they are
  contiguous and semantically local
- keep `figure_caption` and `table_caption` blocks standalone by default
- keep chunk membership lineage explicit so chunk policies can change later

Recommended first `paper_chunk_version` fields:

- parser/source versions:
  - source system and source revision/hash
  - parser version
  - text-normalization version
- segmentation policy:
  - sentence source policy (`s2orc_annotation` first, deterministic fallback
    second)
  - included `section_role` values
  - included `paper_block_kind` values
  - caption/table merge policy
- sizing policy:
  - tokenizer name/version
  - target token budget
  - hard max tokens
  - sentence overlap policy
- retrieval policy:
  - embedding model/version
  - lexical normalization flags
  - retrieval-default flag

First code-level serving contract now exists for:

- `paper_chunk_version_record`
- `paper_chunk_record`
- `paper_chunk_member_record`
- `cited_span_packet`
- `inline_citation_anchor`
- `answer_segment`

Current rule:

- cited-answer packets derive from aligned warehouse rows
- answer-linked papers derive from inline-citation anchors
- this keeps graph selection tied to structured grounding rather than to raw
  model prose or the broader retrieved-paper pool
- chunk assembly currently remains conservative and structural:
  section-bounded, caption-safe, and driven by canonical block/sentence members

First sizing posture to validate:

- narrative chunks should start around the model-sized embedding window range
  rather than full paragraphs of arbitrary length
- sentence-aware overlap is acceptable when needed for retrieval continuity
- exact sentence grounding should still be resolved from canonical
  `paper_sentences`, not from the chunk text itself

Initial retrieval-default policy:

- `abstract` and body `narrative_paragraph` blocks are retrieval candidates
- `figure_caption`, `table_caption`, and parseable `table_body_text` blocks are
  retrieval candidates
- `methods` blocks remain searchable, but are candidates for later answer-time
  downweighting rather than exclusion from the canonical warehouse
- raw `REF` passages remain lineage-first and non-retrieval by default

Open validation questions for the next pass:

- should abstract narrative blocks be embedded and served separately from
  full-text body narrative chunks
- should some `table_body_text` content be stored only as parsed table assets
  when the textual projection is noisy
- should `table_footnote` blocks be retrieval-default or display-only at first
- what overlap policy is sufficient for continuity without duplicating too many
  near-identical biomedical spans

### Provisional payload shape to design before code

Do not implement these fields yet, but design toward them:

- `retrieved_papers`
- `answer_linked_papers`
- `cited_spans`
- `inline_citations`
- optional answer segments or anchors that let the UI render citations inline
  without guessing

### Inline citation streaming contract

The future streaming answer should keep one authoritative rule:

- the browser does not infer citation meaning by parsing raw model text

Preferred shape:

- assistant text may still stream normally
- citation meaning should arrive as structured data parts or typed payloads
- the authoritative answer-linked paper set should be derived from those
  structured citation anchors, not from the broader retrieval set

Provisional design target:

- `answer_segments`
  - ordered visible answer segments
  - each segment carries zero or more citation-anchor ids
- `inline_citations`
  - anchor id
  - cited paper ref
  - cited span ids
  - optional short quote / evidence label
- `answer_linked_papers`
  - unique paper refs referenced by the inline-citation anchors

UI implication:

- the `Vercel AI SDK` layer can stream answer text and typed citation parts
- the response tray renders citations from structured anchors
- DuckDB selection should use `answer_linked_papers`
- cited spans remain panel detail and never become graph-hot-path state

### Immediate milestone sequence for this lane

1. Finish the docs-level contract for cited spans and inline citations.
2. Do the deeper `s2orc_v2` + BioCXML parse-design pass on broader samples.
3. Finalize warehouse tables for document / section / block / sentence /
   citation mention / bibliography lineage.
4. Define `paper_chunk_versions` and first chunk-member policies from the
   canonical block/sentence model.
5. Build bounded chunk/block retrieval before attempting global evidence ANN.
6. Add LLM answer generation only after cited-span packets exist.
7. Keep the graph activation boundary unchanged throughout.

## Evidence Artifact Reconciliation

The current bundle contract in `engine/app/graph/export.py` and
`features/graph/types/bundle.ts` still declares evidence artifacts that are not
implemented as durable canonical bundle exports.

Treat that artifact list as transitional.

Recommended disposition:

- `universe_links`
  - stays browser-local / bundle-facing
- `citation_neighborhood`
  - moves to engine API
- `pubtator_annotations`
  - moves to engine API
- `pubtator_relations`
  - moves to engine API
- `paper_assets`
  - moves to engine API
- `full_text`
  - moves to engine API
- `rag_chunks`
  - moves to engine API and later gives way to warehouse-backed evidence endpoints

Rules:

- remove phantom evidence artifacts from the canonical bundle contract once engine endpoints replace them
- do not let the bundle contract imply that rich evidence lives in Parquet by default

## Architecture Boundary

### One canonical evidence boundary

The evidence system should have one clear boundary:

- Next.js owns UI composition, auth/session integration, and graph/app delivery
- FastAPI owns evidence retrieval, evidence assembly, and retrieval orchestration
- PostgreSQL owns canonical truth
- Qdrant later owns high-scale sentence and block retrieval serving

That means the evidence contract is owned by the engine, not by Drizzle models,
not by ad hoc frontend joins, and not by bundle placeholder fields.

### What stays in Next.js

Next.js 16 should own:

- Server Component page composition
- graph bundle discovery and metadata reads
- app shell, panel, and streaming UI
- auth/session handling once auth is enabled
- server-to-server calls to the engine
- optional same-origin BFF endpoints only when the browser needs an HTTP surface

Preferred posture:

- keep database access in Next.js as thin as possible
- prefer engine-backed reads for evidence and retrieval semantics
- use direct SQL only for small app-local metadata reads if they still need to stay in the web app

The current repo uses Drizzle today, but the target architecture does not need it.

If local web-app SQL remains necessary for a small metadata surface such as:

- `solemd.graph_runs`
- bundle metadata
- minimal administrative reads

then the web app can use either:

- the existing Drizzle layer temporarily
- or a thinner direct `postgres` client layer later

Drizzle is not the right long-term layer for:

- evidence retrieval orchestration
- query parsing
- citation-context ranking
- multi-channel fusion
- PostgreSQL plus Qdrant coordination
- warehouse-aware span assembly
- evidence-native response contracts

### Supabase posture

Supabase is not the target replacement for the evidence backend.

For this project, Supabase Data API and PostgREST are schema-facing API layers.
The SoleMD evidence backend still needs custom retrieval semantics, citation
grounding, typed bundle assembly, answer synthesis, and later PostgreSQL plus
Qdrant orchestration.

Use this posture:

- keep canonical evidence reads and writes in FastAPI over direct PostgreSQL connections
- treat Supabase as optional managed infrastructure only if the project later wants:
  - managed Auth
  - managed Storage
  - managed Realtime
  - hosted PostgreSQL operations
- do not make Supabase REST or GraphQL the primary evidence contract
- do not make Supabase Edge Functions the core retrieval, parsing, or warehouse runtime

If Supabase is adopted later, it should be in a complementary role, not as a
substitute for the engine API.

### What stays in FastAPI

FastAPI should own:

- `/api/v1/evidence/...` endpoints
- request validation
- response validation and serialization
- retrieval orchestration across current PostgreSQL tables
- later orchestration across PostgreSQL plus Qdrant
- signed asset URL logic if asset delivery becomes engine-mediated
- retrieval diagnostics, version stamps, and tracing
- worker-triggering or parse/index orchestration endpoints when those land

FastAPI should be structured as a real application, not a single-file app:

- `engine/app/main.py` becomes app assembly
- `engine/app/api/` owns routers
- `engine/app/rag/` owns evidence retrieval logic
- `engine/app/rag_ingest/` owns refresh/backfill/archive/source-locator
  operations

### Server Actions versus Route Handlers

The current frontend already uses Server Actions in `app/actions/graph.ts`.
That remains reasonable, but only as a thin UI adapter.

Use Server Actions for:

- controlled UI-originated operations
- user-initiated search submissions
- graph panel requests that are naturally initiated from the UI
- future write and cite actions

Use Route Handlers for:

- browser-facing HTTP endpoints
- streaming responses that need an HTTP boundary
- public or external clients
- same-origin access from client components when a browser fetch is required

Do not use either of them as the place where retrieval logic lives.
They should delegate to a typed engine client or to the FastAPI API directly.

### Typed contract strategy

The contract should be owned once and generated outward:

1. Pydantic models define the canonical request and response schemas.
2. FastAPI exposes OpenAPI for the versioned evidence endpoints.
3. TypeScript types are generated from OpenAPI for the Next.js app.
4. The frontend uses a thin typed engine client, not hand-maintained duplicate DTOs.

Rules:

- no dual hand-written Python and TypeScript evidence schemas
- no frontend-only reinterpretation of response meaning
- every evidence response carries retrieval version metadata and timing
- every paper or evidence item can carry display-policy metadata

### Type migration strategy

`features/graph/lib/detail-service.ts` is the current de facto frontend payload
surface and should be treated as a migration constraint.

Recommended sequence:

1. define Pydantic models that initially match the current TypeScript payload
   shapes closely enough to avoid gratuitous frontend churn
2. generate TypeScript client and types from FastAPI OpenAPI
3. add a build-time structural equivalence check between generated engine types
   and the current frontend expectations
4. migrate consumers from hand-written engine-facing interfaces to generated types
5. delete superseded hand-written engine-facing interfaces later

Important distinction:

- engine-facing payload interfaces in `detail-service.ts` are part of the migration surface
- DuckDB-local browser-runtime types remain a separate concern

## API Contract

### Versioning

Use a versioned engine API from day one:

- `/api/v1/evidence/search`
- `/api/v1/evidence/papers/{corpus_id}`
- `/api/v1/evidence/papers/{corpus_id}/references`
- `/api/v1/evidence/papers/{corpus_id}/assets`
- `/api/v1/evidence/blocks/{block_id}`
- `/api/v1/evidence/sentences/{sentence_id}`
- `/api/v1/evidence/cite`

Do not publish unversioned evidence endpoints.

### Canonical request and response models

The engine should define these first-class models immediately:

- `PaperRetrievalQuery`
- `RagSearchRequest`
- `RagSearchResponse`
- `PaperEvidenceHit`
- `CitationContextHit`
- `EntityMatchedPaperHit`
- `RetrievalChannelResult`
- `EvidenceBundle`

Recommended response rules:

- `RagSearchResponse` returns bundles, not raw rows
- `RetrievalChannelResult` exposes channel diagnostics for debug and testing
- `EvidenceBundle` always includes paper grounding, not detached text
- future sentence and block results fit under the same bundle contract
- graph overlay hints are a response add-on, not a separate opaque side channel

### Error contract

The current stub pattern in `app/actions/graph.ts` is temporary and not
type-safe enough for the real system.

Define a canonical engine error envelope:

- `EngineErrorResponse`
  - `request_id`
  - `error_code`
  - `error_message`
  - `retry_after_seconds`
  - `details`

Recommended status conventions:

- `400` invalid request
- `401` unauthenticated
- `403` unauthorized
- `404` entity not found
- `409` incompatible graph release or stale request context
- `429` rate limited
- `500` internal engine failure
- `503` dependency unavailable

Frontend rule:

- Server Actions and engine clients should return a typed success-or-error result
- do not cast error payloads into success shapes
- the error path must remain testable without a live engine

### Display-policy contract

Every paper or evidence response should allow a normalized `display` object:

- `display_policy`
- `display_policy_reason`
- `access_status`
- `license`
- `disclaimer`

This is required even before the formal rights/compliance workstream lands.

### Graph integration contract

The evidence API should be able to return lightweight graph hints:

- highlighted `corpus_id`s
- optional evidence ids once evidence nodes exist
- optional citation edges
- optional cluster ids

The graph runtime still owns spatial state.
The engine returns evidence semantics, not canvas instructions.

Graph-side evidence resolution must follow the runtime split:

- active point lookup resolves through `current_paper_points_web`
- overlay promotion writes through producer-owned DuckDB overlay membership
- non-canvas graph widgets stay on `current_points_web` or
  `current_paper_points_web`, never `*_canvas_web`
- rich evidence context, citation neighborhoods, and answer grounding still come
  from FastAPI, not widened point payloads or ad hoc frontend SQL

### Synthesis and streaming

Retrieval and synthesis are distinct stages, but the Ask workflow needs both.

The current frontend already expects a completed answer shape:

- `generateAnswer?: boolean` exists in `detail-service.ts`
- `answer` and `answer_model` already exist in the RAG response payload

Recommended posture:

- keep retrieval in `engine/app/rag/`
- add `engine/app/rag/answer.py` for answer synthesis orchestration
- include answer fields in `RagSearchResponse`
- support both:
  - non-streaming responses for the baseline
  - streaming responses for the interactive Ask path

Preferred UI layer:

- use `Vercel AI SDK` in Next.js if the app keeps an AI-native streaming UX
- keep evidence retrieval and grounding in FastAPI

Transport rule:

- browser streaming may use a same-origin Next.js Route Handler proxy when needed
- server-to-server retrieval remains direct to the engine

### Auth and service identity

The evidence API should not remain implicitly trusted.

Recommended posture:

- local development:
  - simple shared engine token is sufficient
- production:
  - Next.js-authenticated requests should present explicit service or user identity to the engine
- server-to-server:
  - use a dedicated service credential between Next.js and FastAPI

Contract rule:

- every engine request carries a stable request id
- authenticated identity and authorization context are enforced in middleware, not improvised in handlers

## Frontend Integration Plan

### Current frontend posture

The frontend already assumes typed detail and RAG payloads in
`features/graph/lib/detail-service.ts`, and it currently reaches them through
stubbed Server Actions in `app/actions/graph.ts`.

That is the seam to use.

### Integration target

The integration path should be:

1. add a typed engine client in Next.js server code
2. have `app/actions/graph.ts` call that client
3. keep `features/graph/lib/detail-service.ts` as the client-facing interface
4. replace preview placeholder assumptions with evidence-native payloads

This preserves the current UI composition while moving the evidence semantics to
the correct backend boundary.

### Next implementation slice

The next implementation slice should be one boundary-respecting vertical path:

`query -> retrieval channels -> fused evidence bundles -> graph signals -> UI`

This is the right next step because it proves:

- the engine can own evidence semantics
- the graph can react to retrieval without learning retrieval internals
- the frontend can stay thin while still feeling deeply integrated
- later warehouse and Qdrant changes can land behind the same response contract

Do not treat graph-lighting as a separate bolt-on after retrieval.
It is part of the same evidence interaction contract, but it must remain
logically distinct from rendering state.

Implementation constraint for this slice:

- the engine may return graph semantics only
- Next.js may stream AI interaction only
- DuckDB may resolve ids and manage overlay/selection only
- Cosmograph may render the dense active canvas only

If a step needs rich paper detail, citation payloads, or release-aware evidence
semantics, it belongs on the backend contract rather than in hydrated point
metadata or ad hoc frontend SQL.

### Response surface requirement

The answer surface cannot be designed as if the graph disappears during retrieval.

Requirements:

- the graph remains visible while the user reads the answer and evidence
- the answer surface is anchored to the prompt or a nearby docked panel, not a
  full-screen modal takeover
- evidence cards and graph-lighting should be inspectable together
- answer streaming should not break graph interaction or hide the active canvas
- the interactive response surface should be owned by `Vercel AI SDK` in Next.js,
  not improvised directly inside the database or retrieval layer

The initial implementation may keep the current prompt-attached result tray, but
the contract should leave room for a richer docked evidence rail later.

### Composition support and refute requirement

The prompt/editor should gain a deliberate `@`-triggered evidence-assist path.

Target behavior:

- when the user types `@`, the client inspects the current drafting context
- the engine receives the last few sentences or current paragraph, not just the
  raw token after `@`
- the engine can return supporting studies, refuting studies, or both
- the graph can light up the resulting evidence set while the user keeps writing

Design rules:

- this is not generic mention autocomplete
- support and refute are evidence intents, not renderer behaviors
- the retrieval path should be reusable by Ask and Create/Write modes
- the intent contract should be explicit in the API, not inferred from ad hoc UI strings
- `Vercel AI SDK` should own the streamed interaction and composition UX
- the engine should expose typed evidence retrieval tools/endpoints that the AI
  layer calls

### Graph highlight integration

The engine should return graph grounding in terms of stable paper identifiers,
not browser-specific point indices.

The frontend graph path should be:

1. engine response returns `corpus_id` or stable paper ids
2. the browser runtime resolves those ids through DuckDB against the canonical
   active/query aliases, not through JS-hydrated point payloads
3. active hits provide point indices for immediate graph-lighting
4. non-active hits must flow through the overlay activation seam so they become active canvas points instead of remaining passive evidence rows
5. the UI should not reintroduce a client-side highlighted-index mirror; overlay promotion and DuckDB-native scope resolution are the native path for bringing new evidence into view

This preserves separation of concerns:

- engine owns evidence semantics
- DuckDB session owns bundle-local id resolution and overlay promotion
- Zustand and Cosmograph own selection intent and rendering once the relevant points are active

The engine response should therefore include typed graph signals, not just a
flat list of highlighted ids.

Important current constraint:

- `getPaperNodesByGraphPaperRefs(...)` resolves against `current_paper_points_web`, not the full universe
- evidence-driven overlay activation therefore also needs a universe-resolution helper that can map returned `paper_id` values to universe point ids before calling `setOverlayPointIds(...)`
- this is a frontend graph-integration task, not a reason to distort the engine response contract

Recommended near-term signal families:

- `entity_match`
- `semantic_neighbor`
- `citation_neighbor`
- `answer_support`

Each signal should carry:

- stable `corpus_id`
- channel or reason
- score
- rank
- optional explanation metadata

Rules:

- the engine does not emit canvas-specific indices
- the graph client does not reconstruct retrieval meaning from raw tables
- graph highlighting remains derivable from the evidence response, but not
  entangled with renderer-specific state
- new retrieval channels can be added without changing the graph state model
- until overlay sources are namespaced, the Ask flow should reconcile only its
  own last-query overlay subset instead of blindly replacing all overlay
  membership or letting RAG overlay ids accumulate indefinitely

### Role of local SQL after evidence APIs land

Do not grow a second evidence access layer in Next.js.
Once evidence APIs exist, evidence flows through the engine.

Allowed role for local SQL:

- graph-local DuckDB resolution against bundle-backed aliases
- filter/timeline/search/table aggregation over `current_points_web`
- active/universe point resolution and overlay membership management

Disallowed role for local SQL:

- canonical evidence retrieval
- release resolution
- citation-context assembly
- answer grounding that bypasses the engine contract

If the web app still needs a tiny metadata-only SQL surface, that can remain as:

- temporary Drizzle usage
- or a thinner direct SQL client

But the target plan should not require Drizzle.

## Immediate Retrieval Baseline

### Goal

Ship a real engine-side evidence baseline now, using current tables only and no
heavy live-data work.

This baseline should support:

- query to candidate papers
- optional entity filter
- optional relation filter
- optional citation-context boost
- response as evidence bundles

### Indexing strategy for the baseline

This is design work now, not a live migration order.

The baseline path must assume indexed lookup strategies for:

- title and abstract full-text search
- fuzzy or prefix title lookup
- entity filtering on `pubtator.entity_annotations`
- relation filtering on `pubtator.relations`
- citation expansion on `solemd.citations`

Operational note:

- any live index creation should wait until the graph rebuild finishes
- when index work begins, use non-blocking operational patterns where appropriate

### Current-table retrieval channels

The baseline should use only existing tables:

1. paper retrieval from `solemd.papers`
2. citation-context retrieval and boost from `solemd.citations`
3. entity-aware paper filtering from `pubtator.entity_annotations`
4. relation-aware paper filtering or boost from `pubtator.relations`
5. bibliography expansion from `solemd.paper_references`
6. asset lookup from `solemd.paper_assets`

### Baseline ranking flow

Recommended first-pass flow:

1. normalize the free-text query
2. derive optional entity and relation filters
3. retrieve candidate papers from `solemd.papers`
4. apply entity and relation filters if present
5. score citation-context matches from `solemd.citations.contexts`
6. optionally use citation intents as a boost feature
7. assemble final evidence bundles with references and assets
8. return graph highlight ids from the top paper bundles

### Baseline graph interaction contract

The baseline should already support graph-aware interaction, even before the
warehouse exists.

That means the first real response should return:

- evidence bundles for display and inspection
- graph-signal candidates for canvas highlighting
- per-paper reasons explaining why each paper should light up

The first graph-signal sources should be:

- direct entity overlap with the query
- semantic paper similarity
- citation-context support
- final supporting-paper rank

This gives the graph a principled semantic role without forcing the frontend to
reverse-engineer retrieval logic.

### Why this baseline matters

This gives a real evidence loop before the warehouse exists:

- the Ask path can return explainable paper bundles
- the graph can highlight grounded papers
- retrieval and response contracts can be tested
- the future warehouse can replace the retrieval channels without changing the
  public bundle shape

### Baseline response shape

The baseline `EvidenceBundle` should include:

- paper identity and bibliographic metadata
- why the paper matched
- paper-level retrieval score and rank features
- top citation-context hits
- matching entities and relations
- bibliography expansion
- asset references
- display metadata

Do not return bundle-export preview text as if it were evidence.

The top-level response should also include a graph-facing signal collection that
can evolve independently of the evidence bundle internals.

## Engine Package Shape

Build the initial engine surface around a real `engine/app/rag/` package:

- `engine/app/rag/__init__.py`
- `engine/app/rag/types.py`
- `engine/app/rag/models.py`
- `engine/app/rag/schemas.py`
- `engine/app/rag/queries.py`
- `engine/app/rag/repository.py`
- `engine/app/rag/ranking.py`
- `engine/app/rag/bundle.py`
- `engine/app/rag/service.py`
- `engine/app/rag/answer.py`
- `engine/app/rag/tests/`

Add the API layer explicitly:

- `engine/app/api/__init__.py`
- `engine/app/api/rag.py`

Suggested module roles:

- `types.py`: enums, literals, shared aliases
- `models.py`: internal domain models used by the service layer
- `schemas.py`: Pydantic API request and response models
- `queries.py`: SQL text and row-shape comments
- `repository.py`: database read methods only
- `ranking.py`: pure ranking and fusion functions
- `bundle.py`: evidence assembly from row groups to response bundles
- `service.py`: orchestration entrypoint for search and detail reads
- `answer.py`: answer synthesis and streaming orchestration over retrieved evidence
- `api/rag.py`: FastAPI router and endpoint wiring

Rules:

- repository code does not know about HTTP
- API code does not know SQL
- ranking logic is pure and unit-testable
- bundle assembly is deterministic and testable from fixtures

## Evidence Warehouse Target

### Canonical rule

The future warehouse is a span spine first and a retrieval index second.

That means the canonical tables are:

- `paper_documents`
- `paper_document_sources`
- `paper_sections`
- `paper_blocks`
- `paper_sentences`
- `paper_reference_entries`
- `paper_citation_mentions`
- `paper_entity_mentions`
- `paper_relation_mentions`
- `paper_assets`
- `paper_chunk_versions`
- `paper_chunks`
- `paper_chunk_members`

### Reconciliation with current physical tables

The logical model must reconcile with current live tables:

- `solemd.paper_references` remains the physical bibliography-entry substrate and
  evolves toward the logical `paper_reference_entries` contract
- `solemd.paper_assets` remains the physical asset substrate and evolves toward
  the richer asset contract
- `pubtator.entity_annotations` and `pubtator.relations` remain upstream source
  tables, not warehouse replacements

### Non-negotiable modeling rules

1. `paper_document_sources` is mandatory. Source provenance is not optional.
2. Citation edge metadata, bibliography entries, and in-text citation mentions are distinct objects.
3. Exact mention-grounded relations and paper-level PubTator relations are distinct objects.
4. Every span-bearing object carries provenance and alignment status.
5. Chunks are derived products that can always be traced back to canonical spans.

## Structural Parsing Plan

### Source precedence

Preferred canonical text source:

1. `s2orc_v2`
2. BioCXML when `s2orc_v2` is missing or materially weaker
3. abstract-only fallback

Preferred annotation source:

1. BioCXML exact-offset annotations
2. aligned source-native annotations from `s2orc_v2` where applicable
3. projected PubTator abstract-only matches when exact alignment is possible

### `s2orc_v2` parse rules

The parser must use the source structure directly:

- decode nested annotation JSON first
- walk body annotations in source order
- treat `section_header`, `paragraph`, `sentence`, and `bib_ref` as structural signals
- build section hierarchy from section-header metadata and numbering
- build blocks from paragraph annotations
- accept source-native sentence spans when present
- only fall back to deterministic sentence segmentation inside known block boundaries

Observed nuance from sampled local rows:

- annotation groups such as `section_header`, `paragraph`, and `bib_ref` arrive as JSON-encoded strings
- the parser must therefore decode the row, then decode each annotation group

Do not:

- regex section detection
- regex citation extraction
- split the whole document into sentences without block boundaries
- parse chunks first and backfill structure later

### BioCXML parse rules

The BioCXML path must preserve structural semantics:

- parse passages as structured units
- preserve passage type and infons
- preserve figure captions and table captions as first-class blocks
- preserve table payloads as structured assets
- treat inline annotations as the strongest entity-span source

Do not assume relation tags are uniformly present or equally dense across all
BioCXML documents.

### Parallel S2 and BioCXML enrichment posture

BioCXML should not be treated as a strictly serial post-processing stage that
waits for every S2 text decision to be complete.

Preferred posture:

- `s2orc_v2` drives canonical text parsing
- BioCXML runs as a parallel annotation and asset enrichment track
- reconciliation happens in the alignment layer through provenance and confidence

This matches the observed source strengths:

- `s2orc_v2` is strong on structural full text and bibliography linkage
- BioCXML is strong on exact entity offsets, passage metadata, and caption/table surface

### Parser-output contract

Before any warehouse migration or backfill work, define one parser-output
contract that all source-specific parsers target.

The parser stage should emit **normalized parse records**, not chunks,
embeddings, or answer-ready packets.

Every parse record should carry these common fields:

- `corpus_id`
- `source_system`
  - `s2orc_v2`, `biocxml`, or another explicit source id
- `source_revision`
  - source release or content hash
- `source_document_key`
  - source-native document identifier within that source
- `source_plane`
  - e.g. `body`, `bibliography`, `passage`, `front_matter`, `table_xml`
- `parser_version`
- `raw_attrs_json`
  - decoded source attrs/infons for lossless provenance

Every text-bearing parse record should also carry:

- `source_start_offset`
- `source_end_offset`
- `text`

The first parser-output objects should be:

- `paper_document_record`
  - document-level metadata, title, license, language, and source availability
- `paper_section_record`
  - section ordinal
  - parent section ordinal when nested
  - normalized `section_role`
  - display label / numbering token
  - source offsets when available
- `paper_block_record`
  - block ordinal
  - linked section ordinal
  - normalized `paper_block_kind`
  - `is_retrieval_default`
  - optional linked asset ref for figure/table surfaces
- `paper_sentence_record`
  - sentence ordinal inside block
  - linked block ordinal
  - segmentation source
    - `s2orc_annotation` or deterministic fallback
- `paper_reference_entry_record`
  - source reference key
    - `bib_entry.id` from `s2orc_v2` or a BioC `REF`-derived key
  - reference ordinal
  - raw citation text
  - matched paper/corpus ids when directly present
- `paper_citation_mention_record`
  - source citation key
    - `bib_ref.ref_id` or aligned equivalent
  - linked block ordinal
  - linked sentence ordinal when known
  - surface text and offsets
  - matched paper/corpus ids when directly present

Optional parse outputs can follow the same contract later:

- `paper_entity_mention_record`
- `paper_relation_mention_record`
- `paper_asset_record`

Entity-mention records should be designed for grounding, not just filtering.

Minimum fields:

- `entity_type`
- `source_identifier`
  - source-native concept or mention identifier as emitted by the source
- `concept_namespace`
  - populated only when the parser can map the source identifier safely
- `concept_id`
  - normalized concept id inside that namespace
- linked block / sentence ordinals when alignment is known

Normalization rule:

- preserve raw source identifiers even when namespace inference is uncertain
- only populate `concept_namespace` when the source semantics make that mapping
  safe
- do not force brittle one-size-fits-all inference for every disease, chemical,
  or mutation id at parse time
- later query-time entity normalization should target the same
  `concept_namespace` / `concept_id` pair used in the warehouse mention layer

Source-specific mapping rules:

- `s2orc_v2`
  - `body.annotations.section_header` -> `paper_section_record`
  - `body.annotations.paragraph` -> `paper_block_record`
  - `body.annotations.sentence` -> `paper_sentence_record` when present
  - `body.annotations.bib_ref` -> `paper_citation_mention_record`
  - `bibliography.annotations.bib_entry` -> `paper_reference_entry_record`
- BioCXML
  - `passage.section_type` + `passage.type` -> section and block records
  - `fig_caption` -> `paper_block_record(block_kind='figure_caption')`
  - `table_caption` -> `paper_block_record(block_kind='table_caption')`
  - `table_footnote` -> `paper_block_record(block_kind='table_footnote')`
  - `type='table'` with XML payload -> `paper_asset_record` plus optional
    `paper_block_record(block_kind='table_body_text')` when a stable text
    projection exists
  - `section_type='REF'` / `type='ref'` -> `paper_reference_entry_record`
  - inline `<annotation>` -> `paper_entity_mention_record`

Parser invariants:

1. Preserve source order. Section, block, sentence, and reference ordinals must
   reflect source order, not downstream ranking order.
2. Keep offsets lossless. Do not replace source offsets with normalized offsets;
   carry both if later alignment adds canonical offsets.
3. Do not fabricate exact structure. If sentence alignment or section nesting is
   uncertain, record bounded confidence instead of pretending it is exact.
4. Keep parse and alignment separate. Parsers emit source-normalized records;
   the alignment layer decides canonical merges or conflicts across sources.
5. Do not emit chunks here. Chunk derivation belongs after canonical span
   assembly.

### Provisional warehouse-row contract for grounded mentions

After parser output, but before chunks or synthesis, the warehouse should
persist aligned mention rows separately from source-local parse records.

First row families:

- `paper_citation_mentions`
- `paper_entity_mentions`

Every persisted mention row should carry:

- common source provenance
  - `corpus_id`
  - `source_system`
  - `source_revision`
  - `source_document_key`
  - `source_plane`
  - `parser_version`
  - `raw_attrs_json`
- source-local text payload
  - `source_start_offset`
  - `source_end_offset`
  - `text`
- alignment metadata
  - `span_origin`
    - `primary_text` or `annotation_overlay`
  - `alignment_status`
    - `exact`, `bounded`, or `source_local_only`
  - `alignment_confidence`
  - canonical ordinals when known
    - `canonical_section_ordinal`
    - `canonical_block_ordinal`
    - `canonical_sentence_ordinal`

`paper_citation_mentions` should also carry:

- `source_citation_key`
- `source_reference_key`
- matched paper/corpus ids when available

`paper_entity_mentions` should also carry:

- `entity_type`
- `source_identifier`
- `concept_namespace`
- `concept_id`

Rule:

- parse records may carry source-local ordinals
- warehouse mention rows may carry canonical ordinals
- do not silently reuse source-local ordinals as canonical ordinals for overlay
  sources like BioCXML unless an alignment step explicitly says so

Non-goals for the parser stage:

- no regex citation recovery
- no chunk generation
- no embeddings
- no answer synthesis
- no forced cross-source deduplication beyond direct matched ids already
  present in the source

### Alignment rules

Canonical text choice and canonical annotation choice are separate decisions.

Every imported span-bearing object should carry:

- `span_origin`
- `alignment_status`
- `alignment_confidence`
- source-local offsets when exact canonical alignment fails

Allowed outcomes:

- aligned exactly
- aligned with bounded confidence
- source-local only

Never fabricate false exact spans to satisfy schema cleanliness.

## Retrieval Plane Strategy

### Near term

The current-table baseline stays entirely in PostgreSQL.

That is enough for:

- paper-level retrieval
- citation-context enrichment
- entity and relation filtering
- bibliography and asset bundle assembly

### Future

Once the warehouse exists, sentence and block serving should move toward Qdrant.

Planned Qdrant collections:

- `evidence_blocks`
- `evidence_sentences`
- later `evidence_captions`

Qdrant payloads should stay lightweight and denormalized enough for filtering:

- `corpus_id`
- `paper_id`
- `section_canonical`
- `block_kind`
- `year`
- `has_citation`
- `entity_concept_ids`
- `relation_keys`
- `display_policy`

PostgreSQL remains canonical for:

- text truth
- provenance
- asset metadata
- display policy
- retrieval version state
- backfills and audit

### Launch-scale indexing strategy

To support `14M+` full-text articles and a `200M+` paper catalog, the retrieval
plane should be staged as follows:

1. global paper recall index across the full paper catalog
2. global block or chunk recall index across the full-text subset
3. sentence lookup and grounding in canonical PostgreSQL after the first-pass
   recall step

This avoids the worst scaling trap:

- indexing every sentence as a first-pass ANN object before the system needs it

### Canonical storage implications

The warehouse design should assume partitioned high-volume tables from the
beginning for:

- `paper_blocks`
- `paper_sentences`
- `paper_citation_mentions`
- `paper_entity_mentions`
- `paper_relation_mentions`
- `paper_chunks`
- `paper_chunk_members`

Partitioning details can be finalized later, but the schema should not assume a
single small-table posture.

### Provisional deferred DDL posture

The warehouse migration design should now follow the explicit code contract in:

- `engine/app/rag/migration_contract.py`
- `engine/app/rag/index_contract.py`
- `engine/app/rag/rag_schema_contract.py`
- `engine/app/rag_ingest/write_contract.py`
- `engine/app/rag_ingest/write_repository.py`
- `engine/app/rag_ingest/write_sql_contract.py`

Current intended table posture:

- non-partitioned:
  - `paper_documents`
  - `paper_document_sources`
  - `paper_sections`
  - `paper_reference_entries`
  - `paper_chunk_versions`
- hash-partitioned on `corpus_id`:
  - `paper_blocks`
  - `paper_sentences`
  - `paper_citation_mentions`
  - `paper_entity_mentions`
  - `paper_chunks`
  - `paper_chunk_members`

Current intended key/index posture:

- `paper_document_sources`
  - unique source identity across
    `(source_system, source_revision, source_document_key, source_plane)`
- `paper_sections`
  - primary key `(corpus_id, section_ordinal)`
  - parent-section lookup index
- `paper_blocks`
  - primary key `(corpus_id, block_ordinal)`
  - section lookup index
  - retrieval-default partial index by `(corpus_id, section_role, block_kind)`
- `paper_sentences`
  - primary key `(corpus_id, block_ordinal, sentence_ordinal)`
  - block lookup index
- `paper_reference_entries`
  - primary key `(corpus_id, reference_ordinal)`
  - unique `(corpus_id, source_reference_key)`
  - partial lookup on `matched_corpus_id`
- `paper_citation_mentions`
  - canonical-span lookup index
  - source-citation-key lookup index
- `paper_entity_mentions`
  - concept lookup index on `(concept_namespace, concept_id, corpus_id)`
  - canonical-span lookup index
- `paper_chunks`
  - primary key `(chunk_version_key, corpus_id, chunk_ordinal)`
  - lookup index on `(chunk_version_key, corpus_id)`
- `paper_chunk_members`
  - primary key `(chunk_version_key, corpus_id, chunk_ordinal, member_ordinal)`
  - block lineage lookup index
  - partial sentence lineage lookup index
- heavier lexical-fallback indexes on canonical block/chunk text expressions
  if the current `to_tsvector('english', coalesce(text, ''))` posture proves
  insufficient for biomedical lexical fallback
  - deferred to a post-load / rebuild-safe phase
  - should be built concurrently if the tables are already live
- no pgvector ANN index should be the first warehouse default on canonical
  span tables
  - PostgreSQL owns structural lookup, lineage, grounding, and lexical fallback
  - first-pass dense ANN remains a future Qdrant concern

### Provisional deferred write posture

The future warehouse writer should now follow the explicit stage planner in:

- `engine/app/rag_ingest/write_repository.py`
- `engine/app/rag_ingest/write_sql_contract.py`

Current intended stage order:

1. `documents`
2. `document_sources`
3. `sections`
4. `blocks`
5. `sentences`
6. `references`
7. `citations`
8. `entities`
9. `chunk_versions`
10. `chunks`
11. `chunk_members`

Current intended write-method posture:

- default to `copy_stage_upsert` for row-heavy warehouse tables, including
  documents, sections, references, canonical spans, mentions, chunks, and
  chunk members
- reserve `upsert_rows` for tiny policy/config tables such as
  `paper_chunk_versions`
- keep SQL templates repo-native:
  `_stg_*` temp tables, explicit COPY column order, and
  `INSERT ... SELECT ... ON CONFLICT` merges for staged tables
- keep this as a deferred contract only until the rebuild-safe window opens;
  do not implement live warehouse writes yet

Operational rule:

- this is still a deferred migration contract
- do not apply these tables or indexes while the graph rebuild / publish work is
  still running
- when the time comes, index creation must be staged and measured rather than
  fired indiscriminately

Deferred migration sequence when the rebuild window is clear:

Code contract:

- `engine/app/rag/migration_contract.py`

1. low-volume canonical tables first
   - `paper_documents`
   - `paper_document_sources`
   - `paper_sections`
   - `paper_reference_entries`
   - `paper_chunk_versions`
2. high-volume canonical span tables next
   - `paper_blocks`
   - `paper_sentences`
3. aligned mention tables after canonical spans exist
   - `paper_citation_mentions`
   - `paper_entity_mentions`
   - optional `paper_relation_mentions`
4. derived serving tables last
5. chunk runtime cutover only after derived serving tables, chunk writes, and
   default chunk-version backfill exist
   - `paper_chunks`
   - `paper_chunk_members`
   - inspect the deferred cutover preview under `engine/db/scripts` before
     applying any runtime-serving switch
6. only then stage the heavier secondary indexes, preferably with concurrent
   creation where appropriate

## Workstream Dependencies

Use this dependency graph explicitly:

- Workstream A -> Workstream B
- Workstream A -> Workstream C
- Workstream A -> type generation and client migration
- Workstream D -> Workstream E
- Workstream D -> Workstream F
- Workstream E -> Workstream F
- Workstream B -> Workstream C

Interpretation:

- engine contracts come first
- baseline retrieval can ship before the warehouse
- frontend integration depends on engine contracts and the baseline
- parsing and Qdrant work depend on warehouse structure being real
- chunk and sentence serving work cannot float free of the warehouse spine

## Workstreams

### Workstream A: Engine baseline and contracts

Deliverables:

- `engine/app/rag/` package scaffold
- canonical Pydantic request and response models
- versioned FastAPI evidence router
- typed Next.js engine client plan
- type migration plan from current hand-written frontend payload interfaces to generated types
- canonical error envelope
- unit tests for ranking and bundle assembly
- development environment contract for engine URL, credentials, and local startup

### Workstream B: Current-table retrieval baseline

Deliverables:

- paper retrieval repository methods
- citation-context repository methods
- entity and relation filter methods
- bibliography and asset expansion methods
- `rag.service.search(...)` baseline
- indexing design for title, abstract, entity, relation, and citation lookup
- non-streaming answer synthesis baseline when `generate_answer = true`

### Workstream C: Frontend and graph integration

Deliverables:

- replace stubbed `app/actions/graph.ts` with engine-backed calls
- align `detail-service.ts` payloads to the engine contract
- add graph highlight hints to evidence responses
- resolve returned paper ids through DuckDB against the active canvas first
- add the universe-resolution path needed to promote non-active evidence papers into overlay/active canvas state
- keep evidence-driven graph sync on DuckDB alias resolution and overlay producer state, not a JS highlighted-index mirror
- preserve or replace the current detail-service cache intentionally
- wire completed answers first, then streaming answers

### Workstream D: Evidence warehouse migrations

Deliverables:

- migration plan for the span spine
- reconciliation plan for `paper_references` and `paper_assets`
- source provenance tables

### Workstream E: Structural parsing and ingest

Deliverables:

- `s2orc_v2` structural parser
- BioCXML overlay parser
- alignment layer
- abstract-only fallback path

Prerequisite:

- warehouse spine tables from Workstream D must exist before this becomes more than parser prototyping

### Workstream F: Derived retrieval products and Qdrant

Deliverables:

- chunk versioning
- chunk derivation
- sentence and block retrieval read models
- Qdrant sync contracts
- retrieval evaluation harness

Prerequisites:

- Workstream D warehouse tables
- Workstream E parsed and aligned canonical spans

## Observability

The evidence stack needs observability from the first real API pass.

Minimum contract:

- structured logs with request ids
- latency metrics for retrieval and answer synthesis
- retrieval version stamping in responses
- engine-side tracing hooks for search, bundle assembly, and answer generation

The initial pass does not need a large observability rollout, but it does need
stable identifiers and structured instrumentation.

## Development Environment

The plan should assume a documented local engine environment.

Minimum expected configuration:

- `ENGINE_URL`
- `ENGINE_API_KEY` or equivalent dev credential
- local FastAPI run command
- local PostgreSQL connection contract
- later Qdrant connection contract

This should remain lightweight, but the engine cannot stay implicit.

## Immediate Deliverables While The Graph Rebuild Runs

Do now:

1. finalize this plan and retire the duplicate spec doc
2. create the `engine/app/rag/` scaffold
3. define the canonical evidence request and response schemas
4. define the graph-signal response contract alongside the evidence bundle contract
5. define the answer-surface contract that preserves graph visibility
6. define the `@`-triggered support/refute interaction contract in docs before UI implementation
7. implement light repository helpers over current tables only
8. implement the baseline ranking and bundle assembly logic
9. wire graph-signal projection from the baseline retrieval outputs
10. add pure unit tests with fixtures and mocked rows
11. define the Next.js to engine client boundary
12. define the warehouse tables and parse stages in docs only

Do not do yet:

- live warehouse migrations
- full-text backfills
- chunk generation jobs
- embedding jobs
- large index builds
- large joins and scans on the live database

Allowed now:

- targeted `LIMIT` reads
- schema inspection
- doc and contract work
- unit tests with fixtures

## Build Order

### Phase 0: Contract-first baseline

1. ship the engine package scaffold
2. ship `rag.service.search(...)` over current tables
3. ship typed evidence bundles and typed graph signals
4. wire Next.js server-side adapters to the engine
5. resolve returned paper ids through DuckDB against the active canvas
6. promote non-active evidence papers through the overlay path so they can become active canvas points
7. prove the end-to-end Ask -> evidence -> graph-lighting and overlay-activation loop
8. define the stable answer surface for Ask mode
9. define the reusable support/refute interaction path for `@` in composition mode

### Phase 1: Warehouse spine

1. add warehouse migrations after the graph rebuild is done
2. build `paper_documents` through `paper_sentences`
3. add citation, bibliography, entity, relation, and asset enrichment

### Phase 2: Derived retrieval products

1. add `paper_chunk_versions`
2. add `paper_chunks`
3. add `paper_chunk_members`
4. build retrieval evaluation on sentence, block, and chunk outputs

### Phase 3: Production retrieval plane

1. add Qdrant sync state
2. stand up `evidence_blocks`
3. stand up `evidence_sentences`
4. compare against PostgreSQL baseline
5. switch serving only after evaluation justifies it

## Definition Of Done For The Current Pass

This pass is done when:

- the evidence plan is canonical and no longer split across duplicate active docs
- the engine-side package shape is locked
- the API boundary is explicit
- Drizzle versus FastAPI responsibilities are explicit
- the current-table retrieval baseline is fully specified
- the future warehouse is defined as a span spine with derived chunks
- the parsing plan is explicitly structural and non-regex
- the work can proceed without starting heavy live database work

## Sources

### Local repo references

- `docs/design/living-graph.md`
- `docs/map/database.md`
- `docs/map/data.md`
- `docs/map/architecture.md`
- `engine/app/db.py`
- `engine/app/main.py`
- `engine/app/graph/export_bundle.py`
- `app/actions/graph.ts`
- `features/graph/lib/detail-service.ts`
- `lib/db/index.ts`
- `lib/db/schema.ts`

### External guidance consulted

- Next.js guidance on Server Actions, Route Handlers, and backend-for-frontend patterns
- FastAPI guidance on APIRouter structure and response-model validation
- Pydantic guidance on schema generation and typed validation
- Supabase guidance on Data APIs, direct Postgres connections, and platform architecture
- DuckDB guidance on querying Parquet directly, projection/filter pushdown, and
  choosing views versus loaded tables
- Cosmograph guidance on `pointIndexBy`, `pointIncludeColumns`, dense indexed
  point tables, and local database update callbacks
- Qdrant guidance on hybrid search and reranking for future sentence and block serving
