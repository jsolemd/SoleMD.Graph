# 12 — Info panel and wiki integration

## 3D workspace chrome

Prompt/search, ranked results, paper info, wiki content, filters, and
RAG evidence are part of the 3D `/graph` workspace. They are not a
2D-only dashboard wrapped around a canvas. The orb remains visible
while the user reads, prompts, filters, or drills into wiki context.

The 2D map lens may render the same panel state when toggled, but it
does not own separate prompt, info, or wiki flows.

## Three modes, one component

Persistent right panel. Mode driven by selection state:

| Mode | Trigger | Content |
|---|---|---|
| **single** | exactly 1 paper selected | paper metadata (title, year, journal, authors, citation count, entity count, cluster) + actions (Open wiki, Add to scope, Show neighborhood) |
| **pinned-wiki** | user pins a single paper's wiki | full wiki content overlay (entity profiles, evidence, modules) inside the same panel; orb stays visible beside it |
| **filtered-subset** | `selectedPointIndices.size > 1` OR an active scope | virtualized ranked list (count, cluster breakdown, top entities, top cited) + aggregate timeline + evidence rollup |

Single component, three views, mode driven by
`useDashboardStore.activePanelPaperId` and
`selectedPointIndices.size`.

## Ranked list as authoritative surface

The ranked list is **the authoritative textual surface** for *which
papers matter now*. The orb is the spatial/physical reading of that
same result set. Cold `/graph` paints prompt/search + ranked list +
panel as first-class workspace chrome; the orb is the persistent
spatial substrate, not decorative backdrop.

Implementation:

- Resident set + scope intersection feeds the list (≤ 16K rows
  → virtualized; ranked by `paperReferenceCount` or
  scope-relevance).
- Click a list row = click the paper on the orb (single mode).
- Hover a list row = hover the paper on the orb (transient
  `focus(paperId)` with bloom + camera lerp).
- Lasso on the orb mirrors back to the list (highlighted rows).

## Wiki content fetch

Reuses `apps/web/features/wiki/hooks/use-wiki-page-bundle.ts`
(Explore agent recon confirmed this surface is mature):

- Concurrent fetch of `fetchWikiPageClient`,
  `fetchWikiBacklinksClient`, `fetchWikiPageContextClient`.
- Page resolves first → immediate render. Context fetched only for
  entity pages.
- Backend-served via `/api/wiki/pages/[...slug]`.
- All three resolve independently without blocking markdown
  display.

Pinned-wiki mode uses the same hooks, just rendered inside the
panel overlay component instead of a `/wiki/<slug>` route.

## Wiki-on-the-orb cross-references

When wiki content references papers (entity profiles list "papers
discussing X drug"), each reference is a link that:
- Updates `useDashboardStore.activePanelPaperId` (panel goes to
  single mode for that paper).
- Dispatches `focus(paperId)` on the orb.
- Camera lerps to that paper.

Reverse direction: from a paper panel, "Open wiki" dispatches the
wiki fetch and flips panel to pinned-wiki mode.

## Panel orientation

Per canonical product thesis: panel sits **alongside** the orb,
not on top of it. Default right side, ~360 px wide. Resizable.
Collapsible. Mobile: bottom sheet that slides up.

Orb visible width = viewport - panel width. Orb stays visible
even when panel is open (preserves spatial context).

## Multi-selection actions

When `selectedPointIndices.size > 1`:

- Aggregate stats at top (count, cluster breakdown, top entities,
  top cited, year range).
- Evidence rollup: which signals span multiple selections.
- Per-row click → single mode (acts as drill-in).
- Bulk actions: "Save as scope", "Compare with current scope",
  "Export to CSV".

## Empty state

Cold `/graph`: panel shows the prompt/search bar prominent, then
recent searches and a ranked starting scope. The orb auto-rotates at
rest but stays inspectable. The user's first interaction is typed
prompt/search or list click — not "drag to discover."

## Owns / doesn't own

Owns: 3D workspace chrome, panel mode switching, three-mode component
design, ranked result surface, wiki integration via existing hooks,
mobile orientation.

Doesn't own:
- Search bar implementation → [09-search-and-rag-excitation.md](09-search-and-rag-excitation.md).
- Selection state writes → [07-selection.md](07-selection.md).
- Wiki content surfaces themselves → existing
  `apps/web/features/wiki/`.

## Prerequisites

[01-architecture.md](01-architecture.md), [07-selection.md](07-selection.md).

## Consumers

All milestones M3a-onward (panel modes evolve through the milestones).

## Invalidation

- Wiki content moves out of `apps/web/features/wiki/` → fetch
  hooks need re-pointing.
- Mobile UX requires panel to *replace* orb (full-screen) → mode
  semantics change.
- Right-panel becomes left-panel for product/UX reasons → just an
  orientation flip, no semantic change.
