# Wiki Taxonomy & Visual Identity

> Two-axis model: **type identity** (what IS it) drives color,
> **editorial section** (where to READ it) drives navigation.
> Neither axis is derived from the other.

---

## The two axes

| Axis | Source | Purpose | Scales how |
|---|---|---|---|
| **Type identity** | UMLS semantic group | Node color, icon, graph filtering | Automatic via CUI lookup -- every entity with a UMLS CUI gets one |
| **Editorial section** | `vocab_terms.category` top-level domain | TOC, section hubs, reader journey | Curated per-term, auto-suggested for new entities |

A serotonin 2A receptor is `GENE` by semantic group (pink node) but lives in
**Neuroscience > Receptors** for the reader. Clozapine is `CHEM` (green node)
but lives in **Intervention > Psychotropics**. These are two useful lenses on
the same entity, not contradictions.

---

## Color map (semantic group to brand palette)

Static. 8 entries. This table does not grow.

| Semantic Group | Canonical Label | Brand Token | Light | Dark | Rationale |
|---|---|---|---|---|---|
| `DISO` | Disorders | `--color-warm-coral` | `#ffada4` | `#c48e88` | Clinical warmth/urgency |
| `CHEM` | Chemicals & Drugs | `--color-fresh-green` | `#aedc93` | `#8aad7a` | Therapeutic/treatment |
| `GENE` | Genes & Proteins | `--color-soft-pink` | `#eda8c4` | `#b88299` | Molecular/mechanistic |
| `ANAT` | Anatomy | `--color-golden-yellow` | `#e5c799` | `#b69d77` | Structural landmarks |
| `PHYS` | Physiology | `--color-soft-blue` | `#a8c5e9` | `#89a3bf` | Systems/processes |
| `PROC` | Procedures | `--color-soft-lavender` | `#d8bee9` | `#a899b3` | Methods/procedures |
| — | Section hubs | `--color-muted-indigo` | `#747caa` | `#8b8fbf` | Structural/navigational |
| — | Papers | `--color-paper` | `#d4c5a0` | `#a89b78` | Evidence backbone (warm parchment) |

### Paper color rationale

Papers are the primary evidence surface -- every wiki page is ultimately
generated from papers. They get a dedicated warm parchment tone that:

- Is distinct from all 7 brand entity colors
- Reads as "evidence / source material" at a glance
- Stays warm and alive (not grey/muted) because papers drive the wiki

### CSS architecture

```css
/* tokens.css :root — base accent (fallback for unknown types) */
--entity-accent: var(--brand-accent);

/* tokens.css — attribute selectors override --entity-accent per type */
[data-entity-type="disease"]  { --entity-accent: var(--color-warm-coral); }
[data-entity-type="chemical"] { --entity-accent: var(--color-fresh-green); }
/* ... (one line per type) */

/* Consumers use color-mix() at element level (NOT via intermediate custom property,
   because CSS resolves custom properties at definition site, not use site) */
.tiptap-entity-highlight {
  background: color-mix(in srgb, var(--entity-accent) 15%, transparent);
}
.entity-accent-pill {
  background: color-mix(in srgb, var(--entity-accent) 15%, transparent);
  border: 1px solid color-mix(in srgb, var(--entity-accent) 40%, transparent);
}

/* Wiki graph Pixi — explicit per-group vars (Pixi reads hex, not color-mix) */
--wiki-graph-node-diso: var(--color-warm-coral);
--wiki-graph-node-chem: var(--color-fresh-green);
/* ... */
```

**Why no `--entity-accent-bg` shorthand?** CSS custom properties using `color-mix()`
are evaluated at definition site, not inherited as expressions. A `--entity-accent-bg`
defined in `:root` would compute once with the `:root` value of `--entity-accent` and
that resolved color gets inherited — child `[data-entity-type]` overrides would not
cascade. Each consumer must call `color-mix()` directly.

### Hover & active rings

| State | Token | Rationale |
|---|---|---|
| Hover | `--brand-accent` | Consistent with app-wide interactive highlight |
| Active/selected | `--brand-accent-alt` | Consistent with app-wide active state |

---

## Section map (editorial domain to reader journey)

The `vocab_terms.category` column uses dot-notation (e.g., `clinical.diagnosis`,
`neuroscience.receptor`). The top-level domain maps to a section hub:

| Domain | Section Hub | Example categories |
|---|---|---|
| `clinical` | Disorders | `clinical.diagnosis`, `clinical.symptom`, `clinical.symptom.neuropsychiatric`, `clinical.course` |
| `intervention` | Psychotropics | `intervention.pharmacologic`, `intervention.pharmacologic.class`, `intervention.psychologic` |
| `neuroscience` | Brain Regions / Brain Networks / Receptors | `neuroscience.structure`, `neuroscience.network`, `neuroscience.receptor`, `neuroscience.neurotransmitter`, `neuroscience.cell` |
| `pharmacology` | (sub-section of Psychotropics) | `pharmacology.mechanism`, `pharmacology.enzyme`, `pharmacology.kinetic` |
| `biology` | Core Biology | `biology.gene`, `biology.biomarker` |
| `methods` | (future section) | `methods.assessment_instrument`, `methods.imaging`, `methods.diagnostic` |
| `study` | (not surfaced as wiki section) | Study metadata -- used for RAG, not reader navigation |
| `psychosocial` | (future section) | `psychosocial.determinant`, `psychosocial.environmental_factor` |
| `psychologic` | (future section) | `psychologic.framework` |
| `epidemiology` | (future section) | `epidemiology.concept` |
| `outcomes` | (future section) | `outcomes.measure` |

Note: `neuroscience` domain splits across three section hubs (regions, networks,
receptors) because the subcategories are semantically distinct for readers.
The `study.*` domain is not surfaced as a wiki section -- it describes methodology,
not browsable knowledge.

---

## Auto-assignment rules

When a new wiki page is created for an entity:

### Color (always automatic)

```
entity has vocab_term with semantic_groups?
  → yes → use primary semantic group → color map (table above)
  → no  → use entity_type → default semantic group:
              Disease / disease         → DISO
              Chemical / chemical       → CHEM
              Gene / gene              → GENE
              Receptor                 → GENE
              Anatomy                  → ANAT
              Network                  → PHYS
              Biological Process       → PHYS
           → color map
```

### Section (automatic with override)

```
entity has vocab_term with category?
  → yes → top-level domain → section hub (table above)
  → no  → semantic group → default domain:
              DISO → clinical
              CHEM → intervention
              GENE → biology
              ANAT → neuroscience
              PHYS → neuroscience
              PROC → methods
           → section hub
```

Editors can override section assignment via the wiki page frontmatter
`section:` field. Color cannot be overridden -- it comes from the ontology.

---

## Data flow: entity to wiki graph node

```
vocab_terms.tsv                    wiki_pages (DB)
  canonical_name        ────────>    title
  category              ────────>    section_domain (top-level)
  semantic_groups       ────────>    semantic_group (primary)
  umls_cui              ────────>    concept_id

wiki_pages (DB)                    WikiGraphNode (wire type)
  slug                  ────────>    slug
  title                 ────────>    label
  entity_type           ────────>    entity_type
  concept_id            ────────>    concept_id
  semantic_group  (new) ────────>    semantic_group (new)
  tags                  ────────>    tags
  family_key            ────────>    (kind: "section" if family_key = "wiki-sections")
```

### Wire type change

```typescript
// lib/engine/wiki-types.ts — WikiGraphNode
interface WikiGraphNode {
  id: string
  kind: "page" | "paper"
  label: string
  slug: string | null
  paper_id: string | null
  concept_id: string | null
  entity_type: string | null
  semantic_group: string | null   // ← NEW: UMLS semantic group for color
  tags: string[]
  year: number | null
  venue: string | null
}
```

### Graph runtime color resolution

```typescript
// features/wiki/graph-runtime/theme.ts
function nodeColor(node: SimNode, palette: WikiGraphPalette): number {
  if (node.kind === "paper") return palette.paper
  if (node.tags.includes("section")) return palette.section
  if (node.semanticGroup) return palette[node.semanticGroup] ?? palette.defaultEntity
  return palette.defaultEntity
}
```

---

## Scaling properties

| Scale event | What happens | Human work |
|---|---|---|
| Add 1 entity page | Color from semantic group, section from category | Zero (both auto-derived) |
| Add 500 entity pages | Same as above, 500 times | Zero |
| New semantic group appears | Won't happen (UMLS groups are fixed) | — |
| New domain fills up | Write one section hub (~30 lines markdown) | One-time, when domain first has pages |
| Entity has no vocab term | Fallback: PubTator type → semantic group | Zero (fallback is automatic) |
| Override section assignment | Add `section: neuroscience` to page frontmatter | Per-page, optional |

---

## Consuming the color system

The brand palette vars (`--color-warm-coral`, `--color-fresh-green`, etc.) are
the single source of truth. Every surface that needs entity-type colors reads
from the same tokens:

| Surface | Mechanism | Source |
|---|---|---|
| Wiki graph nodes (Pixi) | `theme.ts` reads `--wiki-graph-node-*` CSS vars | `tokens.css` → `var(--color-*)` |
| Entity highlights (editor) | CSS attribute selectors on `data-entity-type` | `editor.css` → `var(--color-*)` via `color-mix()` |
| Entity hover cards | (future) same `data-entity-type` pattern | `var(--color-*)` |

### Adding a new entity type color

1. If it maps to an existing semantic group — done. No changes.
2. If it's a new PubTator type:
   - Add to `_ENTITY_TYPE_SEMANTIC_GROUP` in `engine/app/wiki/service.py`
   - Add to `resolveNodeColorKey` fallback in `features/wiki/graph-runtime/theme.ts`
   - Add `[data-entity-type="..."]` rule in `app/styles/editor.css`

---

## Implementation checklist

- [x] Add `semantic_group` to `WikiGraphNode` wire type + API response
- [x] Add `--color-paper` + `--wiki-graph-node-*` CSS tokens to `tokens.css`
- [x] Update `theme.ts` palette to use semantic-group-based colors
- [x] Update `render-scene.ts` to resolve node color from semantic group
- [x] Update `types.ts` SimNode to carry `semanticGroup`
- [x] Update hover/active rings to use `--brand-accent` / `--brand-accent-alt`
- [x] Widen wiki panel defaults (520 docked / 840 expanded)
- [x] Per-entity-type editor highlights via `data-entity-type` + CSS `color-mix()`
- [ ] Add `semantic_group` column to `wiki_pages` table (migration)
- [ ] Populate `semantic_group` from vocab_terms on page creation/sync

---

_Created: 2026-04-11_
