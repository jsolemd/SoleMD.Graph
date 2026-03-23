import type { StateCreator } from 'zustand'
import type { DashboardState } from '../dashboard-store'
import type { NumericColumnKey } from '@/features/graph/types'

export interface TimelineSlice {
  showTimeline: boolean
  timelineColumn: NumericColumnKey
  timelineSelection?: [number, number]

  setShowTimeline: (show: boolean) => void
  toggleTimeline: () => void
  setTimelineColumn: (col: NumericColumnKey) => void
  setTimelineSelection: (selection?: [number, number]) => void
}

export const createTimelineSlice: StateCreator<DashboardState, [], [], TimelineSlice> = (set) => ({
  showTimeline: false,
  timelineColumn: 'year',
  timelineSelection: undefined,

  setShowTimeline: (show) => set({ showTimeline: show }),
  toggleTimeline: () => set((s) => ({ showTimeline: !s.showTimeline })),
  setTimelineColumn: (col) => set({ timelineColumn: col }),
  setTimelineSelection: (selection) => set({ timelineSelection: selection }),
})
