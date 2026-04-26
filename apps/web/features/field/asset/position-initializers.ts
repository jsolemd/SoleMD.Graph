"use client";

/**
 * Deterministic position initializers for the field particle cloud.
 *
 * The cluster-ball sampler produces visible 3D cluster structure with real
 * depth variation — not a flat unit-sphere-surface distribution. Fibonacci
 * gives an evenly distributed shell when cluster semantics aren't needed.
 *
 * All samplers are seeded + deterministic so spatial memory survives reloads.
 */

export type Vec3 = [number, number, number];

/* ------------------------------------------------------------------ */
/* Deterministic PRNG — seeded mulberry32                             */
/* ------------------------------------------------------------------ */

export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/* ------------------------------------------------------------------ */
/* Cluster-ball sampler                                               */
/* ------------------------------------------------------------------ */

export interface ClusterBallSampler {
  sample: (clusterId: number) => Vec3;
  readonly numCentroids: number;
}

export interface ClusterBallOptions {
  /** Max radius for centroid placement inside the unit sphere. Default 0.6. */
  centroidRadius?: number;
  /** Gaussian spread around each centroid. Default 0.11. */
  stddev?: number;
  /** XOR salt for the offset RNG stream. Default 0x13579bdf. */
  offsetSaltXor?: number;
}

const DEFAULT_CLUSTER_CENTROID_RADIUS = 0.6;
const DEFAULT_CLUSTER_BALL_STDDEV = 0.11;
const DEFAULT_OFFSET_SALT_XOR = 0x13579bdf;

export function clusterBallSampler(
  seed: number,
  numCentroids: number,
  options: ClusterBallOptions = {},
): ClusterBallSampler {
  const centroidRadius = options.centroidRadius ?? DEFAULT_CLUSTER_CENTROID_RADIUS;
  const stddev = options.stddev ?? DEFAULT_CLUSTER_BALL_STDDEV;
  const offsetSalt = options.offsetSaltXor ?? DEFAULT_OFFSET_SALT_XOR;

  const centroidRng = mulberry32(seed);
  const centroids: Vec3[] = [];
  for (let i = 0; i < numCentroids; i += 1) {
    // Uniform interior-sphere sample (rejection) for each centroid.
    let cx = 0;
    let cy = 0;
    let cz = 0;
    let r2 = 2;
    while (r2 > 1 || r2 === 0) {
      cx = centroidRng() * 2 - 1;
      cy = centroidRng() * 2 - 1;
      cz = centroidRng() * 2 - 1;
      r2 = cx * cx + cy * cy + cz * cz;
    }
    centroids.push([
      cx * centroidRadius,
      cy * centroidRadius,
      cz * centroidRadius,
    ]);
  }

  // Separate stream for per-point Gaussian offsets so centroid and point
  // generation don't consume each other's entropy.
  const offsetRng = mulberry32(seed ^ offsetSalt);
  const gaussian = (): number => {
    // Box-Muller pair — two uniforms into one standard normal.
    let u = 0;
    while (u === 0) u = offsetRng();
    const v = offsetRng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };

  return {
    sample: (clusterId: number): Vec3 => {
      const idx = Math.abs(clusterId | 0) % numCentroids;
      const c = centroids[idx] ?? [0, 0, 0];
      return [
        c[0] + gaussian() * stddev,
        c[1] + gaussian() * stddev,
        c[2] + gaussian() * stddev,
      ];
    },
    numCentroids,
  };
}

/* ------------------------------------------------------------------ */
/* Fibonacci-sphere sampler                                           */
/* ------------------------------------------------------------------ */

export interface FibonacciSphereSampler {
  /** Sample the i-th point (0 ≤ i < count). Stable for a given (count, seed). */
  sample: (index: number) => Vec3;
  readonly count: number;
}

/**
 * Produces an evenly distributed set of points on the unit sphere surface
 * via the Fibonacci-spiral method. Deterministic for a given count/seed
 * pair. The seed controls a fixed angular phase offset so reseeded sets
 * rotate rather than collide.
 */
export function fibonacciSphereSampler(
  count: number,
  seed: number,
): FibonacciSphereSampler {
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const phase = mulberry32(seed)() * 2 * Math.PI;

  return {
    sample: (index: number): Vec3 => {
      const i = Math.max(0, Math.min(count - 1, index | 0));
      const y = 1 - (i / Math.max(1, count - 1)) * 2; // [1, -1]
      const r = Math.sqrt(Math.max(0, 1 - y * y));
      const theta = goldenAngle * i + phase;
      return [r * Math.cos(theta), y, r * Math.sin(theta)];
    },
    count,
  };
}

/* ------------------------------------------------------------------ */
/* Factory                                                            */
/* ------------------------------------------------------------------ */

export type PositionInitializerMode =
  | "fibonacci"
  | "cluster-ball"
  | "random-sphere";

export interface PositionInitializer {
  sample: (arg: { index: number; clusterId?: number }) => Vec3;
  readonly count: number;
}

export interface PositionInitializerOptions {
  count: number;
  seed: number;
  /** Required when mode === 'cluster-ball'. */
  numCentroids?: number;
  clusterBall?: ClusterBallOptions;
}

export function createPositionInitializer(
  mode: PositionInitializerMode,
  options: PositionInitializerOptions,
): PositionInitializer {
  const { count, seed } = options;

  if (mode === "fibonacci") {
    const s = fibonacciSphereSampler(count, seed);
    return {
      sample: ({ index }) => s.sample(index),
      count,
    };
  }

  if (mode === "cluster-ball") {
    if (!options.numCentroids || options.numCentroids < 1) {
      throw new Error(
        "createPositionInitializer('cluster-ball'): numCentroids must be >= 1",
      );
    }
    const s = clusterBallSampler(
      seed,
      options.numCentroids,
      options.clusterBall,
    );
    return {
      sample: ({ index, clusterId }) => s.sample(clusterId ?? index),
      count,
    };
  }

  // random-sphere — Marsaglia polar method, surface distribution.
  const rng = mulberry32(seed);
  return {
    sample: () => {
      let x = 0;
      let y = 0;
      let r2 = 2;
      while (r2 > 1 || r2 === 0) {
        x = rng() * 2 - 1;
        y = rng() * 2 - 1;
        r2 = x * x + y * y;
      }
      const f = Math.sqrt(1 - r2);
      return [2 * x * f, 2 * y * f, 1 - 2 * r2];
    },
    count,
  };
}
