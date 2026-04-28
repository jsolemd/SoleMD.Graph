# Agentic Ledgers

This directory is the durable handoff surface for agentic work in
`SoleMD.Graph`.

Use it for long-running passes that need to survive compaction, restarts,
handoff, or later policy review. The active execution queue should still live
in the agent plan/todo surface; the ledger is the persisted record of what was
actually learned, changed, and left open.

## Naming

Create one markdown ledger per pass:

```text
YYYY-MM-DD-<repo>-<target-slug>-ledger.md
```

Examples from the current Graph policy work:

- `2026-04-19-solemd-graph-corpus-live-proof-ledger.md`
- `2026-04-19-solemd-graph-monitored-pipeline-campaign-ledger.md`
- `2026-04-19-solemd-graph-selection-policy-lock-ledger.md`

`README.md` is the directory index and operating guide. It is not a dated
per-run ledger.

## Standard Sections

Every substantive ledger should capture:

- scope
- current state / runtime contract
- ranked themes and findings
- completed batches
- exact commands or run ids when the pass is operational
- commit hashes when relevant
- blockers
- newly discovered follow-on work
- next recommended passes

For measurement-heavy passes, also capture:

- exact release tags and selector / wave policy keys
- warehouse counts
- telemetry endpoints and Grafana observations
- SQL worksheets or query references used to derive the numbers

## Current Graph Sequence

These are the current load-bearing Graph ledgers for the corpus / mapped /
evidence policy line:

- [2026-04-19-solemd-graph-corpus-live-proof-ledger.md](/home/workbench/SoleMD/SoleMD.Graph/docs/agentic/2026-04-19-solemd-graph-corpus-live-proof-ledger.md)
  Initial live proof that the release-backed selector and downstream evidence
  dispatch were operational.
- [2026-04-19-solemd-graph-monitored-pipeline-campaign-ledger.md](/home/workbench/SoleMD/SoleMD.Graph/docs/agentic/2026-04-19-solemd-graph-monitored-pipeline-campaign-ledger.md)
  First monitored run with warehouse counts, Grafana verification, and the
  distinction between evidence cohort and evidence backlog.
- [2026-04-19-solemd-graph-selection-policy-lock-ledger.md](/home/workbench/SoleMD/SoleMD.Graph/docs/agentic/2026-04-19-solemd-graph-selection-policy-lock-ledger.md)
  Docs lock pass for the landed `raw -> corpus -> mapped -> evidence`
  contract.
- [2026-04-19-solemd-graph-contract-visibility-and-artifact-quality-ledger.md](/home/workbench/SoleMD/SoleMD.Graph/docs/agentic/2026-04-19-solemd-graph-contract-visibility-and-artifact-quality-ledger.md)
  Current pass. Adds explicit stage-count telemetry, Grafana contract
  visibility, and the warehouse quality-audit workflow for later sub-agent
  review.
- [2026-04-19-solemd-graph-artifact-quality-audit-ledger.md](/home/workbench/SoleMD/SoleMD.Graph/docs/agentic/2026-04-19-solemd-graph-artifact-quality-audit-ledger.md)
  Active audit pass for Postgres artifact quality across corpus, mapped,
  evidence readiness, and document-structure health.
- [2026-04-20-solemd-graph-stage-contract-implementation-plan-ledger.md](/home/workbench/SoleMD/SoleMD.Graph/docs/agentic/2026-04-20-solemd-graph-stage-contract-implementation-plan-ledger.md)
  Implementation pass for the staged persistence split: raw substrate,
  corpus baseline, mapped-heavy surfaces, evidence-owned document work, and
  the first live ingest follow-up under that contract.

## When To Open A New Ledger

Open a new ledger when the pass changes one of these:

- runtime contract
- policy contract
- measurement method
- warehouse audit method
- observability surface
- downstream activation decision

Do not reuse an older ledger once the goal has shifted from proof, to
measurement, to policy lock, to quality review. Open a new file and link it
from here.

## Quality Review Workflow

The next Graph-quality pass should follow this order:

1. Confirm the release pair, selector version, and wave policy key.
2. Run the monitored pipeline under Grafana.
3. Record `raw -> corpus -> mapped -> evidence cohort -> evidence backlog`.
4. Audit artifact quality in Postgres:
   abstracts, locators, PT3 coverage, venue/year mix, full-text spine quality,
   and obvious malformed or low-value rows.
5. Only then lock policy thresholds or widen ingestion.

If sub-agents are used for quality review, give each one a bounded slice with a
disjoint question set, such as:

- corpus admission quality and reason mix
- mapped promotion quality and false-positive review
- evidence cohort / backlog quality and full-text readiness
- document-spine quality for published paper-text runs

## Other Ledgers

This directory can also hold non-Graph audit ledgers when the user asks for
them. Keep the filename explicit enough that Graph policy work is still easy to
find by scanning the list.

- [2026-04-20-solemd-graph-field-landing-runtime-ledger.md](/home/workbench/SoleMD/SoleMD.Graph/docs/agentic/2026-04-20-solemd-graph-field-landing-runtime-ledger.md)
  Ambient-field landing runtime pass: shared stage scroll state, controller
  readiness gate, blob-through-landing contract, CTA blob bookend, and module
  authoring reference updates.
- [2026-04-20-solemd-graph-module-skill-discovery-ledger.md](/home/workbench/SoleMD/SoleMD.Graph/docs/agentic/2026-04-20-solemd-graph-module-skill-discovery-ledger.md)
  Module-skill authoring pass: discovery-first behavior for vague briefs,
  minimum clarification questions, and a checked-in module-contract intake
  snapshot.
- [2026-04-20-solemd-graph-cross-skill-landing-contract-alignment-ledger.md](/home/workbench/SoleMD/SoleMD.Graph/docs/agentic/2026-04-20-solemd-graph-cross-skill-landing-contract-alignment-ledger.md)
  Cross-skill alignment pass for `module`, `aesthetic`, and
  `animation-authoring` so future agents reconstruct the landing/runtime
  architecture from the current canonical surface instead of stale references.
- [2026-04-28-solemd-graph-webgpu-orb-visual-parity-ledger.md](/home/workbench/SoleMD/SoleMD.Graph/docs/agentic/2026-04-28-solemd-graph-webgpu-orb-visual-parity-ledger.md)
  WebGPU orb visual parity pass: shader/resource modularization,
  storage-buffer visual flags, cluster palette, depth-aware billboards, and
  the pre-physics implementation queue.
