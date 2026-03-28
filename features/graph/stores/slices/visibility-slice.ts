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

export const createVisibilitySlice: StateCreator<DashboardState, [], [], VisibilitySlice> = (set) => ({
  visibilityFocus: null,

  setVisibilityFocus: (focus) => set({ visibilityFocus: focus }),
  applyVisibilityBudget: (layer, budget) =>
    set({
      visibilityFocus: {
        layer,
        ...budget,
      },
    }),
  clearVisibilityFocus: () => set({ visibilityFocus: null }),
})
