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
 * Rendering: `<points>` + drei `<PointMaterial>` (which fragment-
 * discards non-circular pixels so dots read as crisp circles rather
 * than squares at any DPR). Additive blending on a black background
 * lets dense regions glow without a custom shader.
 *
 * Performance: 6000 nodes × per-frame drift ≈ 120k scalar ops, ~1 ms
 * on a modern laptop. No edge pass means the frame budget is almost
 * entirely drift + one draw call.
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

const NODE_COUNT = 6000;
const BOUNDARY_RADIUS = 6;
const BOUNDARY_PULL = 1.6;
// Target-velocity low-pass filter.
// Each node has a slowly-drifting `targetVel`; actual `vel` eases toward
// it each frame. This breaks the structural per-frame jitter of straight
// Brownian kicks — the velocity direction only changes over ~1 s windows,
// so each dot streams smoothly rather than wiggling.
const TARGET_KICK = 0.06; // per-frame random walk on targetVel
const TARGET_DAMPING = 0.996; // keeps targetVel bounded
const VEL_EASE = 0.03; // how fast vel chases targetVel — lower = smoother
const POINT_SIZE = 0.05;
const PALETTE_SATURATION_BOOST = 1.3;

const RNG_SEED = 0xc0ffee;

// Entity-highlight token names — see app/styles/tokens.css
const ENTITY_TOKENS = [
  "--color-warm-coral", // disease
  "--color-fresh-green", // chemical
  "--color-soft-pink", // gene, receptor
  "--color-golden-yellow", // anatomy
  "--color-soft-blue", // network, biological process
  "--color-soft-lavender", // species
] as const;

const FALLBACK_PALETTE = [
  "#ffada4",
  "#aedc93",
  "#eda8c4",
  "#e5c799",
  "#a8c5e9",
  "#d8bee9",
] as const;

function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function readCssColor(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return v || fallback;
}

let circleTextureCache: CanvasTexture | null = null;

// 64×64 anti-aliased white circle on transparent background. Used as
// the `map` on pointsMaterial with alphaTest so non-circle pixels are
// discarded — guaranteed crisp circles regardless of blending mode,
// no fragment-shader monkey-patching required.
function getCircleTexture(): CanvasTexture {
  if (circleTextureCache) return circleTextureCache;
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas context unavailable");
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 1.5, 0, Math.PI * 2);
  ctx.closePath();
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  const tex = new CanvasTexture(canvas);
  tex.needsUpdate = true;
  circleTextureCache = tex;
  return tex;
}

type Theme = "light" | "dark";

type SimState = {
  pos: Float32Array;
  vel: Float32Array;
  targetVel: Float32Array;
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
  const rand = mulberry32(RNG_SEED);
  const hsl = { h: 0, s: 0, l: 0 };
  const palette = ENTITY_TOKENS.map((name, i) => {
    const c = new Color(readCssColor(name, FALLBACK_PALETTE[i]));
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
  const targetVel = new Float32Array(NODE_COUNT * 3);
  const col = new Float32Array(NODE_COUNT * 3);
  for (let i = 0; i < NODE_COUNT; i++) {
    // Uniform inside a sphere of radius BOUNDARY_RADIUS.
    const theta = rand() * Math.PI * 2;
    const phi = Math.acos(2 * rand() - 1);
    const r = Math.cbrt(rand()) * BOUNDARY_RADIUS;
    const sinPhi = Math.sin(phi);
    pos[i * 3] = r * sinPhi * Math.cos(theta);
    pos[i * 3 + 1] = r * sinPhi * Math.sin(theta);
    pos[i * 3 + 2] = r * Math.cos(phi);

    // vel and targetVel both start at zero; the random walk seeds
    // targetVel within ~1 s and vel eases into it.

    const c = palette[i % palette.length];
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  sharedSimState = { pos, vel, targetVel, col };
  sharedSimTheme = theme;
  return sharedSimState;
}

function ConnectomeField({ theme }: { theme: Theme }) {
  const pointsRef = useRef<PointsImpl>(null);
  const sim = useMemo(() => getOrCreateSimState(theme), [theme]);
  const circleTexture = useMemo(() => getCircleTexture(), []);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    const { pos, vel, targetVel } = sim;

    // Target-velocity low-pass filter for smooth, streaming drift.
    // Structure:
    //   targetVel = slow random walk (bounded, small kicks)
    //   vel       = eases toward targetVel each frame
    //   pos       = integrates vel over dt
    // The vel ease (~0.03/frame = ~0.5 s time constant) ensures short-
    // term jitter in targetVel is smoothed out before it reaches pos.
    for (let i = 0; i < NODE_COUNT; i++) {
      const b = i * 3;

      // Target velocity: slow bounded random walk.
      targetVel[b] =
        (targetVel[b] + (Math.random() - 0.5) * TARGET_KICK) * TARGET_DAMPING;
      targetVel[b + 1] =
        (targetVel[b + 1] + (Math.random() - 0.5) * TARGET_KICK) *
        TARGET_DAMPING;
      targetVel[b + 2] =
        (targetVel[b + 2] + (Math.random() - 0.5) * TARGET_KICK) *
        TARGET_DAMPING;

      // Ease actual velocity toward target (exponential approach).
      vel[b] += (targetVel[b] - vel[b]) * VEL_EASE;
      vel[b + 1] += (targetVel[b + 1] - vel[b + 1]) * VEL_EASE;
      vel[b + 2] += (targetVel[b + 2] - vel[b + 2]) * VEL_EASE;

      // Integrate position.
      pos[b] += vel[b] * dt;
      pos[b + 1] += vel[b + 1] * dt;
      pos[b + 2] += vel[b + 2] * dt;

      // Soft spherical boundary — pull targetVel inward so the node
      // re-directs organically rather than bouncing off the wall.
      const x = pos[b];
      const y = pos[b + 1];
      const z = pos[b + 2];
      const d2 = x * x + y * y + z * z;
      if (d2 > BOUNDARY_RADIUS * BOUNDARY_RADIUS) {
        const d = Math.sqrt(d2);
        const over = d - BOUNDARY_RADIUS;
        const pull = over * BOUNDARY_PULL * dt;
        const inv = 1 / d;
        pos[b] -= x * inv * pull;
        pos[b + 1] -= y * inv * pull;
        pos[b + 2] -= z * inv * pull;
        // Steer target velocity inward by subtracting the outward
        // radial component. Keeps flow smooth, no hard bounces.
        const vrDot =
          (targetVel[b] * x + targetVel[b + 1] * y + targetVel[b + 2] * z) *
          inv;
        if (vrDot > 0) {
          targetVel[b] -= x * inv * vrDot * 0.5;
          targetVel[b + 1] -= y * inv * vrDot * 0.5;
          targetVel[b + 2] -= z * inv * vrDot * 0.5;
        }
      }
    }

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
        alphaTest={0.5}
        transparent={false}
        depthWrite
        toneMapped={false}
      />
    </points>
  );
}

export default function ConnectomeLoader() {
  // bgColor is only used for the fog (three.js Color can't parse
  // `var(...)`) so a one-shot read at mount is fine; the wrapper div
  // itself uses the raw CSS var so the backdrop tracks theme changes
  // in real time regardless of when the Canvas mounted.
  const { bgColor, theme } = useMemo(() => {
    const bg = readCssColor("--graph-bg", "#ffffff");
    return { bgColor: bg, theme: inferTheme(bg) };
  }, []);

  return (
    <div
      className="pointer-events-none absolute inset-0 z-0"
      style={{ backgroundColor: "var(--graph-bg)" }}
    >
      <Canvas
        camera={{ position: [0, 0, 7], fov: 60 }}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true }}
      >
        <fog attach="fog" args={[bgColor, 4, 12]} />
        <ConnectomeField theme={theme} />
      </Canvas>
    </div>
  );
}
