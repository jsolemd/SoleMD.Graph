# 05a — Chunking

> **Status**: locked for the inventory of reusable existing chunker surfaces, the
> evidence-key derivation contract, the policy-registry as a code-generated
> artifact (sibling to `enum-codes.yaml`), the `paper_evidence_units`
> writer shape, and the canonical worker-placement decision (Dramatiq
> actor `chunker.assemble_for_paper`). **Provisional**: the policy-registry
> YAML key set, the `chunk_assembly_errors` sidecar table, the per-paper
> `time_limit` budget, and the `paper_evidence_units` partitioning
> trigger row count.
>
> **Date**: 2026-04-17
>
> **Scope**: the seam between the warehouse grounding spine
> (`paper_blocks` / `paper_sentences`, `02 §774`/§789) and the chunk
> tables that hot-tier OpenSearch consumes (`paper_chunks`,
> `paper_chunk_members`, `paper_chunk_versions`, `paper_evidence_units`,
> `02 §841`/§856/§868/§883). Sentence segmentation backends, structural
> chunk assembly, narrative classification, and tokenizer wiring already
> exist in `engine/app/rag_ingest/`; this document inventories them and
> locks the three boundary contracts that bridge them into the new
> architecture.
>
> **Schema authority**: this document is the runtime / writer authority
> for the chunking lane. Schema columns and `evidence_key` derivation are
> defined in `02 §0`/§2/§4.5 and not restated here. Pool placement is
> defined in `06 §2.1`/§6 and not restated here. Cohort-level coupling
> to projection lives in `04 §5.1` and is referenced, not re-authored.

## Purpose

Lock the three deltas required to take the reusable in-tree chunker
inventory (~3 000 lines under `engine/app/rag_ingest/`, ~86 % of the
spec already working) and wire it into the warehouse / projection
contracts that 04, 05, 06, 07 were authored against. There is no
greenfield design in this lane, but there is also no "legacy file is
authority" rule: current code is salvage inventory, and the behavioral
contracts in this doc win if the archive and the rebuild diverge. There
is one new write surface (`paper_evidence_units`), one new YAML registry
(`chunk-policies.yaml`), and one canonical worker placement (Dramatiq
`chunker.assemble_for_paper`).

Five load-bearing properties:

1. **Sentence segmentation is the canonical spine, and the existing
   chunker is salvage inventory rather than authority.** Source-aware
   sentence routing, structural
   assembly, narrative classification, tokenizer routing, semchunk
   overflow refinement, and the `RagWarehouseWriteBatch` plumbing are
   already implemented and tested. This document does not redesign
   them; it inventories the reusable surfaces in §2 and carries them
   forward only where they agree with the warehouse / retrieval
   contracts. OpenSearch retrieval docs are derived from this
   canonical sentence/block spine; they do not replace it.
2. **`evidence_key` is the only new identity.** Every other identity
   (`chunk_version_key`, `corpus_id`, ordinals) is already populated by
   the existing pipeline. `evidence_key` is the deterministic UUIDv5
   per `02 §2`/§506 that round-trips OpenSearch hits to canonical
   coordinates. It is computed by a new writer
   (`evidence_unit_writer.py`, §5) and persisted to
   `paper_evidence_units`.
3. **The chunk-policy registry is generated, not authored.**
   `db/schema/chunk-policies.yaml` is the single source of truth, on
   the same generator-as-build-step pattern as `enum-codes.yaml`
   (`12 §4`). Today's registry has one entry —
   `default-structural-v1` — that mirrors the constants currently
   hardcoded in `chunk_policy.py` lines 21–36. No behavior change at
   first apply.
4. **Dramatiq is the canonical chunk-assembly path.** Steady-state
   chunking runs as `chunker.assemble_for_paper(corpus_id,
   chunk_version_key, ingest_run_id)`, fanned out by the ingest-side
   orchestrator/dispatcher during the same warehouse-up window that
   publishes `ingest_runs`. The orchestrator-inline `--backfill-chunks`
   mode that exists today (`orchestrator.py:1376`) becomes the dev /
   bench path.
5. **All chunkable papers get canonical derivation; only hot-tier
   papers get indexed into the evidence lane.** `paper_chunks` /
   `paper_chunk_members` / `paper_evidence_units` are canonical-derived
   per `02 §0` and populated for every paper with chunkable text
   surfaces. Abstract-only or otherwise thin papers may yield a
   minimal evidence surface or no chunk rows at all. Hot / warm tiering
   is owned by `serving_members` (`07 §3.5`) and is purely an
   OpenSearch-side decision. Promotion does not run the chunker; the
   canonical rows already exist.

## §0 Conventions delta from `02` / `05` / `06` / `12`

Inherits every convention from `02 §0`, `05 §0`, `06 §0`, `12 §0`.
Adds the chunk-lane-specific rules below; nothing here weakens those
docs.

| Concern | This doc adds |
|---|---|
| **Policy registry as code-generated artifact** | `db/schema/chunk-policies.yaml` is a sibling to `db/schema/enum-codes.yaml` (`12 §4`). The Python module `engine/app/rag_ingest/_policy_registry.py` and the `paper_chunk_versions` insert ledger are *generated* from it, never hand-written. CI parity check on diff. (§4) |
| **Chunker inventory is salvage material, not authority** | The 3 000-line surface enumerated in §2 is the reusable inventory for the rebuild. Refactors that change algorithm shape still require a §9 amendment in `12-migrations.md` plus an explicit revision of this doc, but current file:line references are inventory breadcrumbs, not a "legacy canon" override of this spec. |
| **One new write path** | `paper_evidence_units` (`02 §883`) is the only new write surface introduced by this lane. Owned by `evidence_unit_writer.py` (§5) on the `ingest_write` pool (`06 §2.1`). |
| **Chunking is a per-paper unit** | Each `chunker.assemble_for_paper` actor invocation operates on exactly one `(corpus_id, chunk_version_key)` pair. No batch-spanning state. (§6) |
| **Re-chunk by minting new `chunk_version_key`** | A policy edit never mutates existing rows. It mints a new `chunk_version_key`, runs the actor across the full corpus under the new key, then atomically flips `paper_chunk_versions.is_active` (`02 §851` partial unique index does the work). Old rows survive for rollback. (§7) |

## §1 Identity / boundary

No new identity types beyond `02 §2`. This section locks the constant
that makes `evidence_key` deterministic.

### 1.1 SOLEMD namespace UUID — locked

Per `02 §2` and the formula reproduced in `05 §504-509`, `evidence_key`
is `uuid.uuid5(SOLEMD_NS, payload)` where `SOLEMD_NS` is a fixed,
project-wide v5 namespace UUID. RFC 9562 §5.5 defines the v5
namespace-uuid construction; the namespace itself is an arbitrary but
*permanent* UUID that the project picks once and never changes
(<https://www.rfc-editor.org/rfc/rfc9562.html>).

```python
# engine/app/rag_ingest/evidence_unit_writer.py — locked constant
import uuid
SOLEMD_NS: uuid.UUID = uuid.UUID("5f0e6d9c-c1c8-5dfb-9a0a-3a0a3a0a3a0a")
```

This is the same byte sequence already pinned in `05 §505`. **locked**.
Recovering from a wrong namespace requires a corpus-wide re-derivation
of every `paper_evidence_units` row and a full `evidence_index`
rebuild — non-trivial but bounded. The constant is exported once from
`evidence_unit_writer.py` and imported by every caller; no other
module instantiates a v5 namespace UUID for grounding-keyed identities.

### 1.2 `evidence_key` formula — locked

```python
def evidence_key(
    corpus_id: int,
    kind_code: int,         # paper_evidence_units.evidence_kind SMALLINT (02 §883)
    section_ord: int,
    block_ord: int,
    sent_start: int,
    sent_end: int,
    chunk_version_key: uuid.UUID,
) -> uuid.UUID:
    payload = (
        f"{corpus_id}|{kind_code}|{section_ord}|{block_ord}"
        f"|{sent_start}|{sent_end}|{chunk_version_key}"
    )
    return uuid.uuid5(SOLEMD_NS, payload)
```

Pipe-separator with no padding, decimal `int` repr, UUID rendered as
hyphenated lowercase string per Python's `str(UUID)` default. Audit
recompute in `02 §5` invariant 2 uses the same payload spelling.

`kind_code` maps to the SMALLINT enum in `paper_evidence_units.evidence_kind`
(`paragraph` | `results_paragraph` | `abstract_conclusion` |
`sentence_window`, `02 §883`). The enum landing place is
`db/schema/enum-codes.yaml` (`12 §9` ledger row 14 anticipates the
initial enum population; `evidence_kind` adds to it — see
**Upstream amendments needed** at the end of this doc).

## §2 Inventory of existing chunker

The existing `engine/app/rag_ingest/` chunker is roughly 3 000 lines of
production Python with full test coverage. The table below is the
salvage inventory for the rebuild: it enumerates every component this
document may reuse, the file:line range that currently contains it, and
whether this doc treats it as **locked** (carry forward as-is), **adapt**
(small wiring change at the boundary), or **new** (this doc authors it).
All file paths are relative to the repository root. The inventory is not
the authority; this document is.

| # | Component | File:line | Status | Notes |
|---|---|---|---|---|
| 1 | Sentence-segmentation router | `engine/app/rag_ingest/sentence_segmentation.py:327-440` | **locked** | `RoutingSentenceSegmenter`: Stanza biomedical (craft + genia packages), Syntok prose, deterministic fallback, S2ORC annotation short-circuit. |
| 2 | Default segmenter factory | `engine/app/rag_ingest/sentence_segmentation.py:442-444` | **locked** | `build_default_sentence_segmenter()` (lru-cached). |
| 3 | Token-budget protocol + backends | `engine/app/rag_ingest/tokenization.py:30-39, 41-83, 419-457` | **locked** | `ChunkTokenBudgeter` Protocol; semchunk semantic split (`split_text_semantically`); tiktoken / Stanza-bio / regex backends; `build_chunk_token_budgeter()` resolver. |
| 4 | Default tokenizer metadata | `engine/app/rag_ingest/tokenization.py:460-470` | **locked** | `default_chunk_tokenizer_metadata()` — feeds `PaperChunkVersionRecord.tokenizer_name` / `tokenizer_version`. |
| 5 | Structural chunk assembly | `engine/app/rag_ingest/chunking.py:928-1464` | **locked** | `assemble_structural_chunks()`: three-stage block-filter → atom-build → group-merge pipeline; narrative / table / structured classification; figure-caption merge; semchunk overflow refinement. |
| 6 | Narrative classifier | `engine/app/rag_ingest/narrative_structure.py:1-661` | **locked** | `classify_narrative_block()` returning `NarrativeBlockClass` (`PROSE` / `STRUCTURED` / `TABLE_LIKE` / `METADATA` / `PLACEHOLDER`). |
| 7 | Weak-chunk detector | `engine/app/rag_ingest/chunk_quality.py:9, 77` | **locked** | `MIN_USEFUL_NARRATIVE_TOKENS = 15`; `is_weak_short_narrative_chunk_text()`. |
| 8 | Section-context prepender | `engine/app/rag_ingest/section_context.py:1-331` | **locked** | `build_section_contexts()` — feeds heading text into chunk text where `lexical_normalization_flags` includes `section_heading_context`. |
| 9 | BioCXML parser | `engine/app/rag_ingest/source_parsers.py:parse_biocxml_document` | **locked** | Source of `paper_blocks` + `paper_sentences` rows, with offsets that feed `evidence_key` derivation per §1.2. |
| 10 | S2ORC parser | `engine/app/rag_ingest/source_parsers.py:parse_s2orc_row, parse_s2orc_overlay` | **locked** | Same shape; sets `segmentation_source = S2ORC_ANNOTATION` so the routing segmenter short-circuits. |
| 11 | Default chunk-version policy | `engine/app/rag_ingest/chunk_policy.py:21-36, 57-97` | **adapt** | Constants block (target_token_budget, hard_max_tokens, included_section_roles, included_block_kinds, lexical_normalization_flags) lifted verbatim into `chunk-policies.yaml::default-structural-v1`. `build_default_chunk_version()` retained as thin shim that delegates to the new `build_chunk_version_from_registry()`. (§4) |
| 12 | Plan / sources policy builders | `engine/app/rag_ingest/chunk_policy.py:100-127` | **locked** | `build_default_chunk_version_for_plan()` / `_for_sources()` — internal callers stay; signatures unchanged. |
| 13 | Write-batch chunk extension | `engine/app/rag_ingest/write_batch_builder.py:264-304` | **adapt** | `extend_write_batch_with_structural_chunks()` already populates `chunks` + `chunk_members`. §5 adds an `extend_write_batch_with_evidence_units()` sibling that runs after this and populates `evidence_units`. No edits to the existing function. |
| 14 | Chunk-version seeder | `engine/app/rag_ingest/chunk_seed.py:1-117` | **locked** | `RagChunkSeeder.seed_default*()` — used by `engine/db/scripts/seed_default_chunk_version.py`. Continues to work; the registry generator (§4) calls the same writer with the registry-derived `PaperChunkVersionRecord`. |
| 15 | Backfill writer (sync, batch-oriented) | `engine/app/rag_ingest/chunk_backfill.py:1-144` + `engine/app/rag_ingest/chunk_backfill_runtime.py:1-491` | **adapt** | `RagChunkBackfillWriter` and `run_chunk_backfill()` are today a *synchronous, checkpointed batch* runner — not a Dramatiq actor. §6 wraps a per-paper slice of this code as the canonical Dramatiq actor body. The batch runner stays for dev / bench. |
| 16 | Orchestrator-inline mode | `engine/app/rag_ingest/orchestrator.py:1375-1603, 2137-2150` | **adapt** | `--seed-chunk-version` and `--backfill-chunks` flags continue to work. §6 declares this mode dev-only; the steady-state path is the Dramatiq actor. |
| 17 | CLI scripts | `engine/db/scripts/preview_chunk_seed.py`, `engine/db/scripts/seed_default_chunk_version.py`, `engine/db/scripts/preview_chunk_runtime.py`, `engine/db/scripts/inspect_chunk_runtime.py`, `engine/db/scripts/backfill_structural_chunks.py` | **locked** | Existing CLI surface kept. §4 adds `engine/db/scripts/generate_chunk_policies.py`; §7 adds `engine/scripts/activate_chunk_policy.py`. |

Test fixtures pinned by this contract: `test_rag_chunking.py`,
`test_rag_chunk_policy.py`, `test_rag_chunk_backfill.py` +
`test_rag_chunk_backfill_checkpoint.py`, `test_rag_chunk_seed.py`,
`test_rag_seed_chunk_version.py`, `test_rag_chunk_runtime_contract.py`,
`test_rag_chunk_grounding.py`, `test_rag_chunk_cutover.py` (all under
`engine/test/`).

Headline: **~3 000 lines exist; ~86 % is likely reusable.** The three
gaps this doc closes are the registry (§4), the `paper_evidence_units`
writer (§5), and the canonical Dramatiq actor placement (§6).

## §3 Locked schema contracts

These contracts live in `02-warehouse-schema.md`. This section is a
cross-reference index, not a restatement.

| Contract | Owner | Key shape |
|---|---|---|
| Sentence segmentation | `paper_sentences` (`02 §789`) | Hash × 32 by `corpus_id`; `segmentation_source SMALLINT` enum (`S2ORC_ANNOTATION` / `STANZA_BIOMEDICAL` / `SYNTOK` / `DETERMINISTIC_FALLBACK`). Routed in `sentence_segmentation.py:412-440`. Policy filter at `chunking.py:962-965`. |
| Chunk-version policy lifecycle | `paper_chunk_versions` (`02 §841`) | `chunk_version_key UUID` (uuidv7); partial unique indexes on `is_active=true` and `is_default=true` per `02 §851`. |
| Chunk membership | `paper_chunks` + `paper_chunk_members` (`02 §856`/§868) | Both hash × 32 by `corpus_id`. Already written by `extend_write_batch_with_structural_chunks()` at `write_batch_builder.py:264-304`. |
| Evidence-key formula + table | `paper_evidence_units` (`02 §883`) | PK = `evidence_key UUID` (UUIDv5, §1.2). FK → `paper_chunk_versions`. Btree `(corpus_id, chunk_version_key, block_ordinal, sentence_start_ordinal)` for inverse lookup; `(chunk_version_key, corpus_id)` for version sweeps. Unpartitioned; trigger at >50 M rows per `02 §1089`. |

`evidence_kind` is a *projection-time* classification the writer in §5
derives from the chunk's primary block-kind / section-role (§5.2). It
lives only on `paper_evidence_units` because it is part of the
`evidence_key` payload.

## §4 Policy registry — `chunk-policies.yaml`

The existing chunker reads its policy from constants hardcoded in
`engine/app/rag_ingest/chunk_policy.py:21-36`. The registry replaces
those constants with a YAML file on the same generator-as-build-step
pattern that `enum-codes.yaml` uses (`12 §4`, `12 §139`).

### 4.1 File location

`db/schema/chunk-policies.yaml` — sibling to `db/schema/enum-codes.yaml`
and the warehouse SQL schema directory (`12 §1`). Single source of truth.

### 4.2 YAML schema (one entry per `policy_key`)

```yaml
# db/schema/chunk-policies.yaml
schema_version: 1
policies:
  default-structural-v1:
    notes: >
      Initial canonical policy. Lifted verbatim from
      engine/app/rag_ingest/chunk_policy.py:21-36 (2026-04-17).
    target_token_budget: 256
    hard_max_tokens: 384
    text_normalization_version: canonical-text-v1
    tokenizer_name: stanza_biomedical
    embedding_model: null            # null → tokenizer_name selection wins
    caption_merge_policy: structural_context
    sentence_overlap_policy: none
    retrieval_default_only: true
    sentence_source_policy:
      - s2orc_annotation
      - stanza_biomedical
      - syntok
      - deterministic_fallback
    included_section_roles:
      - abstract
      - introduction
      - methods
      - results
      - discussion
      - conclusion
      - supplement
      - other
    included_block_kinds:
      - narrative_paragraph
      - figure_caption
      - table_caption
      - table_body_text
    lexical_normalization_flags:
      - chunker:hybrid_structural_v3
      - table_header_repeat
      - table_header_omit_on_overflow
      - peer_merge_by_context
      - section_heading_context
      - section_context_carryforward_for_noncontextual_labels
      - section_context_excludes_repeated_nonstructural_labels
      - narrative_block_structure_classifier
      - metadata_residue_suppression
      - semchunk_overflow_refinement
```

Field shape mirrors `PaperChunkVersionRecord`
(`engine/app/rag/serving_contract.py:34-60`) minus the per-build
`source_revision_keys` / `parser_version` (those are populated at
ingest-time per source, not at registry-define time). **provisional**
on the exact key set; locked on the principle that the registry is
field-for-field the policy fields the chunker already consumes.

Prior art reviewed: LangChain's text-splitter config
(<https://python.langchain.com/docs/concepts/text_splitters/>) and
LlamaIndex's `NodeParser` config (<https://docs.llamaindex.ai/en/stable/module_guides/loading/node_parsers/>)
both encode chunker config as Python objects, not YAML, and bury the
structural-vs-token distinction inside framework abstractions the
in-tree chunker does not use. The minimum-fit YAML above is exactly
the surface `assemble_structural_chunks()` already consumes.

### 4.3 Generator wiring

`engine/db/scripts/generate_chunk_policies.py` — new CLI on the same
shape as `engine/db/scripts/generate_enums.py` (planned, `12 §625`).
Reads `db/schema/chunk-policies.yaml`. Emits two artifacts:

1. **`engine/app/rag_ingest/_policy_registry.py`** — auto-generated
   Python module (do-not-edit header) with one constant
   `POLICY_REGISTRY: dict[str, PaperChunkVersionRecord]` keyed on
   `policy_key`. Built by instantiating `PaperChunkVersionRecord` per
   YAML entry with `source_revision_keys=[]` and
   `parser_version="<build-time placeholder>"` — the per-source
   revisions are merged in by the existing
   `build_default_chunk_version_for_plan()` shim (§4.4).
2. **`paper_chunk_versions` ledger insert** — idempotent
   `INSERT … ON CONFLICT (policy_key) DO NOTHING` for each entry.
   First apply mints one `chunk_version_key UUID` per registry entry
   with `is_default = (entry == registry-default-marker)`,
   `is_active = false`. Operator promotes to `is_active=true` via §7.

The generator is idempotent and deterministic. CI parity check
mirrors `12 §10` enum-codes parity: `python -m
engine.db.scripts.generate_chunk_policies --check` exits non-zero if
the generated `_policy_registry.py` is stale relative to the YAML.

### 4.4 Refactor target for `chunk_policy.py`

`build_default_chunk_version()` (`chunk_policy.py:57-97`) becomes a
thin shim:

```python
# engine/app/rag_ingest/chunk_policy.py — locked target shape
from app.rag_ingest._policy_registry import POLICY_REGISTRY

def build_chunk_version_from_registry(
    *,
    policy_key: str,
    source_revision_keys: Sequence[str],
    parser_version: str,
    embedding_model: str | None = None,
) -> PaperChunkVersionRecord:
    base = POLICY_REGISTRY[policy_key]
    return base.model_copy(update={
        "source_revision_keys": _sorted_unique_strings(source_revision_keys),
        "parser_version": parser_version,
        "embedding_model": embedding_model,
    })

def build_default_chunk_version(**kwargs) -> PaperChunkVersionRecord:
    """Back-compat shim — calls the registry with DEFAULT_CHUNK_VERSION_KEY."""
    return build_chunk_version_from_registry(
        policy_key=kwargs.pop("chunk_version_key", DEFAULT_CHUNK_VERSION_KEY),
        **kwargs,
    )
```

Existing call sites (`chunk_seed.py`, `chunk_backfill_runtime.py`,
`orchestrator.py`) need no change — the shim preserves their
signature. The thin-shim pattern matches `06 §4` Pydantic boundary
discipline: pure schema, no business logic. **locked** for the shape;
**provisional** for the exact name `DEFAULT_CHUNK_VERSION_KEY` (today
it is the string literal `"default-structural-v1"` and stays that
way).

### 4.5 Test additions

- `engine/test/test_rag_chunk_policy.py` extends with a registry
  round-trip: load `chunk-policies.yaml`, instantiate via
  `build_chunk_version_from_registry`, assert field-by-field equality
  with the constants block in §4.2.
- New `engine/test/test_rag_generate_chunk_policies.py` covers the
  generator's idempotency and the `--check` exit-code contract,
  mirroring `engine/test/test_rag_generate_enums.py` (planned per
  `12 §10`).

## §5 `paper_evidence_units` writer

The schema is locked in `02 §883`; the formula is locked in §1.2 above.
This section specifies the **writer** that derives one
`paper_evidence_units` row per `(chunk × member-sentence span)` and
appends it to the existing `RagWarehouseWriteBatch`.

### 5.1 File location and signature

New module: `engine/app/rag_ingest/evidence_unit_writer.py`. Single
public function `extend_write_batch_with_evidence_units(batch)`:

```python
# engine/app/rag_ingest/evidence_unit_writer.py — sketch
import uuid
SOLEMD_NS: uuid.UUID = uuid.UUID("5f0e6d9c-c1c8-5dfb-9a0a-3a0a3a0a3a0a")

def extend_write_batch_with_evidence_units(batch):
    """Hydrate batch.evidence_units from already-populated chunks + members.
    Pre-condition: extend_write_batch_with_structural_chunks() has run.
    """
    units = []
    members_by_chunk = _group_members_by_chunk(batch.chunk_members)
    section_role_by_block = {(b.corpus_id, b.block_ordinal): b.section_role
                             for b in batch.blocks}
    for chunk in batch.chunks:
        for span in _spans_from_members(
            members_by_chunk.get(
                (chunk.chunk_version_key, chunk.corpus_id, chunk.chunk_ordinal), []
            )
        ):
            kind_code = _resolve_evidence_kind(chunk, span)
            ek = uuid.uuid5(SOLEMD_NS,
                f"{chunk.corpus_id}|{kind_code}|{chunk.canonical_section_ordinal}"
                f"|{span.block_ordinal}|{span.sentence_start}|{span.sentence_end}"
                f"|{chunk.chunk_version_key}")
            units.append(PaperEvidenceUnitRecord(
                evidence_key=ek, corpus_id=chunk.corpus_id,
                chunk_version_key=uuid.UUID(chunk.chunk_version_key),
                evidence_kind=kind_code,
                section_ordinal=chunk.canonical_section_ordinal,
                block_ordinal=span.block_ordinal,
                sentence_start_ordinal=span.sentence_start,
                sentence_end_ordinal=span.sentence_end,
                section_role=section_role_by_block.get(
                    (chunk.corpus_id, span.block_ordinal), 0),
                derivation_revision=1))
    return batch.model_copy(update={"evidence_units": units})
```

Runs **after** `extend_write_batch_with_structural_chunks()`
(`write_batch_builder.py:264-304`) and **before**
`PostgresRagWriteRepository.apply_write_batch()`. Pure local hydration;
no PG read.

### 5.2 `evidence_kind` resolution

Single-source helper inside the writer:

| Source signal (on `chunk` or `span`) | Resolved `evidence_kind` |
|---|---|
| `chunk.section_role == ABSTRACT` and `chunk.primary_block_kind == NARRATIVE_PARAGRAPH` | `abstract_conclusion` |
| `chunk.section_role == RESULTS` and `chunk.primary_block_kind == NARRATIVE_PARAGRAPH` | `results_paragraph` |
| `chunk.primary_block_kind == NARRATIVE_PARAGRAPH` (other roles) | `paragraph` |
| `chunk.primary_block_kind in {FIGURE_CAPTION, TABLE_CAPTION, TABLE_BODY_TEXT}` | `paragraph` |
| span shorter than the chunk (e.g. derived for sentence-window retrieval) | `sentence_window` |

The four-value enum lives in `db/schema/enum-codes.yaml` per the
upstream amendment listed at the end of this doc. **locked** for the
mapping; **provisional** on whether `sentence_window` units are
emitted in the first sample build (today: emitted only when the policy
explicitly requests sentence-window derivation, which
`default-structural-v1` does not).

### 5.3 Schema additions to `RagWarehouseWriteBatch`

Add one field to `engine/app/rag_ingest/write_contract.py:24-35`:

```python
class RagWarehouseWriteBatch(ParseContractModel):
    # … existing fields …
    evidence_units: list[PaperEvidenceUnitRecord] = Field(default_factory=list)
```

Validator additions (`@model_validator`): for every
`PaperEvidenceUnitRecord`, the referenced `chunk_version_key` must
appear in `batch.chunk_versions` *or* the batch must be flagged as a
chunk-only (no version) batch. This mirrors the existing block /
section / sentence cross-validation pattern at
`write_contract.py:38-60`.

### 5.4 Pydantic boundary model

`engine/app/models/warehouse/grounding.py` — extend the warehouse
grounding family file with one additional model, keeping `06 §4.4`'s
one-file-per-family rule intact:

```python
from __future__ import annotations
from uuid import UUID
from pydantic import Field, model_validator
from app.rag.parse_contract import ParseContractModel

class PaperEvidenceUnitRecord(ParseContractModel):
    evidence_key: UUID
    corpus_id: int = Field(ge=1)
    chunk_version_key: UUID
    evidence_kind: int = Field(ge=1, le=4)
    section_ordinal: int = Field(ge=0)
    block_ordinal: int = Field(ge=0)
    sentence_start_ordinal: int = Field(ge=0)
    sentence_end_ordinal: int = Field(ge=0)
    section_role: int = Field(ge=0)
    derivation_revision: int = Field(ge=1)

    @model_validator(mode="after")
    def validate_span(self) -> "PaperEvidenceUnitRecord":
        if self.sentence_end_ordinal < self.sentence_start_ordinal:
            raise ValueError(
                "sentence_end_ordinal must be >= sentence_start_ordinal"
            )
        return self
```

Per `06 §4`: pure schema, no business logic; `model_validate` on read,
`model_dump(mode='python')` on write.

### 5.5 Persistence — pool, SQL, idempotency

- **Pool**: `ingest_write` per `06 §2.1`. The chunker actor is the only
  writer of `paper_evidence_units` outside ingest itself.
- **SQL**: `INSERT INTO solemd.paper_evidence_units (…) VALUES (…) ON
  CONFLICT (evidence_key) DO NOTHING`. UUIDv5 is content-deterministic;
  a conflict means the same `(corpus_id, kind, ordinals,
  chunk_version_key)` was already chunked under the same policy. No
  UPDATE path — to change a row's coordinates, mint a new
  `chunk_version_key` (§7).
- **Batch shape**: asyncpg `executemany` over the per-paper hydrated
  batch. Per-paper batch size is bounded by chunk count (~10 per
  paper, per `02 §1089` sizing); no pagination needed.

### 5.6 Test additions

`engine/test/test_rag_evidence_units.py` — new file. Cover:

1. **Formula determinism**: identical inputs → identical
   `evidence_key`. Across two test runs, with two different
   `chunk_version_key` values, the same payload yields different keys.
2. **Idempotency**: writing the same batch twice yields the same row
   count and zero conflicts on the second pass (DO NOTHING absorbs).
3. **Round-trip**: given an `evidence_key`, the
   `(chunk_version_key, corpus_id, block_ordinal,
   sentence_start_ordinal)` btree on `paper_evidence_units` returns
   the canonical coordinates per `02 §905`.
4. **Cross-validation**: a batch where `chunk.chunk_version_key` does
   not match any row in `batch.chunk_versions` raises in
   `RagWarehouseWriteBatch.validate_batch()`.

## §6 Worker placement — Dramatiq actor canonical

Two paths exist today: orchestrator-inline batch (`orchestrator.py:1375-1603`,
`run_chunk_backfill()`) and the same code shape callable per paper.
Neither is yet a Dramatiq actor. This section declares the canonical
steady-state placement.

### 6.1 Canonical actor

```python
# engine/app/workers/chunker.py — new file
import dramatiq
import uuid
from app.workers._boot import get_pool
from app.rag_ingest.chunk_assembly import assemble_for_paper

@dramatiq.actor(
    queue_name="chunker",
    max_retries=2, min_backoff=10_000, max_backoff=600_000,
    time_limit=60_000,                  # 60 s — see §6.4
)
async def assemble_for_paper_actor(
    corpus_id: int,
    chunk_version_key: str,
    ingest_run_id: str,
) -> None:
    await assemble_for_paper(
        corpus_id=corpus_id,
        chunk_version_key=uuid.UUID(chunk_version_key),
        ingest_run_id=uuid.UUID(ingest_run_id),
        ingest_write_pool=get_pool("ingest_write"),
    )
```

The actor body wraps a per-paper slice of the existing
`run_chunk_backfill()` runner — specifically, one iteration of the
inner per-corpus_id loop in
`engine/app/rag_ingest/chunk_backfill_runtime.py:300-335`. The new
`engine/app/rag_ingest/chunk_assembly.py:assemble_for_paper()` is the
extracted single-paper entry point; it composes:

1. Read `paper_blocks` / `paper_sentences` / `paper_sections` for one
   `corpus_id` (the `_BLOCK_ROWS_SQL` / `_SENTENCE_ROWS_SQL` SQL
   already in `chunk_backfill_runtime.py:36-76`).
2. Hydrate a `RagWarehouseWriteBatch`.
3. Run `extend_write_batch_with_structural_chunks(batch, version)`
   (existing).
4. Run `extend_write_batch_with_evidence_units(batch)` (§5.1).
5. `PostgresRagWriteRepository.apply_write_batch(batch)` (existing).

### 6.2 Pool

`ingest_write` per `06 §2.1`. The chunker actor is the only async
writer of `paper_chunks` / `paper_chunk_members` / `paper_evidence_units`
outside the ingest worker proper. Adding the actor to `06 §6.3`'s
process map requires the upstream amendment listed at the end of this
doc — today the table only enumerates `ingest.py` / `projection.py` /
`rag.py` / `maintenance.py`.

### 6.3 Trigger

Ingest-side dispatch during the same warehouse-up window that publishes
the run: when the ingest orchestrator marks an `ingest_runs` row
published, it also records / checks the sidecar `chunk_runs` ledger and
fans out one `assemble_for_paper_actor.send(corpus_id, chunk_version_key,
ingest_run_id)` per `corpus_id` published in that run.

`chunk_version_key` is the row from `paper_chunk_versions` where
`is_active = true` (`02 §851`). Held constant per ingest_run; rotates
at policy activation per §7.

Warehouse `pg_cron` may still be used for recovery or audit passes, but
it is not the canonical activation path for steady-state chunking in a
cold-by-default warehouse topology.

LISTEN/NOTIFY publish trigger is **deferred** for symmetry with `05 §13`
(where the projection handoff also defers it).

### 6.4 Time-limit budget

60 s per `corpus_id` actor. The chunker is CPU-bound and runs at
~1–10 ms per paper for typical biomedical text on the workstation
(Ryzen 9950X3D, single-core path through Stanza-bio + assembly +
evidence-unit hydration). 60 s is ~6 000× headroom; in practice the
limit only fires on a degenerate input. **provisional** until the
sample build measures actual p99.

### 6.5 Concurrency

Sized by the `ingest_write` pool depth (`06 §2.1`: `min=8, max=64`
on 68 GB; `min=8, max=96` on 128 GB). Dramatiq AsyncIO middleware (one
event-loop thread per worker process) lets one process saturate the
pool. One `chunker` worker process is the default; `06 §6.3`
addition (see end of doc) makes that explicit.

### 6.6 Idempotency

Re-enqueuing the same `(corpus_id, chunk_version_key)` no-ops:
- `paper_evidence_units` writes are `ON CONFLICT (evidence_key) DO
  NOTHING`; UUIDv5 collision means the same content was already
  chunked under the same policy.
- `paper_chunks` / `paper_chunk_members` writes use the existing
  `replace_existing` flag in `RagChunkBackfillWriter`
  (`chunk_backfill.py:18-24`); when `false`, conflicts are skipped.
  The actor passes `replace_existing=false`.

### 6.7 Failure mode

A small sidecar table absorbs assembly errors without blocking ingest
publish:

```hcl
table "chunk_assembly_errors" {
  schema = schema.solemd
  column "ingest_run_id"      { null = false, type = uuid }
  column "corpus_id"          { null = false, type = bigint }
  column "chunk_version_key"  { null = false, type = uuid }
  column "first_failure_at"   { null = false, type = timestamptz, default = sql("now()") }
  column "retry_count"        { null = false, type = smallint, default = 0 }
  column "last_error_class"   { null = true,  type = text }
  column "last_error_message" { null = true,  type = text }
  primary_key { columns = [column.corpus_id, column.chunk_version_key] }
  index "idx_chunk_errors_recent" {
    columns = [column.first_failure_at]
  }
  settings { fillfactor = 80 }
}
```

The actor catches all exceptions, upserts here, and re-raises only on
`max_retries` exhaustion. Operator review queries this table. Ingest
publish is not blocked by chunker failure. **provisional** on the
exact column set.

### 6.8 Orchestrator-inline mode (dev / bench)

`orchestrator.py:1375-1603`'s `--seed-chunk-version` /
`--backfill-chunks` flags continue to work unchanged. They become the
**dev / benchmark path**: a developer runs the full corpus chunker
inline on their box for benchmarking against a sample release without
involving Dramatiq / Redis / pg_cron. Documented; de-prioritized
relative to the actor for steady-state.

## §7 Re-chunking lifecycle

A policy edit never mutates existing rows. It mints a new
`chunk_version_key` and the actor in §6 fans out a fresh assembly
across the corpus.

### 7.1 Trigger

Operator edits `db/schema/chunk-policies.yaml` — adds a new entry
(e.g. `default-structural-v2` with a different `target_token_budget`),
keeping the existing `default-structural-v1` row.

### 7.2 Steps

1. `python -m engine.db.scripts.generate_chunk_policies` (§4.3) —
   regenerates `_policy_registry.py`; idempotent insert into
   `paper_chunk_versions` for the new entry. The new row lands with
   `is_default = false`, `is_active = false`, fresh `chunk_version_key
   UUIDv7`.
2. `python -m engine.scripts.activate_chunk_policy default-structural-v2`
   — new CLI. Looks up the registry entry, finds the matching
   `paper_chunk_versions` row, **leaves `is_active=false`** for now (it
   is not yet built).
3. Operator enqueues a corpus-wide re-chunk: a Dramatiq dispatcher
   sends `assemble_for_paper_actor` per `corpus_id` against the new
   `chunk_version_key`. Writes new `paper_chunks` /
   `paper_chunk_members` / `paper_evidence_units` rows. Old rows
   under the previous `chunk_version_key` are untouched.
4. Operator runs `activate_chunk_policy default-structural-v2 --flip`.
   Atomic single-row `UPDATE solemd.paper_chunk_versions SET
   is_active=true WHERE chunk_version_key=$new` inside the same
   transaction that flips the previous active row to
   `is_active=false`. The partial unique index at `02 §851` enforces
   the one-active invariant.
5. Cohort manifest in `04 §5.1` already carries `chunk_version_key`
   in `CohortManifest.chunk_version_key` (line 579). The next
   projection cycle reads the active row and builds OpenSearch
   `evidence_index` against the new key.
6. The previous `chunk_version_key` row is retained for **90 days**
   (or until the next active flip, whichever comes later) for
   rollback. After that, a maintenance job sweeps:
   `DELETE FROM solemd.paper_evidence_units WHERE chunk_version_key =
   $old`; same for `paper_chunks` / `paper_chunk_members`. **provisional**
   on the 90-day window — sample-build experience may shrink it to 30
   days.

### 7.3 No live read-traffic blocking

Re-chunking writes never touch the active key's rows. Reads through
the cohort's stable `chunk_version_key` continue to resolve. The
flip in step 4 is a single-row UPDATE; readers picking up the new
`chunk_version_key` happens on the next projection cohort cutover
(`04 §5.1`), not on the flip itself.

### 7.4 Rollback

Reverse the flip: `activate_chunk_policy default-structural-v1 --flip`.
Old rows are still present, the cohort manifest re-issues the previous
`chunk_version_key`, the next projection cycle restores the previous
`evidence_index`. Bounded.

## §8 Hot-tier vs warm-tier interaction

This lane writes canonical-derived rows for the full chunkable corpus.
Tier selection lives elsewhere.

### 8.1 All chunkable papers derive canonical rows

`paper_chunks`, `paper_chunk_members`, and `paper_evidence_units` are
canonical-derived per `02 §0` and populated for every paper with
usable text surfaces in `solemd.corpus`. The actor runs across the
published-run cohort without reference to tier.

The storage contract is intentionally broader than the retrieval
contract:

- `paper_sentences` / `paper_chunks` / `paper_chunk_members` remain the
  canonical warehouse spine for every chunkable paper.
- `paper_evidence_units` materializes the retrieval-facing unit keyed by
  `evidence_key`, but still points back to canonical block and sentence
  coordinates.
- `evidence_index` only receives the hot subset of those evidence units;
  it is not a mirror of every sentence row or every raw chunk row in the
  warehouse.

Papers that only have abstract text, sparse captions, or otherwise thin
surfaces may emit a smaller evidence footprint than long full-text
papers. That is expected and does not weaken the "derive once in the
warehouse, promote later into OpenSearch" rule.

Storage rough-cut: 14 M papers × ~10 chunks × 1 evidence unit per
chunk = **140 M `paper_evidence_units` rows**. The partitioning
trigger at `02 §1089` (>50 M rows) will fire in the first full sample
build. Partition strategy is already specified in `02 §909-911`:
hash × 32 by `hashtext(evidence_key::text)`. **locked** as a follow-up
once the trigger fires; *provisional* on whether the trigger fires
before the sample build is fully populated (it depends on test-corpus
size).

### 8.2 Hot-tier indexing in OpenSearch

Per `07 §3.5`, `evidence_index` is hot-tier-only. The hot cohort is
defined by `serving_members` rows with `cohort_kind = 'practice_hot'`
(`03 §4.3`), filtered by `evidence_priority_score` (`02 §4.4`).
That selection determines which `evidence_key` rows make it into
OpenSearch. The chunker does not consult `serving_members`.

### 8.3 Promotion

Adding a `corpus_id` to `practice_hot` triggers the next
projection cycle to add its `evidence_key` rows to `evidence_index`
during `opensearch_evidence_index` family build (`04 §5.2`,
`07 §3.3`). The chunks already exist; promotion is purely an
OpenSearch-index operation.

### 8.4 Demotion

Removing a `corpus_id` from `practice_hot` results in the next
`evidence_index` build simply not writing those docs (`07 §612-616`).
Warehouse rows untouched. No chunker work involved.

## §9 Failure modes

| Failure | Detection | Recovery |
|---|---|---|
| Stanza-bio model unavailable | `TokenizationUnavailable` at `tokenization.py:411-415`; `FallbackChunkTokenBudgeter` falls back to regex. | Automatic; `tokenizer_name` on the emitted `paper_chunk_versions` row records the fallback. |
| Sentence segmenter empty on non-empty block | Falls through to `DeterministicSentenceSegmenter` (`sentence_segmentation.py:367-371`). | Automatic; `segmentation_source` records `DETERMINISTIC_FALLBACK`. |
| `assemble_structural_chunks()` returns zero chunks | `chunks_assembled_total` += 0 for that `corpus_id`; weak-chunk detector warns. | Paper skipped at `evidence_index` build (no rows). Retried on next `chunk_version_key` rotation. |
| `paper_evidence_units` insert raises non-conflict error | Actor catches; writes to `chunk_assembly_errors`; re-raises after `max_retries=2`. | Operator queries `chunk_assembly_errors`; re-enqueue after fix. |
| Active-version flip during in-flight assembly | Actor reads `chunk_version_key` from its arguments, not from `paper_chunk_versions` live. | None — in-flight actor finishes against its key; next projection cycle picks up the new one. |
| Registry edit without generator re-run | CI parity check (`generate_chunk_policies --check`) fails the PR. | Re-run generator; commit `_policy_registry.py`. |
| `evidence_kind` enum extended without `enum-codes.yaml` update | `PaperEvidenceUnitRecord.evidence_kind` Pydantic validator (`Field(ge=1, le=4)`) rejects out-of-range writes. | Bump validator bound + `enum-codes.yaml` together; add a `12 §9` amendment row. |

## §10 Observability hooks

Counters, gauges, and histograms exposed through the same Prometheus
client used by the rest of the engine (`10-observability.md`).

| Metric | Type | Labels | Purpose |
|---|---|---|---|
| `chunks_assembled_total` | counter | `chunk_version_key`, `policy_key` | Rows added to `paper_chunks` per actor invocation. |
| `chunk_members_assembled_total` | counter | `chunk_version_key`, `policy_key` | Rows added to `paper_chunk_members`. |
| `evidence_units_written_total` | counter | `chunk_version_key`, `policy_key`, `evidence_kind` | Rows added to `paper_evidence_units`. |
| `evidence_unit_conflicts_total` | counter | `chunk_version_key` | `ON CONFLICT DO NOTHING` hits — idempotency verification. |
| `weak_chunks_dropped_total` | counter | `policy_key` | Chunks below `MIN_USEFUL_NARRATIVE_TOKENS` (`chunk_quality.py:9`) that the assembler coalesced or dropped. |
| `chunk_assembly_latency_seconds` | histogram | `policy_key` | Per-paper assembly wall-clock; buckets at 1 ms / 10 ms / 100 ms / 1 s / 10 s / 60 s. Headline metric for the §6.4 budget. |
| `chunk_assembly_errors_total` | counter | `failure_class` | Increments on every catch in §6.7. |
| `sentence_segmentation_source_total` | counter | `segmentation_source` | Distribution across `S2ORC_ANNOTATION` / `STANZA_BIOMEDICAL` / `SYNTOK` / `DETERMINISTIC_FALLBACK`. Tells operators when biomedical model availability is degraded. |

Required structured log events (jsonlog format per `06 §10`):
- `chunker.actor.started` (corpus_id, chunk_version_key, policy_key, ingest_run_id)
- `chunker.actor.completed` (corpus_id, chunks_written, evidence_units_written, latency_ms)
- `chunker.actor.failed` (corpus_id, chunk_version_key, error_class, retry_count)
- `chunker.policy.activated` (policy_key, chunk_version_key, prior_chunk_version_key)

Routing into Loki / Prometheus is owned by `10-observability.md`.

## Cross-cutting invariants

Beyond `02 §5`:

1. **Every `paper_evidence_units` row's `evidence_key` recomputes to
   the same value** under the §1.2 formula given the row's stored
   columns and the active `chunk_version_key`. Audit job runs daily;
   mismatch surfaces as `evidence_units_audit_mismatches_total`.
   (Already mandated by `02 §5` invariant 2 — restated here because
   the writer (§5) is the only producer.)
2. **No `paper_evidence_units` row references a `chunk_version_key`
   that does not exist in `paper_chunk_versions`.** Enforced by FK in
   `02 §892`.
3. **Every `paper_chunks` row has at least one `paper_chunk_members`
   row.** Existing `assemble_structural_chunks()` guarantee
   (`chunking.py`); restated for completeness.
4. **`chunks_assembled_total` per `chunk_version_key` is monotonic
   between policy flips** — the actor only INSERTs (with
   ON-CONFLICT-DO-NOTHING absorbing replays). Re-chunk under a *new*
   key starts a new monotonic series.
5. **One `is_active = true` row in `paper_chunk_versions`** at all
   times after first apply (`02 §851` partial unique index).

## §N Decisions — locked / provisional / deferred

### Locked now

| Decision | Rationale |
|---|---|
| `SOLEMD_NS = uuid.UUID("5f0e6d9c-c1c8-5dfb-9a0a-3a0a3a0a3a0a")` for `evidence_key` UUIDv5 namespace | Already pinned at `05 §505`; reproduced here as the canonical Python constant in `evidence_unit_writer.py`. RFC 9562 §5.5. |
| `evidence_key` payload spelling: `corpus_id|kind_code|section_ord|block_ord|sent_start|sent_end|chunk_version_key` (pipe-separated, decimal int, lowercase hyphenated UUID) | Matches `05 §504-509`; matches `02 §5` invariant 2 audit contract. |
| Chunker code at `engine/app/rag_ingest/` is salvage inventory, not authority | The §2 inventory (~3 000 lines) is the reuse map for the rebuild. Refactors still require a `12 §9` amendment + revision of this doc, but current file:line references do not override this spec. |
| Policy registry as `db/schema/chunk-policies.yaml` + generator | Same shape as `enum-codes.yaml` per `12 §4`; field-for-field with `PaperChunkVersionRecord`. |
| Initial registry contents = constants block in `chunk_policy.py:21-36` | Zero behavior change at first apply. |
| `paper_evidence_units` writer in `engine/app/rag_ingest/evidence_unit_writer.py` | Pure-local hydration over `RagWarehouseWriteBatch`; no PG read. |
| Pool: `ingest_write` for `paper_evidence_units` writes | Per `06 §2.1`; the chunker actor is an ingest-side writer. |
| Idempotency: `INSERT … ON CONFLICT (evidence_key) DO NOTHING` | UUIDv5 is content-deterministic; conflict means same content already chunked. No UPDATE path. |
| Canonical worker placement = Dramatiq actor `chunker.assemble_for_paper(corpus_id, chunk_version_key, ingest_run_id)` | Per-paper unit; one actor process; `ingest_write` pool; trigger is ingest-side dispatch on `ingest_runs.status='published'` within the same warehouse-up window. |
| Re-chunk lifecycle = mint new `chunk_version_key`, build, atomic-flip via `02 §851` partial unique index | No row mutation; old rows survive for rollback. |
| All chunkable papers derive canonical sentence/chunk/evidence rows; only hot-tier papers are indexed in `evidence_index` | Tier is owned by `serving_members` (`07 §3.5`); not a chunker concern. |

### Provisional (revisit after sample build)

| Decision | Revisit trigger |
|---|---|
| Exact YAML key set in `chunk-policies.yaml` | First registry edit beyond `default-structural-v1` reveals what is actually mutable. |
| `time_limit=60_000` ms per chunker actor | Sample build measures real p99 per-paper chunking latency; expand or shrink. |
| `chunk_assembly_errors` table column set | First non-trivial production failure reveals what columns operators actually query. |
| Old-`chunk_version_key` retention = 90 days | Sample build experience may shrink to 30 days or extend if rollback frequency justifies. |
| `evidence_kind` resolution mapping (§5.2) | Confirm against benchmark hit-quality once `evidence_index` is wired. |
| `derivation_revision = 1` | Bumps when the writer's resolution algorithm changes; today the constant is a sentinel. |
| Sentence-window evidence units only when policy explicitly requests | If runtime evaluation justifies windowed retrieval, `default-structural-v2` adds it; today off. |
| `paper_evidence_units` partitioning trigger (>50 M rows, `02 §1089`) | Sample build measured row count; possibly fires on first build. |

### Deferred (trigger-gated)

| Decision | Trigger |
|---|---|
| LISTEN/NOTIFY publish trigger from ingest to chunker actor | `05 §13` LISTEN/NOTIFY graduates from deferred to locked. |
| Per-corpus_id parallel actor sharding inside one published run | Per-paper actor budget exhausts the `ingest_write` pool envelope. |
| Sentence-window evidence-unit derivation in registry | Runtime evaluation in `08-retrieval-cascade.md` justifies sentence-windowed retrieval. |
| Replacing the `chunk_quality.py:9` `MIN_USEFUL_NARRATIVE_TOKENS = 15` constant with a registry-driven value | A registry policy needs a different threshold; today every policy uses 15. |
| Move `paper_evidence_units` to a dedicated tablespace | Storage isolation pressure inside the warehouse cluster (`02 §0.9` defers tablespaces). |
| Chunker GPU acceleration (Stanza on RTX 5090) | Sample build measures per-paper assembly latency at >50 ms p99 and the headline budget at §6.4 starts pinching. |

## Open items

Forward-tracked; none block subsequent docs:

- **`evidence_kind` enum landing.** `02 §883` defines the four-value
  enum (`paragraph` | `results_paragraph` | `abstract_conclusion` |
  `sentence_window`) but `12 §952` row 14 enumerates only the initial
  enum population without naming `evidence_kind`. This doc adds it as
  an upstream amendment (below); reviewer should confirm the four
  enum values land in `enum-codes.yaml` row N+1 in `12 §9`.
- **Chunker process count in `06 §6.3` table.** That table enumerates
  `ingest.py` / `projection.py` / `rag.py` / `maintenance.py` only.
  This doc requires adding `chunker.py` (count: 1) on the
  `ingest_write` pool. Listed as upstream amendment.
- **`05 §1046` deferred-decision row redirection.** Today reads "Today
  owned by separate post-ingest worker; fold in at phase 4.5 if its
  lag becomes a publish-blocker." After this doc lands, the "separate
  post-ingest worker" is a named, locked entity (the §6 actor); the
  row should redirect to `05a §6` rather than be open-ended.
- **Where does `chunk_runs` ledger live?** §6.3 references a sidecar
  ledger to track which `ingest_run_id` × `chunk_version_key` pairs
  have completed. Today this is implicit (presence of
  `paper_evidence_units` rows for that key). A small explicit ledger
  on warehouse simplifies the pg_cron query; not yet specified.

## Upstream amendments applied in this batch

These structural amendments have now been ingested into `12 §9` and the
companion docs where applicable. Code, SQL schema, migration, and metric
landings are still owed where the target is an implementation file.

| # | Source | Amendment | Target file |
|---|---|---|---|
| A | `05a §1.2` + `02 §883` | Add `evidence_kind` enum to `enum-codes.yaml` with codes `paragraph=1`, `results_paragraph=2`, `abstract_conclusion=3`, `sentence_window=4`. Mirror in `db/schema/generated/enum_comments.sql` per `12 §3` generator-as-build-step. | `db/schema/enum-codes.yaml` |
| B | `05a §6.2` | Add `chunker.py` to the `06 §6.3` worker process map: `Pools: ingest_write; Count: 1`. Reflect in `engine/app/workers/__init__.py` registration. | `docs/rag/06-async-stack.md` (doc) + `engine/app/workers/chunker.py` (new) |
| C | `05a §6.3` | Add a `solemd.chunk_runs` ledger table on warehouse: `(ingest_run_id UUID, chunk_version_key UUID, started_at TIMESTAMPTZ, completed_at TIMESTAMPTZ, status SMALLINT)`, PK `(ingest_run_id, chunk_version_key)`. Used by the ingest-side dispatcher in §6.3 to track run fan-out and recovery. | `db/schema/warehouse/*.sql` + `db/migrations/warehouse/*.sql` |
| D | `05a §6.7` | Add `solemd.chunk_assembly_errors` table per the schema block in §6.7. | `db/schema/warehouse/*.sql` + `db/migrations/warehouse/*.sql` |
| E | `05a §4.1` | Add `db/schema/chunk-policies.yaml` to the `12 §187` repo-tree map (sibling to `enum-codes.yaml`). | `docs/rag/12-migrations.md` (doc) |
| F | `05a §4.3` | Add `engine/db/scripts/generate_chunk_policies.py` to the `12 §10` CI parity-check matrix on the same shape as the (planned) `generate_enums.py` check. | `docs/rag/12-migrations.md` (doc) + `.github/workflows/db.yaml` |
| G | `05a §6.1` | Redirect `05 §1046` deferred row from "Today owned by separate post-ingest worker; fold in at phase 4.5 if its lag becomes a publish-blocker" to "Owned by the Dramatiq `chunker.assemble_for_paper` actor per `05a §6`. Folding into ingest itself remains deferred." | `docs/rag/05-ingest-pipeline.md` (doc) |
| H | `05a §5.3` | Add `evidence_units: list[PaperEvidenceUnitRecord]` field to `RagWarehouseWriteBatch` (`engine/app/rag_ingest/write_contract.py:24-35`) and the cross-validation in `validate_batch()`. | `engine/app/rag_ingest/write_contract.py` (code) |
| I | `05a §5.4` | Extend `engine/app/models/warehouse/grounding.py` with the `PaperEvidenceUnitRecord` Pydantic model so warehouse boundary models stay family-grouped per `06 §4.4`. | `engine/app/models/warehouse/grounding.py` |
| J | `05a §10` | Add the eight chunker metrics to `engine/app/observability/metrics.py` and document under `docs/rag/10-observability.md`. | `engine/app/observability/metrics.py` + `docs/rag/10-observability.md` (doc) |

These rows remain additive only. None edit history elsewhere; the
discipline matches `12 §97-99`, and the canonical ledger now lives in
`12 §9`.
