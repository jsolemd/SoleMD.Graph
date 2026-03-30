import { create } from 'zustand'
import type { GraphMode, GraphPointRecord } from '@/features/graph/types'

interface GraphUIStore {
  selectedNode: GraphPointRecord | null
  focusedPointIndex: number | null
  mode: GraphMode
  selectNode: (node: GraphPointRecord | null) => void
  setFocusedPointIndex: (index: number | null) => void
  setMode: (mode: GraphMode) => void
}

export const useGraphStore = create<GraphUIStore>((set) => ({
  selectedNode: null,
  focusedPointIndex: null,
  mode: 'ask',
  selectNode: (node) => set({ selectedNode: node }),
  setFocusedPointIndex: (index) => set({ focusedPointIndex: index }),
  setMode: (mode) => set({ mode }),
}))
