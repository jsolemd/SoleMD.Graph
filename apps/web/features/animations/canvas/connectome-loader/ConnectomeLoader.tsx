"use client";
/**
 * Connectome particle field loading backdrop.
 *
 * Mechanistic intent: a dense, cosmograph-style dot cloud. Each node
 * is an independent discrete unit in a stochastic 3D volume, drifting
 * in homeostatic equilibrium — no rigid rotation, no net directional
 * flow, no central convergence, no edges. Camera is static. Fog
 * handles depth-of-field. Entity-highlight palette drives per-node
 * color (disease / chemical / gene / receptor / anatomy / network /
 * species — see app/styles/tokens.css).
 *
 * Handoff stability: the simulation state (positions, velocities,
 * node colors) lives in a module-level singleton so the route-level
 * `app/loading.tsx` Canvas and the client-side `GraphBundleLoading-
 * Overlay` Canvas share one physics state. Only one Canvas is mounted
 * at a time; on unmount+remount the new Canvas reads the same arrays
 * and drift continues without a visible snap.
 *
 * Rendering: `<points>` + stock `<pointsMaterial>` with a 64×64
 * CanvasTexture soft disk as `map`, so the field stays a bit
 * defocused behind the interactive foreground constellations without
 * paying for a fullscreen CSS blur. The backdrop is the wrapper
 * div's `var(--background)`, so the connectome tracks light/dark
 * theme via CSS (Canvas is alpha-transparent).
 *
 * Motion: double-LPF cascade — a slow random walk on `goalVel`
 * drives `driftVel` which drives `vel` which integrates into `pos`.
 * Each stage is an exponential ease (~1.3 s / ~2.1 s tau), so
 * trajectories are smooth curves with no per-frame direction flips.
 * All velocity layers start seeded at random-walk equilibrium so
 * motion is at full steady-state speed from frame 1.
 *
 * Performance: 6000 nodes × cascade + integrate + boundary ≈ 200k
 * scalar ops, well under 2 ms/frame. One draw call, no edge pass.
 */
import { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import {
  type BufferAttribute,
  CanvasTexture,
  Color,
  DynamicDrawUsage,
  type Points as PointsImpl,
} from "three";
import {
  brandPastelFallbackHexByKey,
  brandPastelVarNameByKey,
} from "@/lib/pastel-tokens";

export const NODE_COUNT = 6000;
const BOUNDARY_RADIUS = 6;
const BOUNDARY_PULL = 1.0;
// Double-LPF cascade — the only source of noise is the goalVel random
// walk; two eased layers smooth everything else into continuous curves.
//   goalVel  : bounded random walk (where the node "wants" to go)
//   driftVel : eases toward goalVel  (first smoothing, ~2.8 s tau)
//   vel      : eases toward driftVel (second smoothing, ~4.2 s tau)
//   pos      : integrates vel
// End-to-end response ≈ 7 s from a random kick to actual motion,
// so trajectories are ultra-smooth curves — glacial, breathing drift.
const GOAL_KICK = 0.008;
const GOAL_DAMPING = 0.999;
const DRIFT_EASE = 0.006; // driftVel chases goalVel  (first LPF, ~2.8 s tau)
const VEL_EASE = 0.004; // vel chases driftVel        (second LPF, ~4.2 s tau)

// Equilibrium uniform(-a, a) half-width for goalVel's random walk, so
// all three velocity layers start at steady-state amplitude instead of
// ramping up from zero. Derived from var = K² / (12·(1−D²)).
const INITIAL_VEL_SPREAD =
  (2 * GOAL_KICK) / Math.sqrt(12 * (1 - GOAL_DAMPING * GOAL_DAMPING));
const POINT_SIZE = 0.068;
const PALETTE_SATURATION_BOOST = 1.3;

const CONNECTOME_PALETTE_KEYS = [
  "warm-coral",
  "fresh-green",
  "soft-pink",
  "golden-yellow",
  "soft-blue",
  "soft-lavender",
] as const;

// Entity-highlight token names — see app/styles/tokens.css
const ENTITY_TOKENS = CONNECTOME_PALETTE_KEYS.map(
  (key) => brandPastelVarNameByKey[key],
);

const FALLBACK_PALETTE = CONNECTOME_PALETTE_KEYS.map(
  (key) => brandPastelFallbackHexByKey[key],
);

function readCssColor(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return v || fallback;
}

let circleTextureCache: CanvasTexture | null = null;

// 64×64 soft disk on transparent background. Used as the `map` on
// pointsMaterial so the field reads slightly blurred and pushed
// back behind the foreground semantic layer.
function getCircleTexture(): CanvasTexture {
  if (circleTextureCache) return circleTextureCache;
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas context unavailable");
  const center = size / 2;
  const radius = size / 2 - 1.5;
  const gradient = ctx.createRadialGradient(center, center, 0, center, center, radius);
  gradient.addColorStop(0, "rgba(255,255,255,0.92)");
  gradient.addColorStop(0.48, "rgba(255,255,255,0.68)");
  gradient.addColorStop(0.78, "rgba(255,255,255,0.22)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const tex = new CanvasTexture(canvas);
  tex.needsUpdate = true;
  circleTextureCache = tex;
  return tex;
}

type Theme = "light" | "dark";
interface ConnectomeLoaderProps {
  paused?: boolean;
}

export type SimState = {
  pos: Float32Array;
  vel: Float32Array;
  driftVel: Float32Array;
  goalVel: Float32Array;
  col: Float32Array;
};

let sharedSimState: SimState | null = null;
let sharedSimTheme: Theme | null = null;

function inferTheme(bgColor: string): Theme {
  const c = new Color(bgColor);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  return hsl.l > 0.5 ? "light" : "dark";
}

function getOrCreateSimState(theme: Theme): SimState {
  if (sharedSimState && sharedSimTheme === theme) return sharedSimState;
  const hsl = { h: 0, s: 0, l: 0 };
  const palette = ENTITY_TOKENS.map((name, i) => {
    const c = new Color(
      readCssColor(name, FALLBACK_PALETTE[i] ?? brandPastelFallbackHexByKey["soft-blue"]),
    );
    c.getHSL(hsl);
    if (theme === "light") {
      // On a white surface, native pastels (~80% lightness) nearly
      // disappear. Drop lightness to ~44% so hues read as distinct
      // dark jewel tones — biological-microscopy feel.
      c.setHSL(hsl.h, Math.min(1, hsl.s * 1.15), 0.44);
    } else {
      // On a black void, keep pastel lightness and boost saturation
      // so hues cut through the additive density cleanly.
      c.setHSL(hsl.h, Math.min(1, hsl.s * PALETTE_SATURATION_BOOST), hsl.l);
    }
    return c;
  });
  const pos = new Float32Array(NODE_COUNT * 3);
  const vel = new Float32Array(NODE_COUNT * 3);
  const driftVel = new Float32Array(NODE_COUNT * 3);
  const goalVel = new Float32Array(NODE_COUNT * 3);
  const col = new Float32Array(NODE_COUNT * 3);
  for (let i = 0; i < NODE_COUNT; i++) {
    // Uniform inside a sphere of radius BOUNDARY_RADIUS.
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const r = Math.cbrt(Math.random()) * BOUNDARY_RADIUS;
    const sinPhi = Math.sin(phi);
    pos[i * 3] = r * sinPhi * Math.cos(theta);
    pos[i * 3 + 1] = r * sinPhi * Math.sin(theta);
    pos[i * 3 + 2] = r * Math.cos(phi);

    // Seed all three velocity layers at the goalVel random-walk
    // equilibrium amplitude (aligned), so drift starts at steady-state
    // speed on frame 1 instead of ramping up from zero.
    const svx = (Math.random() - 0.5) * INITIAL_VEL_SPREAD;
    const svy = (Math.random() - 0.5) * INITIAL_VEL_SPREAD;
    const svz = (Math.random() - 0.5) * INITIAL_VEL_SPREAD;
    goalVel[i * 3] = svx;
    goalVel[i * 3 + 1] = svy;
    goalVel[i * 3 + 2] = svz;
    driftVel[i * 3] = svx;
    driftVel[i * 3 + 1] = svy;
    driftVel[i * 3 + 2] = svz;
    vel[i * 3] = svx;
    vel[i * 3 + 1] = svy;
    vel[i * 3 + 2] = svz;

    const c = palette[i % palette.length];
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  sharedSimState = { pos, vel, driftVel, goalVel, col };
  sharedSimTheme = theme;
  return sharedSimState;
}

export function stepSimulation(sim: SimState, dt: number): void {
  const { pos, vel, driftVel, goalVel } = sim;
  const boundaryR2 = BOUNDARY_RADIUS * BOUNDARY_RADIUS;

  for (let i = 0; i < NODE_COUNT; i++) {
    const b = i * 3;

    // 1. Goal velocity: slow bounded random walk (only source of noise).
    goalVel[b] =
      (goalVel[b] + (Math.random() - 0.5) * GOAL_KICK) * GOAL_DAMPING;
    goalVel[b + 1] =
      (goalVel[b + 1] + (Math.random() - 0.5) * GOAL_KICK) * GOAL_DAMPING;
    goalVel[b + 2] =
      (goalVel[b + 2] + (Math.random() - 0.5) * GOAL_KICK) * GOAL_DAMPING;

    // 2. Drift velocity: first LPF — smooths goalVel's per-frame jitter.
    driftVel[b] += (goalVel[b] - driftVel[b]) * DRIFT_EASE;
    driftVel[b + 1] += (goalVel[b + 1] - driftVel[b + 1]) * DRIFT_EASE;
    driftVel[b + 2] += (goalVel[b + 2] - driftVel[b + 2]) * DRIFT_EASE;

    // 3. Actual velocity: second LPF — further smooths into a curve.
    vel[b] += (driftVel[b] - vel[b]) * VEL_EASE;
    vel[b + 1] += (driftVel[b + 1] - vel[b + 1]) * VEL_EASE;
    vel[b + 2] += (driftVel[b + 2] - vel[b + 2]) * VEL_EASE;

    // 4. Integrate position.
    pos[b] += vel[b] * dt;
    pos[b + 1] += vel[b + 1] * dt;
    pos[b + 2] += vel[b + 2] * dt;

    // Soft spherical boundary — steer the GOAL (outermost driver)
    // inward so the cascade propagates the redirect smoothly.
    const x = pos[b];
    const y = pos[b + 1];
    const z = pos[b + 2];
    const d2 = x * x + y * y + z * z;
    if (d2 > boundaryR2) {
      const d = Math.sqrt(d2);
      const over = d - BOUNDARY_RADIUS;
      const pull = over * BOUNDARY_PULL * dt;
      const inv = 1 / d;
      pos[b] -= x * inv * pull;
      pos[b + 1] -= y * inv * pull;
      pos[b + 2] -= z * inv * pull;
      const vrDot =
        (goalVel[b] * x + goalVel[b + 1] * y + goalVel[b + 2] * z) * inv;
      if (vrDot > 0) {
        goalVel[b] -= x * inv * vrDot * 0.5;
        goalVel[b + 1] -= y * inv * vrDot * 0.5;
        goalVel[b + 2] -= z * inv * vrDot * 0.5;
      }
    }
  }
}

function ConnectomeField({ theme, paused }: { theme: Theme; paused: boolean }) {
  const pointsRef = useRef<PointsImpl>(null);
  const sim = useMemo(() => getOrCreateSimState(theme), [theme]);
  const circleTexture = useMemo(() => getCircleTexture(), []);

  useFrame((_, delta) => {
    if (paused) return;
    stepSimulation(sim, Math.min(delta, 0.05));
    const points = pointsRef.current;
    if (points) {
      const pa = points.geometry.attributes.position as BufferAttribute;
      pa.needsUpdate = true;
    }
  });

  return (
    <points ref={pointsRef} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[sim.pos, 3]}
          usage={DynamicDrawUsage}
        />
        <bufferAttribute attach="attributes-color" args={[sim.col, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={POINT_SIZE}
        sizeAttenuation
        vertexColors
        map={circleTexture}
        alphaTest={0.02}
        transparent
        opacity={0.72}
        depthWrite={false}
        toneMapped={false}
      />
    </points>
  );
}

export default function ConnectomeLoader({
  paused = false,
}: ConnectomeLoaderProps) {
  // bgColor is only used for the fog (three.js Color can't parse
  // `var(...)`) so a one-shot read at mount is fine; the wrapper div
  // itself uses the raw CSS var so the backdrop tracks theme changes
  // in real time regardless of when the Canvas mounted.
  const { bgColor, theme } = useMemo(() => {
    const bg = readCssColor("--graph-bg", "#ffffff");
    return { bgColor: bg, theme: inferTheme(bg) };
  }, []);

  return (
    <div className="pointer-events-none absolute inset-0 z-0 bg-[var(--background)]">
      <Canvas
        camera={{ position: [0, 0, 7], fov: 60 }}
        dpr={[1, 2]}
        frameloop={paused ? "never" : "always"}
        gl={{ antialias: true, alpha: true }}
      >
        <fog attach="fog" args={[bgColor, 4, 12]} />
        <ConnectomeField theme={theme} paused={paused} />
      </Canvas>
    </div>
  );
}
