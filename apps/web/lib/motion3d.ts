/**
 * Motion 3D presets for React Three Fiber.
 *
 * NOT framer-motion-3d — that package is deprecated on R3F 9 / React 19
 * and incompatible with our stack. Use plain refs + `useFrame` with
 * these lerp-factor constants for frame-rate-independent interpolation,
 * or GSAP timelines mutating three.js object properties directly.
 *
 * All timings tuned to feel consistent with lib/motion.ts — same
 * "calm, precise" motion brand, adapted to three.js rotation rates
 * and camera tracks.
 */

/**
 * Frame-rate-independent lerp factor.
 *
 *   current += (target - current) * lerpFactor(dt, k)
 *
 * `k` is the decay rate (higher = snappier). For a smooth hover or
 * camera settle, `k = 6` gives a ~300ms response. For a quick snap,
 * `k = 18` gives ~120ms. Mathematically correct replacement for naive
 * `current += (target - current) * 0.1` which breaks on high-refresh
 * displays and under React Compiler's varying frame rates.
 */
export function lerpFactor(dt: number, k: number): number {
  return 1 - Math.exp(-dt * k);
}

/** Decay constants (k in `lerpFactor`) tuned to the motion tiers. */
export const DECAY = {
  /** ~120ms settle — micro interaction, hover, button press */
  micro: 18,
  /** ~300ms settle — standard transitions, camera lerp, mode shifts */
  standard: 6,
  /** ~500ms settle — emphasis, cinematic camera tracks */
  emphasis: 3.2,
} as const;

/**
 * Default orbit rate for auto-rotating 3D objects (rad/s).
 * Matches model-viewer's default feel when set to `auto-rotate`.
 */
export const ORBIT_RATE_RAD_PER_SEC = 0.35;

/** Duration presets (seconds) for non-spring R3F tweens. */
export const DURATION = {
  micro: 0.1,
  standard: 0.3,
  emphasis: 0.5,
} as const;
