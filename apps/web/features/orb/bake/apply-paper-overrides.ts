import * as THREE from "three";

import {
  ORB_PAPER_OVERRIDE_ATTRIBUTES,
  SOLEMD_DEFAULT_BUCKETS,
  type FieldSemanticBucket,
} from "@/features/field/asset/field-attribute-baker";
import type { PaperAttributesMap } from "./use-paper-attributes-baker";
import type { PaperCorpusStats } from "../stores/geometry-mutation-store";

/**
 * Paper-mode attribute override for the shared field geometry.
 *
 * Contract: call after `bakeFieldAttributes` has produced a geometry
 * with the lands-mode defaults (aClickPack.w=1, aClickPack.xyz=0,
 * bucket-assigned aBucket/aSpeed/aStreamFreq/…). This function rewrites
 * a subset of those in place for every particle index present in
 * `paperAttributes`:
 *
 *   - aSpeed         → citation-derived noise multiplier in
 *                      [PAPER_SPEED_FAST, PAPER_SPEED_SLOW] (high refs → slow)
 *   - aClickPack.w   → sprite size factor in [PAPER_SIZE_MIN, PAPER_SIZE_MAX]
 *   - aBucket        → 0 (paper bucket)
 *   - aStreamFreq / aFunnelThickness / aFunnelNarrow /
 *     aFunnelStartShift / aFunnelEndShift → buckets[0] (paper) values
 *
 * Both citation and entity scalars use a log-space percentile-anchored
 * mapping: log1p(value) is normalized against the corpus q05/q98 carried
 * on `options.stats`, then `pow(_, gamma)` eases the curve so the
 * mid-range of the corpus reads as visibly varied rather than collapsing
 * to a floor. Anchors are corpus-wide and stable across the entire
 * stream, so an already-painted particle never silently changes scale
 * when later chunks arrive — a precondition for the future physics
 * layer that will read these values. See
 * docs/future/orb-mass-normalization-port.md for the design rationale.
 *
 * Paper identity (paperId ↔ particleIndex) is NOT written to a GPU
 * attribute — the mapping lives on the JS side in the `PaperAttributesMap`
 * emitted by `usePaperAttributesBaker`. This keeps the shader under the
 * WebGL 16-attribute floor and avoids duplicating identity at two layers.
 *
 * Particles NOT in `paperAttributes` retain their lands-mode defaults —
 * this supports progressive/partial loads where sampled rows arrive in
 * chunks during landing scroll (step 5 ambition).
 *
 * Under `frameloop="demand"`, the caller MUST invoke R3F's `invalidate()`
 * after this returns (or pass it via `options.invalidate`) — bumping
 * `needsUpdate` alone does not schedule a frame. The orb blob-geometry
 * subscriber batches chunks per subscription fire and invalidates once.
 *
 * ### Lane semantics — render vs physics
 *
 * The attributes this writes (`aSpeed`, `aClickPack.w`, `aBucket`,
 * `aFunnel*`) are RENDER lanes, not physics state. `aSpeed` multiplies
 * shader noise displacement (`field-vertex-motion.glsl.ts:232`);
 * `aClickPack.w` is a sprite-size multiplier
 * (`field-vertex-motion.glsl.ts:278`). When the physics layer lands
 * (N-body, search excitation, drag, hover-zoom), it gets its own state
 * — likely a sidecar texture or a separate attribute pass. Sprite size
 * MAY render from intrinsic mass via a small mapping function, but
 * the two values live in different buffers. This separation is the
 * rule the larger Cosmograph→3D port follows: visual mappings live
 * here; intrinsic properties live next to the simulation.
 *
 * Boundary rationale: the field baker is paper-unaware; paper semantics
 * live here so the substrate stays decoupled from orb product concerns.
 *
 * ### Partial upload (addUpdateRange)
 *
 * The target attributes are flipped to `DynamicDrawUsage` when orb
 * activates (see `install-blob-mutation-subscriber`). Combined with
 * `addUpdateRange(offsetInArrayElements, countInArrayElements)` this
 * drives `gl.bufferSubData` for only the touched slice rather than a
 * full `gl.bufferData` realloc per frame. For 16384 particles × 8
 * chunks this is a meaningful bandwidth win during the landing→orb
 * streaming window.
 *
 * The applier computes a single contiguous range [minIdx..maxIdx]
 * from the chunk's index set. Chunks driven by LIMIT/OFFSET are
 * contiguous so this is tight; scattered chunks (non-contiguous) would
 * over-upload the gap, still cheaper than StaticDraw's full realloc.
 */

// Visual size factor range. Wider than the prior [0.5, 2.0] so the
// mid-range of the corpus is expressive instead of being pinned at
// the floor. Picker hit-radius (field-picking-material.ts) and the
// shader gl_PointSize math (field-vertex-motion.glsl.ts) both compose
// this multiplicatively against base point size; widening to 2.6 stays
// safely under the 64 px gl_PointSize clamp on the picking pass.
const PAPER_SIZE_MIN = 0.8;
const PAPER_SIZE_MAX = 2.6;
const PAPER_SIZE_GAMMA = 0.65;

// Speed factor range: never zero, never the hyperactive 3.0 of the
// pre-port mapping. Highly-cited papers drift slowly enough to read as
// gravitational anchors without freezing entirely; uncited papers move
// at lands-mode-typical pace. Inverted relative to size — pow shape
// applied to nRef, then mixed from FAST→SLOW.
const PAPER_SPEED_FAST = 1.75;
const PAPER_SPEED_SLOW = 0.55;
const PAPER_SPEED_GAMMA = 0.8;

const PERCENTILE_DENOM_EPS = 1e-6;

export interface ApplyPaperOverridesOptions {
  /** Override bucket set. Defaults to SOLEMD_DEFAULT_BUCKETS. */
  buckets?: readonly FieldSemanticBucket[];
  /**
   * Corpus-wide log-space percentile anchors for refCount and
   * entityCount. Computed once before the stream opens (see
   * `usePaperAttributesBaker`) and reused on every chunk.
   *
   * When omitted, the function falls back to per-call quantile-free
   * normalization derived from `paperAttributes` itself: log1p
   * transformed, min/max-anchored. This fallback is for unit tests
   * and one-shot non-streaming uses; the streaming subscriber always
   * passes `stats`.
   */
  stats?: PaperCorpusStats;
  /**
   * R3F `invalidate()` for on-demand rendering. Optional because the
   * orb subscriber prefers to batch multiple chunks under one invalidate;
   * callers that apply a single chunk should pass this so the next frame
   * reflects the write.
   */
  invalidate?: () => void;
}

export function applyPaperAttributeOverrides(
  geometry: THREE.BufferGeometry,
  paperAttributes: PaperAttributesMap,
  options: ApplyPaperOverridesOptions = {},
): void {
  if (paperAttributes.size === 0) return;

  const buckets = options.buckets ?? SOLEMD_DEFAULT_BUCKETS;
  const paperBucket = buckets[0];
  if (!paperBucket) {
    throw new Error(
      "applyPaperAttributeOverrides: buckets[0] is required (paper bucket)",
    );
  }

  const aSpeed = geometry.getAttribute("aSpeed") as THREE.BufferAttribute | undefined;
  const aClickPack = geometry.getAttribute("aClickPack") as THREE.BufferAttribute | undefined;
  const aBucket = geometry.getAttribute("aBucket") as THREE.BufferAttribute | undefined;
  const aStreamFreq = geometry.getAttribute("aStreamFreq") as THREE.BufferAttribute | undefined;
  const aFunnelThickness = geometry.getAttribute("aFunnelThickness") as THREE.BufferAttribute | undefined;
  const aFunnelNarrow = geometry.getAttribute("aFunnelNarrow") as THREE.BufferAttribute | undefined;
  const aFunnelStartShift = geometry.getAttribute("aFunnelStartShift") as THREE.BufferAttribute | undefined;
  const aFunnelEndShift = geometry.getAttribute("aFunnelEndShift") as THREE.BufferAttribute | undefined;

  if (
    !aSpeed || !aClickPack || !aBucket ||
    !aStreamFreq || !aFunnelThickness || !aFunnelNarrow ||
    !aFunnelStartShift || !aFunnelEndShift
  ) {
    throw new Error(
      "applyPaperAttributeOverrides: geometry is missing field-shader attributes — call bakeFieldAttributes first",
    );
  }

  const speedArr = aSpeed.array as Float32Array;
  const clickPackArr = aClickPack.array as Float32Array;
  const bucketArr = aBucket.array as Float32Array;
  const streamArr = aStreamFreq.array as Float32Array;
  const funnelThickArr = aFunnelThickness.array as Float32Array;
  const funnelNarrowArr = aFunnelNarrow.array as Float32Array;
  const funnelStartArr = aFunnelStartShift.array as Float32Array;
  const funnelEndArr = aFunnelEndShift.array as Float32Array;

  // Resolve percentile anchors. Streaming callers pass `stats` from the
  // pre-flight corpus query so every chunk normalizes against the same
  // log-space q05/q98. Tests and one-shot callers omit it; we derive
  // local log1p-anchored bounds from the supplied map as a fallback.
  const stats = options.stats ?? deriveLocalStats(paperAttributes);
  const refDenom = Math.max(stats.refHi - stats.refLo, PERCENTILE_DENOM_EPS);
  const entityDenom = Math.max(
    stats.entityHi - stats.entityLo,
    PERCENTILE_DENOM_EPS,
  );

  const particleCount = Math.floor(speedArr.length / 3);
  let minIdx = Number.POSITIVE_INFINITY;
  let maxIdx = Number.NEGATIVE_INFINITY;

  for (const [i, attrs] of paperAttributes) {
    if (i < 0 || i >= particleCount) continue;

    if (i < minIdx) minIdx = i;
    if (i > maxIdx) maxIdx = i;

    // Speed: log1p, percentile-anchored, inverted, gamma-eased so highly-
    // cited papers anchor without freezing.
    const nRef = clamp01(
      (Math.log1p(attrs.refCount) - stats.refLo) / refDenom,
    );
    const speedFactor =
      PAPER_SPEED_FAST +
      (PAPER_SPEED_SLOW - PAPER_SPEED_FAST) *
        Math.pow(nRef, PAPER_SPEED_GAMMA);
    speedArr[i * 3] = speedFactor;
    speedArr[i * 3 + 1] = speedFactor;
    speedArr[i * 3 + 2] = speedFactor;

    // Size: same shape, gentler gamma, mapped into the wider visual
    // range so the mid-corpus reads instead of pinning at the floor.
    // aClickPack.w lane holds sizeFactor; .xyz is written by orb physics.
    const nEntity = clamp01(
      (Math.log1p(attrs.entityCount) - stats.entityLo) / entityDenom,
    );
    clickPackArr[i * 4 + 3] =
      PAPER_SIZE_MIN +
      (PAPER_SIZE_MAX - PAPER_SIZE_MIN) *
        Math.pow(nEntity, PAPER_SIZE_GAMMA);

    bucketArr[i] = 0;
    streamArr[i] = paperBucket.aStreamFreq;
    funnelThickArr[i] = paperBucket.aFunnelThickness;
    funnelNarrowArr[i] = paperBucket.aFunnelNarrow;
    funnelStartArr[i] = paperBucket.aFunnelStartShift;
    funnelEndArr[i] = paperBucket.aFunnelEndShift;
  }

  if (!Number.isFinite(minIdx) || !Number.isFinite(maxIdx)) return;

  const particleSpan = maxIdx - minIdx + 1;

  // aClickPack is vec4 (itemSize=4). Everything else itemSize=1 except
  // aSpeed (itemSize=3). addUpdateRange takes (offset, count) in ARRAY
  // ELEMENTS, not particle indices — so multiply by itemSize.
  markRange(aSpeed, minIdx * 3, particleSpan * 3);
  markRange(aClickPack, minIdx * 4, particleSpan * 4);
  markRange(aBucket, minIdx, particleSpan);
  markRange(aStreamFreq, minIdx, particleSpan);
  markRange(aFunnelThickness, minIdx, particleSpan);
  markRange(aFunnelNarrow, minIdx, particleSpan);
  markRange(aFunnelStartShift, minIdx, particleSpan);
  markRange(aFunnelEndShift, minIdx, particleSpan);

  options.invalidate?.();
}

function markRange(
  attr: THREE.BufferAttribute,
  offset: number,
  count: number,
): void {
  attr.clearUpdateRanges();
  attr.addUpdateRange(offset, count);
  attr.needsUpdate = true;
}

function clamp01(x: number): number {
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

// Test-and-one-shot fallback when a caller hasn't pre-computed corpus
// percentiles. Uses log1p min/max over the supplied map; this is
// strictly worse than the streaming path's q05/q98 anchors but keeps
// the function callable in isolation (e.g. unit tests, ad-hoc tools).
function deriveLocalStats(
  paperAttributes: PaperAttributesMap,
): PaperCorpusStats {
  let refLo = Number.POSITIVE_INFINITY;
  let refHi = Number.NEGATIVE_INFINITY;
  let entityLo = Number.POSITIVE_INFINITY;
  let entityHi = Number.NEGATIVE_INFINITY;
  for (const attrs of paperAttributes.values()) {
    const r = Math.log1p(attrs.refCount);
    const e = Math.log1p(attrs.entityCount);
    if (r < refLo) refLo = r;
    if (r > refHi) refHi = r;
    if (e < entityLo) entityLo = e;
    if (e > entityHi) entityHi = e;
  }
  if (!Number.isFinite(refLo)) refLo = 0;
  if (!Number.isFinite(refHi)) refHi = 0;
  if (!Number.isFinite(entityLo)) entityLo = 0;
  if (!Number.isFinite(entityHi)) entityHi = 0;
  return { refLo, refHi, entityLo, entityHi };
}

export { ORB_PAPER_OVERRIDE_ATTRIBUTES };
