import * as THREE from "three";

import {
  SOLEMD_DEFAULT_BUCKETS,
  type FieldSemanticBucket,
} from "@/features/field/asset/field-attribute-baker";
import type { PaperAttributesMap } from "./use-paper-attributes-baker";

/**
 * Paper-mode attribute override for the shared field geometry.
 *
 * Contract: call after `bakeFieldAttributes` has produced a geometry
 * with the lands-mode defaults (aClickPack.w=1, aClickPack.xyz=0,
 * bucket-assigned aBucket/aSpeed/aStreamFreq/…). This function rewrites
 * a subset of those in place for every particle index present in
 * `paperAttributes`:
 *
 *   - aSpeed         → log-normalized citation proxy (high refs → slow)
 *   - aClickPack.w   → sizeFactor, entity-count-normalized, clamped [0.5, 2.0]
 *   - aBucket        → 0 (paper bucket)
 *   - aStreamFreq / aFunnelThickness / aFunnelNarrow /
 *     aFunnelStartShift / aFunnelEndShift → buckets[0] (paper) values
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
 * Boundary rationale: the field baker is paper-unaware; paper semantics
 * live here so the substrate stays decoupled from orb product concerns.
 * Marks all mutated attributes `needsUpdate = true` so the GPU resyncs.
 */

const PAPER_SIZE_FACTOR_MIN = 0.5;
const PAPER_SIZE_FACTOR_MAX = 2.0;

// Papers with many citations drift slowly so they read as "gravitational
// anchors". `(1 - log(1+r)/log(1+maxR))` maps highly-cited → 0 and
// uncited → 1; scaled by PAPER_SPEED_SCALE to match the effective range
// of lands-mode `random() * 1.0` aSpeed under typical aMove magnitudes.
const PAPER_SPEED_SCALE = 3.0;

export interface ApplyPaperOverridesOptions {
  /** Override bucket set. Defaults to SOLEMD_DEFAULT_BUCKETS. */
  buckets?: readonly FieldSemanticBucket[];
  /**
   * Max values for normalization. When omitted the function derives them
   * from `paperAttributes` itself. Pass-through when callers already have
   * them (e.g. from `usePaperAttributesBaker.maxima`).
   */
  maxima?: { refCount: number; entityCount: number };
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

  let maxRef = options.maxima?.refCount ?? 0;
  let maxEntity = options.maxima?.entityCount ?? 0;
  if (!options.maxima) {
    for (const attrs of paperAttributes.values()) {
      if (attrs.refCount > maxRef) maxRef = attrs.refCount;
      if (attrs.entityCount > maxEntity) maxEntity = attrs.entityCount;
    }
  }
  const refDenom = Math.log(1 + Math.max(maxRef, 1));
  const entityDenom = Math.max(maxEntity, 1);

  for (const [i, attrs] of paperAttributes) {
    if (i < 0 || i >= speedArr.length / 3) continue;

    const refNorm = Math.log(1 + attrs.refCount) / refDenom;
    const speedFactor = (1 - refNorm) * PAPER_SPEED_SCALE;
    speedArr[i * 3] = speedFactor;
    speedArr[i * 3 + 1] = speedFactor;
    speedArr[i * 3 + 2] = speedFactor;

    const rawSize = attrs.entityCount / entityDenom;
    // aClickPack.w lane holds sizeFactor; .xyz is written by orb physics.
    clickPackArr[i * 4 + 3] = Math.max(
      PAPER_SIZE_FACTOR_MIN,
      Math.min(PAPER_SIZE_FACTOR_MAX, rawSize * PAPER_SIZE_FACTOR_MAX),
    );

    bucketArr[i] = 0;
    streamArr[i] = paperBucket.aStreamFreq;
    funnelThickArr[i] = paperBucket.aFunnelThickness;
    funnelNarrowArr[i] = paperBucket.aFunnelNarrow;
    funnelStartArr[i] = paperBucket.aFunnelStartShift;
    funnelEndArr[i] = paperBucket.aFunnelEndShift;
  }

  aSpeed.needsUpdate = true;
  aClickPack.needsUpdate = true;
  aBucket.needsUpdate = true;
  aStreamFreq.needsUpdate = true;
  aFunnelThickness.needsUpdate = true;
  aFunnelNarrow.needsUpdate = true;
  aFunnelStartShift.needsUpdate = true;
  aFunnelEndShift.needsUpdate = true;
}
