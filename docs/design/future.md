# Future Work and Deferred Ideas

This document is the stable place for post-freeze ideas, deferred design decisions,
and future roadmap items that came out of corpus design work.

Use it for:
- ideas that are important, but not part of the current frozen baseline
- Phase 1.5 overlay / bridge work
- future graph and retrieval improvements
- concepts that were audited and intentionally deferred

---

## Current Freeze Boundary

The Phase 1 baseline is now frozen around:
- journal / vocab filter
- `venue_rule`
- `entity_rule`
- `relation_rule`
- `graph_papers` quality filter

Current live baseline emphasizes:
- bedside neuropsychiatry
- systemic encephalopathy / organ-failure bridge syndromes
- respiratory brain-failure
- endocrine-metabolic reversibility
- high-yield medication toxicity families

Not everything important belongs in baseline. Some things are better represented
as overlay signals or future concept layers.

---

## Phase 1.5 — Overlay / Bridge Reservoir

### Disease Co-Occurrence Bridge

PubTator3 does **not** provide typed `disease -> disease` relations in the current
loaded corpus. If we want explicit neuropsychiatry ↔ organ-system disease links,
they need to come from disease co-occurrence in `pubtator.entity_annotations`.

Recommended direction:
- build a `disease_cooccurrence_bridge` layer from same-paper disease co-occurrence
- anchor on current seeded disease concepts from `solemd.entity_rule`
- score pairs by `PMI + specificity + graph/candidate spread`
- use this primarily for overlay / reservoir selection, not raw baseline promotion

Recommended companion tables:
- `disease_cooccurrence_pair`
- `paper_disease_cooccurrence_bridge`
- later folded into `paper_signal`

Important caution:
- raw pair count is too broad
- broad behavioral seeds can dominate the surface
- generic concepts must be stoplisted or heavily downweighted

### Candidate Overlay Families

These are important, but intentionally deferred from baseline:
- sleep-disordered breathing / sleep-respiratory bridge
- autoimmune / rheumatologic neuropsychiatry
- oncology neurotoxicity / paraneoplastic bridge
- transplant neurotoxicity
- inflammation / immune bridge
- pharmacokinetic / interaction bridge
- broader cardio / perioperative bridge families

---

## Deferred Because PubTator Was Too Noisy

These concepts were explored and deliberately **not** frozen into baseline rules:

### Narrow Withdrawal

Desired idea:
- alcohol withdrawal syndrome
- withdrawal delirium / delirium tremens

Why deferred:
- currently observed PubTator concept IDs were too noisy for concept-id-only promotion
- some candidate IDs mapped to alcoholism / alcohol abuse umbrella language
- one probed withdrawal-delirium ID mapped to amnesia rather than withdrawal

Future options:
- mention-gated entity rules
- cleaner concept ID audit
- vocab/panel/pinning approach instead of rule-based promotion

### Dirty Endocrine / Metabolic Concepts

Desired idea:
- hypoglycemia
- broader adrenal / thyroid crisis families

Why deferred:
- currently observed PubTator mappings were broader or wrong enough to risk bad promotion
- hypoglycemia audit was dominated by hypotension / hypotensive strings under the probed ID

Future options:
- mention-gated entity rules
- alternate concept IDs
- entity stoplist + curated accepted-mention set

### Circuit / Network Concept Promotion

Desired idea:
- explicit circuit-level baseline promotion

Why deferred:
- PubTator anatomy/circuit mapping remains too noisy for direct `entity_rule` use

Future options:
- vocab-only support
- dysfunction aliases
- concept pinning in the graph bundle

---

## Future Graph / Product Work

### Mapped Universe

- enrich frozen `graph` tier with S2 batch API
- compute embeddings
- run UMAP + clustering
- build Parquet bundle
- choose a default-visible subset rather than rendering all quality-filtered graph papers by default

### Living Graph

- active canvas stays bounded
- overlay papers flow in based on exploration, search, or writing context
- mapped overlay reservoir should be broader than default visible baseline

### Writing Responsiveness

- what the user writes should light up supporting and contradicting evidence
- mapped hits illuminate on the canvas
- unmapped hits surface in side panels

---

## When to Update This File

Update this file when:
- a future idea is discussed but intentionally deferred
- a noisy concept is audited and held out
- a new overlay family is identified
- a Phase 1.5 / Phase 2 idea becomes concrete enough to preserve

Do **not** use this file for the current frozen baseline definition.
That belongs in:
- `docs/map/database.md`
- `docs/map/corpus-filter.md`
- `docs/map/map.md`
