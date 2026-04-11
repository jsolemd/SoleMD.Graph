/**
 * Motion 3D presets for React Three Fiber + framer-motion-3d.
 *
 * All timings tuned to feel consistent with lib/motion.ts — same
 * "calm, precise" motion brand, adapted to three.js rotations,
 * camera tracks, and orbit behavior.
 */
type SpringTransition = {
  type: "spring";
  stiffness: number;
  damping: number;
};

/** Slow, deliberate rotation — molecular displays, hero 3D. */
export const slowRotation: SpringTransition = {
  type: "spring",
  stiffness: 40,
  damping: 18,
};

/** Orbit feel — loose, forgiving for camera choreography. */
export const orbit: SpringTransition = {
  type: "spring",
  stiffness: 60,
  damping: 22,
};

/** Camera track — stiffer, for deliberate cinematic movements. */
export const cameraTrack: SpringTransition = {
  type: "spring",
  stiffness: 90,
  damping: 26,
};

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
