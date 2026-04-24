import { create } from 'zustand'

/**
 * Route-layout concerns for the (dashboard) route group.
 *
 * Scoped separately from useDashboardStore because these are not graph-
 * dashboard concerns — they're substrate-level preferences that apply
 * across the landing surface, orb, and Cosmograph-at-/map alike.
 *
 * - pauseMotion: honored by the field scroll driver + orb rotation +
 *   any motion-sensitive surface. Defaults to false; future OS-level
 *   prefers-reduced-motion detection sets it true at mount.
 * - lowPowerProfile: 'auto' follows device capability heuristics,
 *   'on' forces reduced frame budget (fewer particles, no d3-force sim,
 *   picking DPR=1), 'off' forces full fidelity. Useful on mobile and
 *   as a user-visible escape hatch.
 */

export type LowPowerProfile = 'auto' | 'on' | 'off'

export interface ShellState {
  pauseMotion: boolean
  lowPowerProfile: LowPowerProfile

  setPauseMotion: (value: boolean) => void
  setLowPowerProfile: (value: LowPowerProfile) => void
  reset: () => void
}

const INITIAL_SHELL_STATE = {
  pauseMotion: false,
  lowPowerProfile: 'auto' as const,
}

export const useShellStore = create<ShellState>((set) => ({
  ...INITIAL_SHELL_STATE,
  setPauseMotion: (value) => set({ pauseMotion: value }),
  setLowPowerProfile: (value) => set({ lowPowerProfile: value }),
  reset: () => set({ ...INITIAL_SHELL_STATE }),
}))
