import * as THREE from "three";

// Maze bakes per-point motion attributes in four semantic buckets with a
// 70/12/10/8 population split. Numerical ranges come from
// `scripts.pretty.js:42784-42893`; SoleMD relabels them under product terms
// but keeps the motion values intact so the field reads identically to Maze.
//
// Bucket id -> aBucket float (0..N-1) is exposed via `buildBucketIndex()` and
// consumed by the Phase 4 burst overlay to gate color tinting.

export interface FieldSemanticBucket {
  id: string;
  weight: number;
  aStreamFreq: number;
  aFunnelThickness: number;
  aFunnelNarrow: number;
  aFunnelStartShift: number;
  aFunnelEndShift: number;
}

export const SOLEMD_DEFAULT_BUCKETS: readonly FieldSemanticBucket[] = [
  // Matches Maze `urgentFix` motion values — reserved for paper-story
  // selected-paper pulses.
  {
    id: "paper",
    weight: 0.1,
    aStreamFreq: 0.1,
    aFunnelThickness: 0.1,
    aFunnelNarrow: 0.03,
    aFunnelStartShift: 0.42,
    aFunnelEndShift: 0.29,
  },
  // Maze `patchInSLA` — entity bucket.
  {
    id: "entity",
    weight: 0.12,
    aStreamFreq: -0.2,
    aFunnelThickness: 0.14,
    aFunnelNarrow: 0.04,
    aFunnelStartShift: 0.28,
    aFunnelEndShift: -0.06,
  },
  // Maze `ignore` — synthesis/relation bucket.
  {
    id: "relation",
    weight: 0.08,
    aStreamFreq: -1.4,
    aFunnelThickness: 0.18,
    aFunnelNarrow: 0.05,
    aFunnelStartShift: 0.1,
    aFunnelEndShift: -0.29,
  },
  // Maze `notExploitable` — dominant ambient majority (70% of points).
  {
    id: "evidence",
    weight: 0.7,
    aStreamFreq: 0.5,
    aFunnelThickness: 0.55,
    aFunnelNarrow: 0.18,
    aFunnelStartShift: -0.25,
    aFunnelEndShift: -0.4,
  },
];

export interface FieldAttributeBakeOptions {
  random: () => number;
  buckets?: readonly FieldSemanticBucket[];
  moveRange?: number;
  alphaRange?: readonly [number, number];
  randomnessScale?: { x: number; y: number; z: number };
}

const DEFAULT_MOVE_RANGE = 30;
const DEFAULT_ALPHA_RANGE = [0.2, 1] as const;
const DEFAULT_RANDOMNESS_SCALE = { x: 0, y: 1, z: 0.5 };

export function buildBucketIndex(
  buckets: readonly FieldSemanticBucket[],
): Record<string, number> {
  const index: Record<string, number> = {};
  for (let i = 0; i < buckets.length; i += 1) {
    index[buckets[i]!.id] = i;
  }
  return index;
}

// Maze sequences the bucket lookup as: 30% chance to fall into a non-default
// bucket, then within that 30% a 15%/40%/100% cumulative split chooses
// paper/entity/relation. The remaining 70% is the default ambient bucket.
// `scripts.pretty.js:42786-42815`.
function pickBucketIndex(
  buckets: readonly FieldSemanticBucket[],
  random: () => number,
): number {
  // SoleMD uses a generic cumulative draw so custom bucket sets with N
  // weights still work. The default bucket set reproduces Maze's split bit
  // for bit because weights sum to 1 and relative proportions match.
  const total = buckets.reduce((sum, bucket) => sum + bucket.weight, 0);
  let cursor = random() * total;
  for (let i = 0; i < buckets.length; i += 1) {
    cursor -= buckets[i]!.weight;
    if (cursor <= 0) return i;
  }
  return buckets.length - 1;
}

// Writes every Maze attribute (aMove, aSpeed, aRandomness, aAlpha, aSelection,
// aIndex, aStreamFreq, aFunnelThickness, aFunnelNarrow, aFunnelStartShift,
// aFunnelEndShift) plus SoleMD `aBucket` onto the given BufferGeometry.
// Requires the position attribute to already be present (determines count).
export function bakeFieldAttributes(
  geometry: THREE.BufferGeometry,
  options: FieldAttributeBakeOptions,
): void {
  const positionAttr = geometry.getAttribute("position") as
    | THREE.BufferAttribute
    | undefined;
  if (!positionAttr) {
    throw new Error(
      "bakeFieldAttributes requires a BufferGeometry with a position attribute",
    );
  }

  const count = positionAttr.count;
  const {
    random,
    buckets = SOLEMD_DEFAULT_BUCKETS,
    moveRange = DEFAULT_MOVE_RANGE,
    alphaRange = DEFAULT_ALPHA_RANGE,
    randomnessScale = DEFAULT_RANDOMNESS_SCALE,
  } = options;

  const aMove = new Float32Array(count * 3);
  const aSpeed = new Float32Array(count * 3);
  const aRandomness = new Float32Array(count * 3);
  const aAlpha = new Float32Array(count);
  const aSelection = new Float32Array(count);
  const aIndex = new Float32Array(count);
  const aStreamFreq = new Float32Array(count);
  const aFunnelThickness = new Float32Array(count);
  const aFunnelNarrow = new Float32Array(count);
  const aFunnelStartShift = new Float32Array(count);
  const aFunnelEndShift = new Float32Array(count);
  const aBucket = new Float32Array(count);

  const alphaMin = alphaRange[0];
  const alphaSpan = alphaRange[1] - alphaRange[0];

  for (let i = 0; i < count; i += 1) {
    const bucketIndex = pickBucketIndex(buckets, random);
    const bucket = buckets[bucketIndex]!;

    aMove[i * 3] = (random() * 2 - 1) * moveRange;
    aMove[i * 3 + 1] = (random() * 2 - 1) * moveRange;
    aMove[i * 3 + 2] = (random() * 2 - 1) * moveRange;

    aSpeed[i * 3] = random();
    aSpeed[i * 3 + 1] = random();
    aSpeed[i * 3 + 2] = random();

    aRandomness[i * 3] = (random() - 0.5) * 2 * randomnessScale.x;
    aRandomness[i * 3 + 1] = (random() - 0.5) * 2 * randomnessScale.y;
    aRandomness[i * 3 + 2] = (random() - 0.5) * 2 * randomnessScale.z;

    aAlpha[i] = alphaMin + random() * alphaSpan;
    aSelection[i] = random();
    aIndex[i] = i;

    aStreamFreq[i] = bucket.aStreamFreq;
    aFunnelThickness[i] = bucket.aFunnelThickness;
    aFunnelNarrow[i] = bucket.aFunnelNarrow;
    aFunnelStartShift[i] = bucket.aFunnelStartShift;
    aFunnelEndShift[i] = bucket.aFunnelEndShift;
    aBucket[i] = bucketIndex;
  }

  geometry.setAttribute("aMove", new THREE.BufferAttribute(aMove, 3));
  geometry.setAttribute("aSpeed", new THREE.BufferAttribute(aSpeed, 3));
  geometry.setAttribute(
    "aRandomness",
    new THREE.BufferAttribute(aRandomness, 3),
  );
  geometry.setAttribute("aAlpha", new THREE.BufferAttribute(aAlpha, 1));
  geometry.setAttribute("aSelection", new THREE.BufferAttribute(aSelection, 1));
  geometry.setAttribute("aIndex", new THREE.BufferAttribute(aIndex, 1));
  geometry.setAttribute(
    "aStreamFreq",
    new THREE.BufferAttribute(aStreamFreq, 1),
  );
  geometry.setAttribute(
    "aFunnelThickness",
    new THREE.BufferAttribute(aFunnelThickness, 1),
  );
  geometry.setAttribute(
    "aFunnelNarrow",
    new THREE.BufferAttribute(aFunnelNarrow, 1),
  );
  geometry.setAttribute(
    "aFunnelStartShift",
    new THREE.BufferAttribute(aFunnelStartShift, 1),
  );
  geometry.setAttribute(
    "aFunnelEndShift",
    new THREE.BufferAttribute(aFunnelEndShift, 1),
  );
  geometry.setAttribute("aBucket", new THREE.BufferAttribute(aBucket, 1));
}
