import { create } from 'zustand'

/**
 * Route-layout concerns for the (dashboard) route group.
 *
 * Scoped separately from useDashboardStore because these are not graph-
 * dashboard concerns — they're substrate-level preferences that apply
 * across the landing surface, orb, and Cosmograph-at-/map alike.
 *
 * - pauseMotion: user-controlled motion toggle. Honored by the field
 *   scroll driver + orb rotation + any motion-sensitive surface.
 *   Defaults to false; reserved for a future settings UI. The OS
 *   reduced-motion preference does NOT write here — see
 *   `prefersReducedMotion` below — so a future user toggle never
 *   races a system event.
 * - lowPowerProfile: 'auto' follows device capability heuristics,
 *   'on' forces reduced frame budget (fewer particles, no d3-force sim,
 *   picking DPR=1), 'off' forces full fidelity. Useful on mobile and
 *   as a user-visible escape hatch.
 * - prefersReducedMotion: mirror of `window.matchMedia('(prefers-
 *   reduced-motion: reduce)')`. System-controlled; written by the
 *   `DashboardClientShell` media-query bridge and never by the user.
 *   Consumers (OrbSurface, BlobController gate, scroll driver)
 *   collapse pauseMotion + lowPowerProfile === 'on' +
 *   prefersReducedMotion into a single derived motion-disabled flag.
 *
 * Slice B (orb-3d-physics-taxonomy.md §9.1): three new ambient-physics
 * multipliers ride alongside the gates above. They are user-facing
 * sliders that compose with `motionEnabled` at the consumer; they do
 * NOT collapse the system reduced-motion signal.
 *
 * - motionSpeedMultiplier: scales the per-controller `uTime`
 *   accumulator and Blob's color-cycle GSAP `timeScale`. Default
 *   is 1.5 — that is the new baseline tempo for both landing and
 *   graph; the slider scales around it (range [0.5, 3.0]).
 * - rotationSpeedMultiplier: scales orb wrapper auto-rotation only.
 *   Range [0.0, 2.0].
 * - ambientEntropy: scales `uAmplitude` and `uFrequency` blend
 *   targets — does not re-seed positions. Range [0.0, 2.0]; capped
 *   at 1.0 under `lowPowerProfile === 'on'` at the consumer.
 */

export type LowPowerProfile = 'auto' | 'on' | 'off'

export interface ShellState {
  pauseMotion: boolean
  lowPowerProfile: LowPowerProfile
  prefersReducedMotion: boolean
  motionSpeedMultiplier: number
  rotationSpeedMultiplier: number
  ambientEntropy: number

  setPauseMotion: (value: boolean) => void
  setLowPowerProfile: (value: LowPowerProfile) => void
  setPrefersReducedMotion: (value: boolean) => void
  setMotionSpeedMultiplier: (value: number) => void
  setRotationSpeedMultiplier: (value: number) => void
  setAmbientEntropy: (value: number) => void
  reset: () => void
}

const INITIAL_SHELL_STATE = {
  pauseMotion: false,
  lowPowerProfile: 'auto' as const,
  prefersReducedMotion: false,
  motionSpeedMultiplier: 1.5,
  rotationSpeedMultiplier: 1,
  ambientEntropy: 1,
}

export const useShellStore = create<ShellState>((set) => ({
  ...INITIAL_SHELL_STATE,
  setPauseMotion: (value) => set({ pauseMotion: value }),
  setLowPowerProfile: (value) => set({ lowPowerProfile: value }),
  setPrefersReducedMotion: (value) =>
    set((s) => (s.prefersReducedMotion === value ? s : { prefersReducedMotion: value })),
  setMotionSpeedMultiplier: (value) =>
    set((s) => (s.motionSpeedMultiplier === value ? s : { motionSpeedMultiplier: value })),
  setRotationSpeedMultiplier: (value) =>
    set((s) => (s.rotationSpeedMultiplier === value ? s : { rotationSpeedMultiplier: value })),
  setAmbientEntropy: (value) =>
    set((s) => (s.ambientEntropy === value ? s : { ambientEntropy: value })),
  reset: () => set({ ...INITIAL_SHELL_STATE }),
}))
