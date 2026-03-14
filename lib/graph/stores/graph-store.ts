import { create } from 'zustand'
import type { GraphMode, GraphNode } from '../types'

interface GraphUIStore {
  selectedNode: GraphNode | null
  mode: GraphMode
  selectNode: (node: GraphNode | null) => void
  setMode: (mode: GraphMode) => void
}

export const useGraphStore = create<GraphUIStore>((set) => ({
  selectedNode: null,
  mode: 'ask',
  selectNode: (node) => set({ selectedNode: node }),
  setMode: (mode) => set({ mode }),
}))
