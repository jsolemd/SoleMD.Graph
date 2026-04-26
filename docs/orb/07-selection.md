# 07 — Selection

## Modes

Cosmograph parity:

- **Single click** — picker hit, sets `useGraphStore.selectedNode`
  and `selectionMask[i] = 1`.
- **Shift-click** — toggles bit instead of replacing.
- **Rectangle** — drag a 2D screen rectangle, project resident-set
  positions to NDC, point-in-rect → bulk write `selectionMask`.
- **Lasso** — drag a free polygon, point-in-polygon test on
  projected coordinates.
- **Brush** — sphere collider in world space; particles inside
  the sphere added to selection.
- **Through-sphere lasso** — Shift modifier on lasso/rect: ignore
  depth (don't filter to front-facing only). Default is
  front-facing.
- **Attribute filter → selection** — "Select all in cluster" / "in
  this scope" / "from this entity". Driven from panel actions,
  writes via SQL into `selected_point_indices` table.

## Storage: DuckDB table is the source of truth

Selection state lives in `selected_point_indices` (already
canonical, renderer-agnostic). Both the orb and the 2D map read
this. Write paths:

- Click / shift-click → JS handler → `INSERT INTO
  selected_point_indices (paper_id) VALUES (?)`.
- Rectangle / lasso / brush — drag preview is **JS-only** during
  drag; on `pointerup` ONE `INSERT` writes the final set
  (canonical correction 12). Avoids per-frame DuckDB writes.
- Selection clear — `DELETE FROM selected_point_indices`.

`selectionMask` DataTexture is a **derived view** of this table,
written by a subscriber:

```
useEffect(() => {
  const subscription = subscribeToSelectionTable((paperIds) => {
    const mask = new Uint8Array(residentBudget);
    for (const paperId of paperIds) {
      const idx = paperToParticle.get(paperId);
      if (idx !== undefined) mask[idx] = 1;
    }
    selectionMaskTexture.image.data.set(mask);
    selectionMaskTexture.needsUpdate = true;
  });
  return () => subscription.unsubscribe();
});
```

When a selected `paperId` isn't in the resident set, the mask
ignores it — the selection is still tracked (and visible in the
ranked list, panel, and 2D map), just not glowing in the 3D orb
because the particle isn't resident.

## Rectangle / lasso projection

```
function pointsInScreenPolygon(polygon: Vec2[], camera, particles): paperId[] {
  const matrix = camera.projectionMatrix.clone()
    .multiply(camera.matrixWorldInverse);
  const result = [];
  for (let i = 0; i < residentBudget; i++) {
    const world = particleWorldPosition(i);  // posTex sample if wake; else baked
    const ndc = world.applyMatrix4(matrix);
    if (Math.abs(ndc.z) > 1) continue;       // outside frustum
    const screen = ndcToScreen(ndc);
    if (pointInPolygon(screen, polygon)) {
      if (!shiftHeld && cameraForwardDot(world) < 0) continue;  // back-face filter
      result.push(particleToPaper.get(i));
    }
  }
  return result;
}
```

Front-face filter: dot of `cameraForward · pointNormal` > 0
where `pointNormal = normalize(world - origin)`. The orb is
sphere-shaped at rest, so a front-facing point is one whose
direction-from-origin agrees with the camera-look-at-origin axis.

## Brush (3D sphere)

User toggles a sphere brush via the toolbar (canonical M3a). Cursor
controls a 3D sphere center (intersection of mouse ray with the
orb's bounding sphere or a depth-budgeted plane). Sphere radius is
a slider. Particles within `|pos - sphereCenter| < radius` enter
selection on `pointerup`.

## Selection visual

Vertex shader reads `selectionMask[i]`:

```glsl
float sel = texture2D(selectionMask, uv).r;
vColor = mix(baseColor, glowColor, sel * uSelectionGlow);
vSize *= 1.0 + sel * 0.4;  // 40% boost
```

Non-selected particles dim slightly when any selection is active
(canonical visual pattern). Dimming via `uHasSelection` uniform.

## Multi-selection panel mode

Per canonical correction 23: when `selectedPointIndices.size > 1`,
the panel shows a summary (count, cluster breakdown, top entities,
top cited) + virtualized list. Clicking a list row is equivalent
to clicking the paper on the orb. See
[12-info-panel-and-wiki.md](12-info-panel-and-wiki.md).

## Single-paper-scope guard

Per canonical correction 19: when scope narrows to 1 paper, panel
surfaces "Show this paper's neighborhood" → converts scope-of-1
into a `focus(paperId)`. Avoids the dead-end state where the user
is alone in space.

## Owns / doesn't own

Owns: selection modes, DuckDB-as-truth pattern, mask texture
derivation, projection math, brush logic, selection visual.

Doesn't own:
- Force-effect wake on click → [10-force-vocabulary.md](10-force-vocabulary.md) `focus`.
- Drag-vs-orbit arbitration → [16-gesture-arbitration.md](16-gesture-arbitration.md).
- Multi-selection panel UI → [12-info-panel-and-wiki.md](12-info-panel-and-wiki.md).

## Prerequisites

[01-architecture.md](01-architecture.md), [04-renderer.md](04-renderer.md), [05-picking.md](05-picking.md).

## Consumers

[09-search-and-rag-excitation.md](09-search-and-rag-excitation.md)
(search result writes into selection), [10-force-vocabulary.md](10-force-vocabulary.md)
(focus reads selection).

## Invalidation

- Selection model becomes per-renderer (orb-only vs map-only) →
  invalidates the DuckDB-as-truth pattern.
- Resident-LOD swap mid-drag changes the projected positions →
  cancel the drag and restart, or freeze resident set during drag.
