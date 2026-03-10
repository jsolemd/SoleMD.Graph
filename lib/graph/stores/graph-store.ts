import { create } from 'zustand'
import type { ChunkNode, GraphMode } from '../types'

interface GraphUIStore {
  selectedNode: ChunkNode | null
  mode: GraphMode
  selectNode: (node: ChunkNode | null) => void
  setMode: (mode: GraphMode) => void
}

export const useGraphStore = create<GraphUIStore>((set) => ({
  selectedNode: null,
  mode: 'ask',
  selectNode: (node) => set({ selectedNode: node }),
  setMode: (mode) => set({ mode }),
}))
