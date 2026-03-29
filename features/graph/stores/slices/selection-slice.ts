import type { StateCreator } from 'zustand'
import type { DashboardState } from '../dashboard-store'

export interface SelectionSlice {
  // Selection behavior
  /** When true, clicking a point selects it AND all connected points (via links). */
  connectedSelect: boolean

  // Crossfilter state mirrored from Cosmograph callbacks.
  // "Current" is visibility-scoped (filters, timeline, budget), not manual selection intent.
  currentPointScopeSql: string | null
  currentScopeRevision: number
  selectedPointCount: number
  selectedPointRevision: number
  activeSelectionSourceId: string | null
  selectionLocked: boolean

  // Actions
  setConnectedSelect: (on: boolean) => void
  toggleConnectedSelect: () => void
  setCurrentPointScopeSql: (sql: string | null) => void
  setSelectedPointCount: (count: number) => void
  setActiveSelectionSourceId: (sourceId: string | null) => void
  lockSelection: () => void
  unlockSelection: () => void
}

export const createSelectionSlice: StateCreator<DashboardState, [], [], SelectionSlice> = (set) => ({
  connectedSelect: false,
  currentPointScopeSql: null,
  currentScopeRevision: 0,
  selectedPointCount: 0,
  selectedPointRevision: 0,
  activeSelectionSourceId: null,
  selectionLocked: false,

  setConnectedSelect: (on) => set({ connectedSelect: on }),
  toggleConnectedSelect: () => set((s) => ({ connectedSelect: !s.connectedSelect })),
  setCurrentPointScopeSql: (sql) => set((state) => {
    const next = sql?.trim() ? sql : null
    return state.currentPointScopeSql === next
      ? state
      : {
          currentPointScopeSql: next,
          currentScopeRevision: state.currentScopeRevision + 1,
        }
  }),
  setSelectedPointCount: (count) => set((state) => {
    const normalized = Math.max(0, Math.floor(count))
    return state.selectedPointCount === normalized
      ? state
      : {
          selectedPointCount: normalized,
          selectedPointRevision: state.selectedPointRevision + 1,
        }
  }),
  setActiveSelectionSourceId: (sourceId) => set({ activeSelectionSourceId: sourceId }),
  lockSelection: () => set((s) =>
    s.selectedPointCount === 0 ? s
      : { selectionLocked: true }
  ),
  unlockSelection: () => set({ selectionLocked: false }),
})
