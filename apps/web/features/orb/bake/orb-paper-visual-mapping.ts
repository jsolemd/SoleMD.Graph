import type { PaperAttrs } from "./use-paper-attributes-baker";
import type { PaperCorpusStats } from "../stores/geometry-mutation-store";

export const ORB_PAPER_SIZE_MIN = 0.8;
export const ORB_PAPER_SIZE_MAX = 2.6;
export const ORB_PAPER_SIZE_GAMMA = 0.65;

export const ORB_PAPER_SPEED_FAST = 1.75;
export const ORB_PAPER_SPEED_SLOW = 0.55;
export const ORB_PAPER_SPEED_GAMMA = 0.8;

const PERCENTILE_DENOM_EPS = 1e-6;

export interface OrbPaperVisualMapping {
  sizeFactor: number;
  speedFactor: number;
  referenceWeight: number;
  entityWeight: number;
}

export function mapOrbPaperVisualAttributes(
  attrs: PaperAttrs,
  stats: PaperCorpusStats,
): OrbPaperVisualMapping {
  const refDenom = Math.max(stats.refHi - stats.refLo, PERCENTILE_DENOM_EPS);
  const entityDenom = Math.max(
    stats.entityHi - stats.entityLo,
    PERCENTILE_DENOM_EPS,
  );
  const referenceWeight = clamp01(
    (Math.log1p(attrs.refCount) - stats.refLo) / refDenom,
  );
  const entityWeight = clamp01(
    (Math.log1p(attrs.entityCount) - stats.entityLo) / entityDenom,
  );

  return {
    referenceWeight,
    entityWeight,
    speedFactor:
      ORB_PAPER_SPEED_FAST +
      (ORB_PAPER_SPEED_SLOW - ORB_PAPER_SPEED_FAST) *
        Math.pow(referenceWeight, ORB_PAPER_SPEED_GAMMA),
    sizeFactor:
      ORB_PAPER_SIZE_MIN +
      (ORB_PAPER_SIZE_MAX - ORB_PAPER_SIZE_MIN) *
        Math.pow(entityWeight, ORB_PAPER_SIZE_GAMMA),
  };
}

export function deriveLocalPaperCorpusStats(
  paperAttributes: Iterable<PaperAttrs>,
): PaperCorpusStats {
  let refLo = Number.POSITIVE_INFINITY;
  let refHi = Number.NEGATIVE_INFINITY;
  let entityLo = Number.POSITIVE_INFINITY;
  let entityHi = Number.NEGATIVE_INFINITY;

  for (const attrs of paperAttributes) {
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

function clamp01(x: number): number {
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}
