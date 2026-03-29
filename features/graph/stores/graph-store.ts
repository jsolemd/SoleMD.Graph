import { create } from 'zustand'
import type { GraphMode, GraphPointRecord } from '@/features/graph/types'

interface GraphUIStore {
  selectedNode: GraphPointRecord | null
  mode: GraphMode
  selectNode: (node: GraphPointRecord | null) => void
  setMode: (mode: GraphMode) => void
}

export const useGraphStore = create<GraphUIStore>((set) => ({
  selectedNode: null,
  mode: 'ask',
  selectNode: (node) => set({ selectedNode: node }),
  setMode: (mode) => set({ mode }),
}))
