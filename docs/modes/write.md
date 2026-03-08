# Write Mode — The Graph as Co-Author

> You don't write and then cite. You write *through* the graph — and the graph pushes back when the evidence disagrees.

## Overview

Click **Write** on the prompt box and it *transforms*. The compact input expands upward into a full scientific editor (Tiptap/ProseMirror). The mode toggles stay at the top — you can always click back to Ask or Explore and the editor smoothly collapses. The graph slides to the corner and becomes a **dual-signal display**: supporting evidence (●) and contradicting evidence (◆).

## Layout

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  SoleMD                                                          [Sign in] │
│                                                                             │
│                                                    ┌── GRAPH (mini) ─────┐ │
│                                                    │   ○──○   ●──○       │ │
│  ┌── Editor ─────────────────────────────────┐     │  ○──●──○   ○        │ │
│  │                                            │     │ ●──○  ○──○──●      │ │
│  │  # BDNF and Treatment-Resistant            │     │  ○   ●   ○──○      │ │
│  │  # Depression: A Review                    │     │ ◆──○  ◆   ○        │ │
│  │                                            │     │                     │ │
│  │  Treatment-resistant depression (TRD)      │     │ ● = supports (sim.)│ │
│  │  affects approximately 30% of patients     │     │ ◆ = contradicts    │ │
│  │  with major depressive disorder. Recent    │     │ ○ = dormant        │ │
│  │  evidence suggests that brain-derived      │     │                     │ │
│  │  neurotrophic factor (BDNF) plays a        │     │ [click to expand]   │ │
│  │  critical role in|                          │     └─────────────────────┘ │
│  │                   ▲ cursor                  │                             │
│  │                                            │     ┌── Supporting ──────┐ │
│  │                                            │     │  3 papers connect   │ │
│  │                                            │     │  BDNF → TrkB → PFC │ │
│  │                                            │     │  [Insert Smith24]   │ │
│  │                                            │     │  [Insert Lee23]     │ │
│  └────────────────────────────────────────────┘     ├── Contradicting ───┤ │
│                                                      │  1 paper negates    │ │
│  ╭─────────────────────────────────────────────╮    │  BDNF role in TRD  │ │
│  │ ○Ask ○Explore ●Write                        │    │  ⚡ [View Park22]   │ │
│  │                                              │    └────────────────────┘ │
│  │  The prompt box has EXPANDED into the editor │                           │
│  │  above. Mode toggles remain at the top.      │                           │
│  ╰─────────────────────────────────────────────╯                           │
│                                                                             │
│  Grounding: ██████░░░░ 60%  (2/5 claims cited)     [Auto-cite] [Find gap]  │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Dual-Signal Graph

As you type, the graph becomes a **dual-signal display**:

- **Supporting nodes (●)** glow warm — semantically similar to what you're writing. Papers, chunks, and entities that reinforce your current sentence. Click to insert a citation.
- **Contradicting nodes (◆)** glow sharp — papers with negated relations, conflicting assertion statuses, or chunks that explicitly dispute your claim. The graph doesn't just help you cite — it **challenges** you.

The suggestion panel splits into **Supporting** and **Contradicting** sections. The grounding meter shows how much of your writing is backed by evidence.

## Real-Time Typing Pipeline

The graph responds to your typing in real-time. Debounced at ~500ms after last keystroke:

```
TYPING PIPELINE

  ┌───────────┐     ┌───────────┐     ┌───────────┐     ┌───────────┐
  │  CURSOR   │────▶│  EXTRACT  │────▶│   EMBED   │────▶│   MATCH   │
  │  CONTEXT  │     │  ENTITIES │     │  PARAGRAPH│     │  & RANK   │
  └───────────┘     └───────────┘     └───────────┘     └───────────┘
       │                 │                 │                 │
       ▼                 ▼                 ▼                 ▼
  Extract the       Run NER on        Encode via         Query
  paragraph the     the paragraph     medcpt-query       pgvector
  cursor is in.     to find known     (768d, fast,       for top-K
  Track all         biomedical        <50ms on GPU).     similar
  entities seen     entities.         This is the        chunks.
  so far.           Highlight them    QUERY encoder      Split into
                    inline.           (asymmetric).      ● and ◆.
```

### Latency Budget (~690ms from last keystroke)

| Step | Target | How |
|------|--------|-----|
| 1. Extract paragraph | ~0ms | Client-side (Tiptap) |
| 2. NER (entity detect) | ~100ms | Edge function or cache |
| 3. Embed paragraph | ~50ms | medcpt-query on GPU |
| 4. pgvector ANN search | ~20ms | HNSW index, top-20 |
| 5. Relation lookup | ~10ms | SQL join on entity IDs |
| 6. Split ● vs ◆ | ~5ms | Client-side filter |
| 7. Update graph + panel | ~5ms | Cosmograph API calls |
| **Total** | **~190ms** | + 500ms debounce = ~690ms |

### Key Optimizations

- **NER caching**: Results cached per paragraph hash. Edits only re-NER the changed paragraph.
- **Parallel execution**: Embedding and NER fire simultaneously after debounce (independent).
- **Incremental updates**: Only the delta between previous and current highlighted nodes updates Cosmograph.
- **Pre-indexed assertions**: ● vs ◆ uses pre-computed `assertion_status` on `paper_relations` — no LLM inference needed.

## Entity Highlighting in the Editor

Every recognized entity in the editor is a **live link** to the knowledge graph:

```
  ┌── Editor ─────────────────────────────────────────────────────────────┐
  │                                                                       │
  │  Treatment-resistant depression (TRD) affects approximately 30%      │
  │  of patients with major depressive disorder. Recent evidence          │
  │  suggests that brain-derived neurotrophic factor (BDNF) plays a      │
  │  critical role in the pathophysiology of TRD, particularly            │
  │  through its interaction with TrkB signaling in the prefrontal       │
  │  cortex.                                                              │
  │                                                                       │
  │  underlined = recognized entity (hover → graph highlight,            │
  │                                  click → zoom to entity node)        │
  └───────────────────────────────────────────────────────────────────────┘
```

- **Hover** an entity → its node highlights in the mini graph, along with its immediate neighborhood
- **Click** an entity → the graph zooms to that entity node's neighborhood, detail panel slides in

## Document Fingerprint

As you write, entities accumulate into a unique **fingerprint** — the set of all mentioned entities and their relationships in the knowledge graph:

```
  ┌─── Mini Graph (while writing) ────────────────────────────────────────┐
  │                                                                        │
  │    ○  ○──○  ◐BDNF──◐TrkB  ○──○   ○                                  │
  │   ○──○    ●TRD──○    ○   ○──○                                        │
  │     ○  ◐PFC──○   ○──◐ketamine──○                                     │
  │    ○──○    ○──○  ○──○  ○                                              │
  │                                                                        │
  │   ● = current paragraph entity (bright)                               │
  │   ◐ = previously mentioned entity (dim, persistent)                   │
  │   ○ = dormant (not in your document)                                  │
  │                                                                        │
  │   The lit nodes ARE the fingerprint.                                   │
  │   The pattern grows as you write.                                     │
  │   No two documents have the same shape.                               │
  └────────────────────────────────────────────────────────────────────────┘
```

### Fingerprint as Identity

When you save a document, the fingerprint becomes its **visual identity** — a thumbnail mini-graph on the document card. Share a fingerprint and the recipient sees the same subgraph on their SoleMD instance, with gaps lit up (entities in the fingerprint they haven't encountered).

## Contradiction Signal

The ◆ signal comes from existing `assertion_status` on `paper_relations`:
- A relation `"negated"` in one paper but `"affirmed"` in another → the graph already knows this
- The write pipeline maps your entity mentions to the relation graph and surfaces disagreements
- When you acknowledge a contradiction (address it in your text), the ◆ reclassifies to ●

## The Vibe Write Experience

```
  0s    You type: "Brain-derived neurotrophic factor (BDNF)..."
        → "BDNF" underlines in the editor (NER recognized it)
        → BDNF node glows in the mini graph

  3s    You type: "...plays a critical role in treatment-resistant
        depression (TRD)."
        → "TRD" underlines too
        → Supporting panel: "3 papers affirm BDNF ↔ TRD"
        → Contradicting panel: "⚡ 1 paper negates"

  8s    You type: "Ketamine's rapid antidepressant effect..."
        → "ketamine" underlines, joins the fingerprint
        → New similarity results: papers about ketamine+BDNF

  15s   You hover "BDNF" in your text
        → BDNF node pulses, neighborhood expands: TrkB, GDNF, NGF
        → You see TrkB and think: "I should mention that too"

  20s   You click a ● supporting node (Smith 2024)
        → Citation auto-inserts: "...through BDNF-TrkB signaling [Smith 2024]"
        → Grounding meter: 20% → 40%

  25s   You notice a ◆ contradicting node glowing
        → You click it: Park 2022 found no significant BDNF difference
        → You address it in your text
        → The ◆ reclassifies to ● (acknowledged)
        → Grounding meter climbs: 60%
```

## Prompt Box Shape

Expands upward from the bottom into a full editor. Mode toggles stay at top of expanded box.

```
╭──────────────────────────────────────────────────────────────╮
│  ○Ask  ○Explore  ●Write                                      │
│ ─────────────────────────────────────────────────────────────│
│                                                              │
│  # BDNF and Treatment-Resistant Depression: A Review         │
│                                                              │
│  Treatment-resistant depression (TRD) affects approximately  │
│  30% of patients with major depressive disorder...           │
│                                                              │
│  Grounding: ██████░░░░ 60%             [Auto-cite] [Find gap]│
╰──────────────────────────────────────────────────────────────╯
```

## Phasing

| Phase | Feature |
|-------|---------|
| Phase 2 | Prompt box → Tiptap editor, dual-signal graph (● + ◆), citation insertion, grounding meter |
| Phase 3 | Counter-evidence deep dive, entity highlighting in editor, fingerprint as shareable identity |
| Future | Export → Pandoc/Typst (SoleMD.Make integration) |
