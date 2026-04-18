import type { StateCreator } from 'zustand'
import type { GraphVisibilityBudget, MapLayer } from '@/features/graph/types'
import type { DashboardState } from '../dashboard-store'

export interface VisibilityFocus extends GraphVisibilityBudget {
  layer: MapLayer
}

export interface VisibilitySlice {
  visibilityFocus: VisibilityFocus | null
  setVisibilityFocus: (focus: VisibilityFocus | null) => void
  applyVisibilityBudget: (layer: MapLayer, budget: GraphVisibilityBudget) => void
  clearVisibilityFocus: () => void
}

function isSameVisibilityFocus(
  current: VisibilityFocus | null,
  next: VisibilityFocus | null
) {
  if (current === next) return true
  if (!current || !next) return false
  return (
    current.layer === next.layer &&
    current.seedIndex === next.seedIndex &&
    current.clusterId === next.clusterId &&
    current.includeCluster === next.includeCluster &&
    current.xMin === next.xMin &&
    current.xMax === next.xMax &&
    current.yMin === next.yMin &&
    current.yMax === next.yMax
  )
}

export const createVisibilitySlice: StateCreator<DashboardState, [], [], VisibilitySlice> = (set) => ({
  visibilityFocus: null,

  setVisibilityFocus: (focus) =>
    set((state) => (
      isSameVisibilityFocus(state.visibilityFocus, focus)
        ? state
        : { visibilityFocus: focus }
    )),
  applyVisibilityBudget: (layer, budget) =>
    set((state) => {
      const nextFocus = {
        layer,
        ...budget,
      }

      return isSameVisibilityFocus(state.visibilityFocus, nextFocus)
        ? state
        : { visibilityFocus: nextFocus }
    }),
  clearVisibilityFocus: () =>
    set((state) => (
      state.visibilityFocus === null ? state : { visibilityFocus: null }
    )),
})
