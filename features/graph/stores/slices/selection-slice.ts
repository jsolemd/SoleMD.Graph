import type { StateCreator } from 'zustand'
import type { DashboardState } from '../dashboard-store'

export interface SelectionSlice {
  // Selection behavior
  /** When true, clicking a point selects it AND all connected points (via links). */
  connectedSelect: boolean

  // Crossfilter state mirrored from Cosmograph callbacks.
  // "Current" is visibility-scoped (filters, timeline, budget), not manual selection intent.
  currentPointIndices: number[] | null
  currentPointScopeSql: string | null
  selectedPointIndices: number[]
  highlightedPointIndices: number[]
  activeSelectionSourceId: string | null
  lockedSelection: Set<number> | null

  // Actions
  setConnectedSelect: (on: boolean) => void
  toggleConnectedSelect: () => void
  setCurrentPointIndices: (indices: number[] | null) => void
  setCurrentPointScopeSql: (sql: string | null) => void
  setSelectedPointIndices: (indices: number[]) => void
  setHighlightedPointIndices: (indices: number[]) => void
  setActiveSelectionSourceId: (sourceId: string | null) => void
  lockSelection: () => void
  unlockSelection: () => void
}

export const createSelectionSlice: StateCreator<DashboardState, [], [], SelectionSlice> = (set) => ({
  connectedSelect: false,
  currentPointIndices: null,
  currentPointScopeSql: null,
  selectedPointIndices: [],
  highlightedPointIndices: [],
  activeSelectionSourceId: null,
  lockedSelection: null,

  setConnectedSelect: (on) => set({ connectedSelect: on }),
  toggleConnectedSelect: () => set((s) => ({ connectedSelect: !s.connectedSelect })),
  setCurrentPointIndices: (indices) => set({ currentPointIndices: indices }),
  setCurrentPointScopeSql: (sql) => set({ currentPointScopeSql: sql }),
  setSelectedPointIndices: (indices) => set({ selectedPointIndices: indices }),
  setHighlightedPointIndices: (indices) => set({ highlightedPointIndices: indices }),
  setActiveSelectionSourceId: (sourceId) => set({ activeSelectionSourceId: sourceId }),
  lockSelection: () => set((s) =>
    s.selectedPointIndices.length === 0 ? s
      : { lockedSelection: new Set(s.selectedPointIndices) }
  ),
  unlockSelection: () => set({ lockedSelection: null }),
})
