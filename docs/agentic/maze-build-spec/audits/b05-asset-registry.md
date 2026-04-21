# Bucket B5 audit — Asset registry (`vd` / `ku`) + bitmap / FBX source classes

**Auditor**: agent-7
**Subsystem**: B5 — Asset registry + bitmap (`fm`) + FBX texture loader (`md`)
**Maze lines audited**: [42133, 42343] (`fm`), [42344, 42398] (`md`), [42941, 43012] (`vd` / `Ws` / `ku`)
**SoleMD files audited**:
- `apps/web/features/field/asset/point-source-registry.ts`
- `apps/web/features/field/asset/image-point-source.ts`
- `apps/web/features/field/asset/model-point-source.ts`
- `apps/web/features/field/asset/field-geometry.ts`
- `apps/web/features/field/asset/field-attribute-baker.ts`
- `apps/web/features/field/asset/point-source-types.ts`
**Canonical references**:
- `.claude/skills/module/references/maze-asset-pipeline.md`
- `.claude/skills/module/references/maze-model-point-source-inspection.md`
- `data/research/mazehq-homepage/2026-04-18/derived/asset-pipeline-map.md`
**Date**: 2026-04-19

## Summary

Maze's asset layer is a **URL-keyed static registry `vd`** paired with a **singleton async loader `Ws` (aliased `ku`)** that resolves every registered slug at startup (`ku.loadAll()`), dispatches on file extension (png/jpg/jpeg → `md.loadImage` → `fm` sprite path; gltf/glb/fbx/obj → `md.loadModel`), runs the source through `jo.fromTexture` / `jo.fromVertices` / `jo.generate`, bakes shared attributes via `jo.addParams`, centers the geometry, builds a material via `Fl.getMaterial("Shader", slug)`, wraps it in `Ts` (`THREE.Points`), and caches the result into `Ws.models[slug]`. Controllers then look up finished point-mesh entries by slug via `Ws.get(slug)`, which also lazily constructs a procedural entry through `Ws.generate(slug)` when the slug is not URL-backed.

SoleMD's asset layer is a **slug-keyed lazy in-memory cache `FieldPointSourceRegistry`** that emits **typed-array buffers** (position + baked motion/funnel/bucket attributes), **not** materialized `THREE.Points` meshes. It covers three homepage slugs (`blob`, `stream`, `pcb`), materializes on demand during `resolve({ densityScale, isMobile, ids })`, and supports an idempotent `prewarm(...)` that just calls `resolve(...)`. Sources are keyed on the composite `<env>:<density>:<id>` instead of pure slug, so desktop and mobile branches are materialized as parallel cache entries.

The two architectures diverge in deliberate ways that are all sanctioned by `references/maze-asset-pipeline.md`: SoleMD favors buffer caches over mesh caches, procedural sources over URL assets, and deferred lazy materialization over an eager `loadAll` preload. The per-source emission logic (sphere / stream / bitmap / model) matches Maze 1:1 through the round-12 primitives, with one intentional divergence on `countFactor` (documented in the asset pipeline reference). The **pcb slug is the one sanctioned source-type substitution**: Maze consumes `/public/theme/images/pcb.png` via `fromTexture`; SoleMD synthesizes a procedural bitmap via `buildPcbBitmap()` and emits points directly without ever touching an image URL. There is **no GLB/FBX/OBJ code path wired up in SoleMD**, no URL-keyed asset manifest, and no extension-dispatching loader, but the model-vertex conversion primitive (`createModelPointGeometry` + `FieldGeometry.fromVertices`) is implemented and dormant, matching Maze's contract for future slugs.

The most material drift is the **absence of a bulk preload contract**. `Ws.loadAll()` is the sole entry point the stage runtime `xi`/`Os` calls before instantiating any controller; SoleMD's `prewarmFieldPointSources` is called opportunistically by the stage mount and relies on every consumer holding the cache key correctly. No asset-key present in Maze `vd` is missing from SoleMD in a way that affects the live homepage (`pcb` is the only live bitmap slug and it is present via a different source path); the 5 registry-only slugs (`logo`, `shield`, `cubes`, `hex`, `globe`, `users`) are absent from SoleMD because they are not mounted on the homepage and the field-pipeline reference explicitly excludes them from parity.

## Parity overview

| Behavior | Maze line | SoleMD location | Ownership | State |
| --- | --- | --- | --- | --- |
| Registry shape (slug → asset handle) | `vd` at 42941–42949 | `point-source-registry.ts:55` (`Map<cacheKey, FieldPointSource>`) | surface-local | drift |
| Slug keys | `logo`, `pcb`, `shield`, `cubes`, `hex`, `globe`, `users` | `blob`, `stream`, `pcb` (via `FIELD_STAGE_ITEM_IDS`) | surface-local | drift (scope narrowed) |
| URL manifest (extension-dispatch) | `vd` file-extension switch at 42953–42976 | not implemented | delegated (no URL assets) | missing |
| Bitmap → points conversion | `jo.fromTexture` 42676–42722, invoked via `Ws.bitmapToPoints` 42997–43002 | `FieldGeometry.fromTexture` + `createImagePointGeometry` (image-point-source.ts) | shared | parity |
| Bitmap source invocation on `pcb` | `vd.pcb = "/public/theme/images/pcb.png"`, loaded via `md.loadImage` | `buildPcbBitmap()` + inline sampler at `point-source-registry.ts:318–384` | surface-local (procedural substitute) | drift (sanctioned) |
| FBX / GLB / OBJ model load | `md.loadModel` 42345–42384 (dispatch to `sm` GLTF / `cm` FBX / `fm` OBJ) | not implemented | delegated (no model slugs live) | missing |
| Model vertex → points conversion | `jo.fromVertices` 42723–42745 | `FieldGeometry.fromVertices` + `createModelPointGeometry` | shared | parity (with sanctioned integer-`countFactor` divergence) |
| Procedural geometry generation | `jo.generate` 42894–42917 via `Ws.generate` 42989–42996 | `FieldGeometry.sphere` + `FieldGeometry.stream` | shared | parity |
| Shared attribute injection | `jo.addParams` 42784–42893 invoked inside `Ws.*` | `bakeFieldAttributes` via `bakeGeometryAttributes(...)` | shared | parity |
| Recentering after emission | `n.center()` at 42992 / 42999 / 43005 | none at registry layer; bounds computed via `computeBounds` | surface-local | drift |
| Material construction tied to registry | `Fl.getMaterial("Shader", slug)` + `new Ts(n, i)` at 42993–43007 | separate (registry returns buffers only; material lives in renderer) | architectural split | sanctioned |
| Bulk preload | `Ws.loadAll()` at 42980–42982 (`Promise.all(Object.keys(vd).map(Ws.load))`) | `prewarmFieldPointSources({ densityScale, isMobile, ids? })` | surface-local | drift (sync vs. async; scope-restricted) |
| Cache identity | `Ws.models[slug]` keyed by slug | `Map<"${env}:${density}:${id}">` keyed by env×density×slug | surface-local | drift |
| Cache rebuild | `Ws.rebuild(slug)` → `Ws.generate(slug)` | `registry.clear()` (clears all) | surface-local | drift |
| Cache invalidation semantics | none explicit; registry survives for the session | cleared on `.clear()`; entries are per-`env:density:id` so density/env changes produce new entries | surface-local | drift |
| Lookup surface | `Ws.get(slug)` lazy (returns cached mesh or synthesizes procedural on demand) | `resolve({ ids })` batch; throws-path via `extractAttribute` if bake missed an attribute | surface-local | drift |
| Extension dispatch (`.png` / `.glb` / `.fbx` / `.obj`) | 42953, 42967 | not implemented | delegated | missing |
| Bitmap sprite / OBJ subclass (`fm extends as`) | 42133–42343 | none | n/a | sanctioned omission |
| FBX texture loader (`md.loadImage` / `md.loadModel` / `md.loadGLTF` / `md.loadFBX` / `md.loadOBJ`) | 42344–42398 | `loadImageElement` + `rasterizeToImageData` inside image-point-source.ts (only `.png`-style inputs, no OffscreenCanvas fallback branch needed for models) | surface-local | drift (sanctioned scope) |
| Output artifact shape | `{ model: THREE.Points }` entry carrying geometry + material | `FieldPointSource` = `{ id, pointCount, bounds, buffers: {position, aMove, aSpeed, aRandomness, aAlpha, aSelection, aIndex, aStreamFreq, aFunnel*, aBucket, color} }` | architectural split | sanctioned |
| Mobile density split at registry | indirect (mobile path handled inside stream generator via `yi.desktop`) | materialized as separate cache entries (`env = "mobile" | "desktop"`, density quantized to 0.01) | surface-local | drift (improved) |
| Deterministic seeding | none (`Math.random` throughout) | `createRandomSource(FIELD_SEED + …)` with per-(env, density, slug) offset | surface-local | drift (improved; hygienic) |
| Aggregate preload | `ku.loadAll()` invoked once from stage runtime at `[49427, 49588]` | opportunistic `prewarmFieldPointSources` at mount time | surface-local | drift |

## Drift items

### D1. No URL-keyed asset manifest

- **Maze reference**: `scripts.pretty.js:42941-42948` — `vd` is a literal `{ slug: path }` dictionary. `Ws.load(slug)` extracts the extension (`vd[slug].split(".").pop()`) and dispatches to `md.loadImage` or `md.loadModel`.
- **SoleMD location**: `apps/web/features/field/asset/point-source-registry.ts` — registry is keyed on slug-only with no URL field; `buildSource(id, …)` branches on `id` directly.
- **Drift**: SoleMD has no `FieldAssetManifest` constant. Adding a new URL-backed slug requires editing `buildSource` rather than adding an entry to a table. All three live sources (`blob`, `stream`, `pcb`) are procedural (sphere, line, or synthetic bitmap), so there is no code path that reads a PNG or GLB off disk from a registry key.
- **Severity**: Doc-only (sanctioned per `maze-asset-pipeline.md § Registry Shape` and § 2 of `derived/asset-pipeline-map.md`: Maze registry includes homepage-inactive slugs; SoleMD is intentionally scoped to homepage-active slugs).
- **Proposed fix**: If future SoleMD surfaces mount model-backed slugs, formalize a `POINT_SOURCE_MANIFEST: Record<slug, { source: "procedural" | "image" | "model"; url?: string; … }>` inside `point-source-registry.ts`. Use the `ImagePointSourceInput` union (already defined) and `createModelPointGeometry` (already implemented) as the downstream primitives. Do not mirror Maze's extension-dispatch string switch; prefer explicit discriminant on `source`.
- **Verification**: Grep `point-source-registry.ts` for any URL literal; there should be none at the current scope and any added manifest entry should carry an explicit `source` kind.

### D2. pcb slug is a procedural bitmap, not the Maze `pcb.png` asset

- **Maze reference**: `scripts.pretty.js:42943` — `pcb: "/public/theme/images/pcb.png"`, consumed by `Ws.bitmapToPoints` at 42997–43002 via `jo.fromTexture(e, cs["pcb"])`. Per `maze-asset-pipeline.md § 3`, the live pcb override is `textureScale: 0.5`, `gridRandomness: 0`, `thickness: 0`, `layers: 1`.
- **SoleMD location**: `point-source-registry.ts:318-384` — `buildPcbBitmap()` paints a fixed 72×46 `boolean[][]` grid of traces and pads, then emits two coincident ±z points per `true` cell into a `Float32Array`.
- **Drift**: SoleMD does not hit `FieldGeometry.fromTexture` for pcb. It ignores `textureScale`, `colorThreshold`, and the red-channel sampling path entirely. Emission still uses two mirrored z points per cell (matching Maze's `thickness=0, layers=1` coincidence quirk described in `maze-asset-pipeline.md`), but the geometry does not go through `bakeFieldAttributes(...)`-via-`bakeGeometryAttributes(...)` on the same code path as Maze's `pcb` (note: SoleMD *does* call `bakeGeometryAttributes` at 377, so attributes land; the divergence is in the *source bitmap*, not the baker).
- **Severity**: Nice-to-have.
- **Proposed fix**: If pcb parity matters (it does not today — the landing surface is blob-only per `scripts.pretty.js` DOM scan), add an `ImageLikeData` codepath for `pcb` using `channel: "r", colorThreshold: 200, textureScale: 0.5, gridRandomness: 0, thickness: 0, layers: 1` and drop the hand-authored bitmap. The `createImagePointGeometry` entry point already accepts `ImageLikeData` so jsdom tests do not require a real PNG.
- **Verification**: A snapshot test comparing the procedural-bitmap point count against a parity run of `createImagePointGeometry` on a rasterized `pcb.png` fixture, with `< 5%` divergence in point count and `< 5%` divergence in bbox extents.

### D3. No bulk preload / `loadAll` contract

- **Maze reference**: `scripts.pretty.js:42980-42982` — `Ws.loadAll()` is a single `Promise.all` over every registered slug, called from the stage runtime `xi`/`Os` at slice-pilot `[49427, 49588]` during boot. Controllers assume finished `Ws.models[slug]` entries are available synchronously after the boot promise resolves.
- **SoleMD location**: `point-source-registry.ts:398–402` — `prewarmFieldPointSources({ densityScale, isMobile })` is a sync call (since all current sources are procedural) and prewarms only the ids the caller names. `resolve({ ids })` is the main entry; it materializes synchronously on cache miss.
- **Drift**: There is no "fan out over every registered slug" primitive. Consumers must know which slugs they need. With the current three-slug scope and procedural generation this is fine, but any future GLB-backed slug would need an async branch that Maze's `loadAll` hides.
- **Severity**: Should-fix if any URL-backed slug is ever added.
- **Proposed fix**: When (and only when) URL-backed slugs appear, change `resolve` to return `Promise<Record<slug, source>>` and add `loadAll({ densityScale, isMobile })` that walks every id in `FIELD_STAGE_ITEM_IDS`. Keep the current sync shape for procedural-only deployments (e.g., landing) by dispatching on the manifest entry's `source` discriminant.
- **Verification**: Once implemented, the stage mount should await a single `loadAll` and only then construct controllers.

### D4. Cache key includes environment and density; rebuild semantics differ

- **Maze reference**: `Ws.models[slug]` at 42977 and 42995 — single-entry per slug, never keyed on viewport or density. `Ws.rebuild(slug)` at 42986–42988 re-runs `generate(slug)` in place.
- **SoleMD location**: `point-source-registry.ts:73–94` — cache key is `${isMobile ? "mobile" : "desktop"}:${density.toFixed(2)}:${id}`. Each combination produces an independent cached buffer.
- **Drift**: SoleMD materializes parallel desktop/mobile copies on orientation change; Maze does not. `registry.clear()` is the only invalidation primitive; there is no per-slug `rebuild`. Practical consequence: a viewport flip from desktop to mobile doubles memory (two cached stream buffers at 15000 and 10000 points) until `clear()` is called.
- **Severity**: Should-fix (memory hygiene on long-lived sessions that cross the mobile/desktop breakpoint).
- **Proposed fix**: Accept the duplication for now (streams are small; blob and pcb are env-invariant in practice) but add a `registry.invalidate({ isMobile?, densityScale? })` method and call it from the viewport-observer path. Keep the env-keyed cache — the improvement is good hygiene; only the invalidation primitive is missing.
- **Verification**: Unit test: warm desktop → warm mobile → invalidate desktop → only mobile entries remain; memory does not grow unbounded on viewport churn.

### D5. Registry emits typed-array buffers; Maze emits `THREE.Points` meshes

- **Maze reference**: 42993–43007 — every `Ws` output wraps geometry + material into `new Ts(n, i)` (`THREE.Points`) and caches that mesh as `Ws.models[slug].model`.
- **SoleMD location**: `point-source-types.ts:29–34` — `FieldPointSource = { id, pointCount, bounds, buffers }`, where buffers is a flat `Record<attribute, Float32Array>`. No mesh, no material, no `THREE.Points` object at the registry layer.
- **Drift**: Architectural split — material construction belongs to `features/field/renderer/*` in SoleMD, not to the asset registry. `maze-asset-pipeline.md § Recommended SoleMD Asset Architecture` explicitly endorses this split:

  > `AssetRegistry → PointSourceAdapter → SharedAttributeInjector → Cached BufferGeometry / typed arrays → Shared particle material family`

- **Severity**: Sanctioned (not a fix item). Called out so auditors reading Maze expecting `registry.get(slug).model` do not mistake the absence for drift.
- **Proposed fix**: None.
- **Verification**: `Grep` for `new THREE.Points` inside `features/field/asset/` — must remain zero hits.

### D6. No `.center()` call at the registry layer

- **Maze reference**: `Ws.generate` / `Ws.bitmapToPoints` / `Ws.modelToPoints` at 42992, 42999, 43005 — every emission is followed by `geometry.center()` to shift the mean to origin.
- **SoleMD location**: none in `point-source-registry.ts` or the helpers; `computeBounds` at 191–213 is read-only and only reports extents for consumers.
- **Drift**: Blob (sphere) and stream (line along x centered on 0) are already centered by construction, so this is a no-op for two of three sources. The synthetic pcb bitmap emission at 360–367 maps columns/rows into `[-1.1, 1.1] × [-0.725, 0.725]` so it too is already centered analytically. Maze centers defensively after every emission; SoleMD trusts the source generators. For the model path (`createModelPointGeometry`), SoleMD does **not** center, matching Maze's `jo.fromVertices` path but diverging from the `Ws.modelToPoints` wrapper.
- **Severity**: Nice-to-have.
- **Proposed fix**: When a model-backed slug is added, call `geometry.center()` (or manually subtract the bbox midpoint from the position buffer) inside the branch that constructs it, matching Maze's `Ws.modelToPoints` wrapper. Document the convention in the asset-pipeline reference so future slugs inherit it.
- **Verification**: Bounds of a model-backed source should be symmetric around origin (|min| ≈ |max| per axis).

### D7. No lazy `get(slug)` surface

- **Maze reference**: `Ws.get(slug)` at 42983–42985 returns the cached mesh, falling back to `Ws.generate(slug)` when the slug is procedural and has not yet been generated.
- **SoleMD location**: `resolve({ ids })` at 65–96 — always a batch call; there is no `get(id)` that returns a single pre-baked source.
- **Drift**: Consumers must supply the full `{ densityScale, isMobile }` options even when they want one slug. For landing surfaces that already have this context this is a non-issue; for deeply-nested panels that only know the slug, it is a small ergonomic burden.
- **Severity**: Nice-to-have.
- **Proposed fix**: Add `getFieldPointSource(id, options)` returning `FieldPointSource` — trivial wrapper around `resolve({ ids: [id], ...options })[id]`. Do not add an options-less overload; the env/density scoping is load-bearing.
- **Verification**: Grep consumers for the pattern `resolve({...ids: [oneId]})` and migrate them to the single-slug form.

### D8. Bitmap sprite sub-class `fm` (`OBJ` loader) has no SoleMD analog

- **Maze reference**: `scripts.pretty.js:42133-42343` — `fm extends as` is the OBJ-parsing branch of `md.loadOBJ`. It parses `v/vn/vt/f/l/p` records and materializes the result into either a vertex-only `THREE.Points` or a material-bound `THREE.Mesh`.
- **SoleMD location**: none.
- **Drift**: No OBJ inputs in SoleMD. `createModelPointGeometry` operates on any `Object3DLike` that exposes `children[].geometry.getAttribute('position')`, which covers GLTF (via three.js's `GLTFLoader`) and any future custom parser output. OBJ specifically is unsupported.
- **Severity**: Sanctioned. OBJ is not on the Maze homepage either — it is a helper the FBX path uses, and even Maze never ships an OBJ slug in `vd`.
- **Proposed fix**: None. If OBJ becomes a future input, prefer `three/examples/jsm/loaders/OBJLoader.js` over re-porting `fm`.
- **Verification**: n/a.

### D9. FBX texture loader `md` has no SoleMD analog

- **Maze reference**: `scripts.pretty.js:42344-42398` — `md.loadModel`, `md.loadGLTF`, `md.loadFBX`, `md.loadOBJ`, `md.loadImage`, `md.progressHandler`, `md.errorHandler`.
- **SoleMD location**: partial — `image-point-source.ts:36-87` implements `loadImageElement` (URL → `HTMLImageElement`) and `rasterizeToImageData` (element → `ImageLikeData`), which together cover `md.loadImage`'s role. There is no SoleMD equivalent of `md.loadModel` or the FBX/OBJ branches.
- **Drift**: No GLB loader instance is constructed anywhere in `features/field/asset/`. A future slug that wants to consume a GLB would need to call `GLTFLoader` in the caller's code and hand the `THREE.Group` into `createModelPointGeometry`. That is arguably cleaner — the registry stays pure, and the choice of loader stays with the consumer — but it also means there is no progress / error telemetry path equivalent to Maze's `md.progressHandler`.
- **Severity**: Doc-only (sanctioned when no model slugs are mounted).
- **Proposed fix**: When the first model-backed slug lands, add a `features/field/asset/model-loader.ts` that owns `GLTFLoader` construction, console-warn error handling, and a `loadModelPoints(url: string, options) → Promise<THREE.BufferGeometry>` entry point. Wire it through the manifest-driven registry (D1). Do not re-port `md` verbatim; use three's first-party `GLTFLoader` from `three/examples/jsm/loaders/GLTFLoader.js`.
- **Verification**: Once implemented, `grep new GLTFLoader` inside `features/field/asset/` should land exactly inside `model-loader.ts`.

### D10. No `cs[slug]`-driven per-slug texture option overrides

- **Maze reference**: `Ws.bitmapToPoints` at 42997–43002 passes `cs[t]` (the full scene param object for the slug) into `jo.fromTexture`, letting per-slug overrides (pcb: `textureScale: 0.5, thickness: 0, layers: 1, gridRandomness: 0`) flow through to the bitmap sampler without a separate config table.
- **SoleMD location**: `image-point-source.ts` forwards an explicit `ImagePointSourceOptions` object. The fixed pcb override values live **inside** `buildPcbBitmap` as literals (column/row counts, x/y multipliers); there is no `visual-presets.ts` entry that feeds the bitmap sampler.
- **Drift**: Coupling between `visual-presets.ts` and the bitmap sampler is not wired. For now, the override values are stable and the procedural pcb path does not need them. When D1+D2 land (URL-backed pcb), the caller must pass the `{ textureScale: 0.5, thickness: 0, layers: 1, gridRandomness: 0 }` option bag explicitly — probably sourced from `visualPresets.pcb` or a sibling `imageSamplingPresets` table.
- **Severity**: Doc-only until D2 lands.
- **Proposed fix**: If the pcb URL-asset path is restored (per D2), add a `samplingPresets: Record<slug, TextureGeometryOptions>` table in `visual-presets.ts` or adjacent, and have the registry pass `samplingPresets[id]` into `createImagePointGeometry`.
- **Verification**: Parity test: the procedural pcb bitmap and a `cs.pcb`-driven URL path produce point clouds with equal point count ±5% and equal bbox extents ±5%.

## Asset-key parity audit

| Maze `vd` key | Maze asset path | On homepage? | SoleMD coverage | Status |
| --- | --- | --- | --- | --- |
| `logo` | `/public/theme/images/logo.png` | no (per `derived/asset-pipeline-map.md § 2`; also collapses under red-channel threshold per `maze-asset-pipeline.md § 3`) | not present | sanctioned omission |
| `pcb` | `/public/theme/images/pcb.png` | yes (`index.html:1067`) | present as procedural bitmap (`buildPcbBitmap` → coincident ±z emission) | drift (sanctioned — source substitution) |
| `shield` | `/public/theme/models/Shield.glb` | no | not present (primitive exists via `createModelPointGeometry`) | sanctioned omission |
| `cubes` | `/public/theme/models/Cubes.glb` | no | not present | sanctioned omission |
| `hex` | `/public/theme/models/Net.glb` | no | not present | sanctioned omission |
| `globe` | `/public/theme/models/World.glb` | no | not present | sanctioned omission |
| `users` | `/public/theme/models/Users.glb` | no | not present | sanctioned omission |
| `blob` | — (procedural via `Ws.generate("blob")`) | yes (`data-gfx="blob"`) | present via `FieldGeometry.sphere({ count: 16384 })` | parity |
| `stream` | — (procedural via `Ws.generate("stream")`) | yes (`data-gfx="stream"`) | present via `FieldGeometry.stream({ count: desktop 15000 / mobile 10000 })` | parity |

**Conclusion**: No homepage-active Maze asset key is missing from SoleMD. The seven registry-only slugs (`logo`, `shield`, `cubes`, `hex`, `globe`, `users`, plus non-homepage `pcb.png` URL path) are absent by sanctioned design; the primitives needed to rehydrate any of them (`FieldGeometry.fromTexture` + `createImagePointGeometry` + `FieldGeometry.fromVertices` + `createModelPointGeometry`) already exist.

## Preload contract parity

**Partial**.

Matching:

- Idempotent warm on re-entry (Maze: `Ws.models[slug]` sticky; SoleMD: `Map.has(cacheKey)`).
- Deterministic emission inside a warm (Maze: implicit via `Math.random` + single-shot; SoleMD: explicit via seeded `createRandomSource`).
- Shared attribute injection runs before the consumer sees the buffer (both).

Diverging:

- **No `loadAll` entry point**. Maze: one call preloads every registered slug. SoleMD: `prewarm({ ids? })` covers only the ids the caller names, defaulting to `FIELD_STAGE_ITEM_IDS` when omitted — effectively a loadAll-over-homepage-slugs, but not over an extensible manifest.
- **No async boundary**. Maze returns `Promise.all(...)`; SoleMD `prewarm` is sync because all current sources are procedural. Parity breaks the moment a URL-backed slug lands; see D3.
- **No per-slug rebuild**. Maze: `Ws.rebuild(slug)` → single-slug regenerate. SoleMD: only `registry.clear()` (full invalidation). See D4.
- **No ready-signal / error surface**. Maze's `loadAll` rejects if any slug fails; SoleMD's sync `resolve` throws inside `extractAttribute` only if the baker dropped an attribute. Consumer-facing failure modes differ.

Verdict: **partial parity**. The live procedural-only surface works; the contract gaps surface the moment a URL-backed slug is added.

## Sanctioned deviations encountered

1. **Registry emits buffers, not meshes.** Sanctioned by `maze-asset-pipeline.md § Recommended SoleMD Asset Architecture`:

   > `AssetRegistry → PointSourceAdapter → SharedAttributeInjector → Cached BufferGeometry / typed arrays → Shared particle material family`

   Material construction is routed through `features/field/renderer/*` instead. Consumers that want a `THREE.Points` mesh rehydrate it from the buffers at the renderer boundary.

2. **Scope narrowed to homepage slugs.** Sanctioned by `data/research/mazehq-homepage/2026-04-18/derived/asset-pipeline-map.md § 2` ("do not assume every registry asset participates in the homepage flow just because it exists in the source tree") and by `maze-asset-pipeline.md § Source Families` (five model slugs listed but flagged registry-only). SoleMD implements the `createModelPointGeometry` primitive so the slugs can be added without re-architecting.

3. **pcb is procedural, not URL-backed.** Sanctioned implicitly by the round-12 layout; see `maze-asset-pipeline.md § 3` — the bitmap contract is preserved (coincident ±z emission at `thickness = 0, layers = 1`), and the sampler primitive is preserved. Only the source of the bitmap differs.

4. **Deterministic seeding via `createRandomSource`.** Sanctioned (improvement): `maze-asset-pipeline.md § Cache keys should include` enumerates `scene slug`, `breakpoint family`, `release id where relevant`, `optional density profile`. SoleMD's seed is derived from (env, density, slug) offset, matching that cache-key identity.

5. **Integer `countFactor` undershoot fix.** Sanctioned by `maze-asset-pipeline.md § Count-Factor Quirk`:

   > SoleMD divergence (`FieldGeometry.fromVertices`): integer `countFactor` values emit the full count […]. Recorded as an intentional fix; if Maze-exact parity is required for a replay, pass `countFactor - 1`.

   Implementation at `field-geometry.ts:203-214` matches the spec (`isTrailingPartial` gate only fires when `remainder > 0`).

6. **`channel: 'luma'` extension on `fromTexture`.** Sanctioned by `maze-asset-pipeline.md § 3` — SoleMD-specific extension for medical imagery. Default `'r'` preserves Maze behavior.

7. **Env-keyed cache entries instead of slug-only cache.** Sanctioned (improvement) — enables mobile/desktop parallel warm-up without mutating the source generator.

## Open questions for build-spec synthesis

1. **Manifest-driven vs. switch-driven source selection.** If/when model-backed slugs land, should SoleMD formalize the URL manifest (D1) as a constant in `point-source-registry.ts` or as a separate `asset-manifest.ts`? Recommend the latter so the registry stays focused on caching and the manifest stays scannable.

2. **`loadAll` vs. lazy-per-panel.** The current `prewarmFieldPointSources` pattern works because every consumer of the field passes through the same mount. If wiki modules / evidence overlays become independent asset consumers, should they share the process-scoped `fieldPointSourceRegistry` or own their own instances? Recommend the former — single cache, single invalidation path.

3. **Lazy `get(slug)` ergonomics.** D7's single-slug helper is trivial to add but introduces a divergence between "full resolve" and "one-off read". Recommend explicitly documenting that both live behind the same cache (no separate codepath), to forestall a future "why does `get` double-emit?" bug.

4. **Model slug centering.** Is it the registry's job (per Maze `Ws.modelToPoints`) or the consumer's (per SoleMD today for procedural slugs)? Recommend the registry — it is the only layer that sees every emission and can apply a uniform centering policy.

5. **Image-sampling presets co-location.** If pcb URL-asset parity is restored, `visualPresets.pcb` is the obvious home for `textureScale: 0.5 / thickness: 0 / layers: 1 / gridRandomness: 0`, but `visualPresets` currently mixes scene-runtime and asset-time concerns. Recommend splitting `samplingPresets` off as a sibling constant so the asset layer has one thing to read.

## Scope discoveries (Phase 1 re-slicing signal)

Bucket B5 as scoped covers three tightly-coupled concerns: the `vd` dictionary, the `Ws` / `ku` async loader with extension dispatch, and the `fm` / `md` leaf classes that handle OBJ parsing and texture loading. SoleMD fuses the dictionary and the loader into a single `FieldPointSourceRegistry` and pushes the leaf classes out of scope entirely (absent by sanction). No re-slicing needed.

One minor cartography note: `slice-06 § 8` describes `vd` as "lines [42941, 43012]", but the dictionary itself is `42941–42949` and the class `Ws` (aka `ku`) is `42950–43011` with the `var ku = Ws;` alias at `43011`. The combined range is correct; the single-line breakout would make the inheritance of `loadAll` / `get` / `rebuild` / `generate` / `bitmapToPoints` / `modelToPoints` more navigable.

## Format feedback for Phase 3

**Strengths of the pilot template**: The "Ownership" column (per pilot § Format feedback for Phase 3 recommendation 1) carries heavy signal for B5. Almost every drift row is "surface-local" or "delegated" rather than "missing"; the column keeps the drift list honest.

**Recommendations continuing from pilot**:

1. **Add a distinct table for asset keys** (as above under "Asset-key parity audit"). For asset-registry buckets, the slug-by-slug view is more scannable than the mixed-behavior parity table, and it immediately surfaces homepage-active vs. registry-only status.

2. **Distinguish "primitive exists, slug unused" from "primitive missing, slug unused"**. This bucket illustrates why: `shield`/`cubes`/`hex`/`globe`/`users` are all "slug unused", but the `createModelPointGeometry` primitive is already present and tested, so adding them is a manifest edit, not an architectural change. Phase 4 should note this distinction so it does not re-audit absent slugs and flag them as large gaps.

3. **Call out sync vs. async preload contracts explicitly**. The partial preload parity in B5 hinges on a single implementation detail (no URL sources today, sync `prewarm` works). Any future URL-backed slug flips the contract. Phase 4 should encode the trigger condition rather than the current point-in-time parity state.

## Format feedback for Phase 1

The `maze-asset-pipeline.md` reference is accurate and complete; no gaps surfaced during this audit. The `maze-model-point-source-inspection.md` archive table is the right level of detail for future model-slug rehydration work. One suggestion: add an explicit "homepage-active vs. registry-only" column to `maze-model-point-source-inspection.md § Archived Model Summary` mirroring `derived/asset-pipeline-map.md § 2` so auditors do not need to cross-reference two files to learn that all five archived models are registry-only on the live homepage.
