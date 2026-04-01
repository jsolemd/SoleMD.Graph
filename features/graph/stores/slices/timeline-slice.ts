import type { StateCreator } from 'zustand'
import type { DashboardState } from '../dashboard-store'
import type { NumericColumnKey } from '@/features/graph/types'

/**
 * Base animation tick rate (ms) at 1x speed.
 * Cosmograph `animationSpeed` = BASE / multiplier.
 */
const ANIMATION_BASE_MS = 150

/** Convert a speed multiplier (0.25–3) to Cosmograph animationSpeed (ms). */
export function speedMultiplierToMs(multiplier: number): number {
  return Math.round(ANIMATION_BASE_MS / multiplier)
}

/**
 * Speed presets — symmetric around 1× center.
 *
 * Slider positions are 1–9 with labeled marks at odd positions (1,3,5,7,9).
 * This gives equal visual spacing with 1× dead center.
 * Even positions (2,4,6,8) are unlabeled intermediate steps.
 *
 *   pos 1  2     3    4    5    6    7    8    9
 *   val .25 .50  .75  .875  1   1.5   2   2.5   3
 *   lbl .25       .50       1×       2×       3×
 */
const STEP_TO_MULTIPLIER = [
  /* 1 */ 0.25,
  /* 2 */ 0.50,
  /* 3 */ 0.75,
  /* 4 */ 0.875,
  /* 5 */ 1.0,
  /* 6 */ 1.5,
  /* 7 */ 2.0,
  /* 8 */ 2.5,
  /* 9 */ 3.0,
] as const

export function sliderStepToMultiplier(step: number): number {
  const idx = Math.round(step) - 1
  return STEP_TO_MULTIPLIER[Math.max(0, Math.min(idx, STEP_TO_MULTIPLIER.length - 1))]
}

export function multiplierToSliderStep(multiplier: number): number {
  let closest = 1
  let minDist = Infinity
  for (let i = 0; i < STEP_TO_MULTIPLIER.length; i++) {
    const dist = Math.abs(STEP_TO_MULTIPLIER[i] - multiplier)
    if (dist < minDist) {
      minDist = dist
      closest = i + 1
    }
  }
  return closest
}

/** Marks at equal visual intervals — 1× centered. */
export const SPEED_SLIDER_MARKS = [
  { value: 1, label: '.25' },
  { value: 3, label: '.50' },
  { value: 5, label: '1×' },
  { value: 7, label: '2×' },
  { value: 9, label: '3×' },
] as const

/**
 * Fixed-width speed label — always 4 chars for layout stability.
 * Uses N.NN format with tabular-nums.
 */
export function formatSpeedLabel(multiplier: number): string {
  return multiplier.toFixed(2)
}

/** Short label for the slider thumb tooltip. */
export function formatSpeedLabelShort(step: number): string {
  return sliderStepToMultiplier(step).toFixed(2)
}

export interface TimelineSlice {
  showTimeline: boolean
  timelineColumn: NumericColumnKey
  timelineSelection?: [number, number]
  timelineSpeed: number

  setShowTimeline: (show: boolean) => void
  toggleTimeline: () => void
  setTimelineColumn: (col: NumericColumnKey) => void
  setTimelineSelection: (selection?: [number, number]) => void
  setTimelineSpeed: (speed: number) => void
}

export const createTimelineSlice: StateCreator<DashboardState, [], [], TimelineSlice> = (set) => ({
  showTimeline: false,
  timelineColumn: 'year',
  timelineSelection: undefined,
  timelineSpeed: 1,

  setShowTimeline: (show) => set((s) => (
    s.showTimeline === show ? s : { showTimeline: show }
  )),
  toggleTimeline: () => set((s) => ({ showTimeline: !s.showTimeline })),
  setTimelineColumn: (col) => set({ timelineColumn: col }),
  setTimelineSelection: (selection) => set((s) => {
    const current = s.timelineSelection
    const next = selection
    const isSameSelection =
      current === next ||
      (
        Array.isArray(current) &&
        Array.isArray(next) &&
        current[0] === next[0] &&
        current[1] === next[1]
      )

    return isSameSelection ? s : { timelineSelection: selection }
  }),
  setTimelineSpeed: (speed) => set({ timelineSpeed: speed }),
})
