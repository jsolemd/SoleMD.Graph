import type { StateCreator } from 'zustand'
import type { DashboardState } from '../dashboard-store'
import type { NumericColumnKey } from '@/features/graph/config'

function hasSameTimelineSelection(
  current?: [number, number],
  next?: [number, number],
) {
  return (
    current === next ||
    (
      Array.isArray(current) &&
      Array.isArray(next) &&
      current[0] === next[0] &&
      current[1] === next[1]
    )
  )
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
  setTimelineColumn: (col) => set((s) => (
    s.timelineColumn === col ? s : { timelineColumn: col }
  )),
  setTimelineSelection: (selection) => set((s) => {
    return hasSameTimelineSelection(s.timelineSelection, selection)
      ? s
      : { timelineSelection: selection }
  }),
  setTimelineSpeed: (speed) => set((s) => (
    s.timelineSpeed === speed ? s : { timelineSpeed: speed }
  )),
})
