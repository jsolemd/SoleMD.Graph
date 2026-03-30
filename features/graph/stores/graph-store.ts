import { create } from 'zustand'
import type { GraphMode, GraphPointRecord } from '@/features/graph/types'

interface GraphUIStore {
  selectedNode: GraphPointRecord | null
  focusedPointIndex: number | null
  focusedPointRevision: number
  cameraSettledRevision: number
  mode: GraphMode
  selectNode: (node: GraphPointRecord | null) => void
  setFocusedPointIndex: (index: number | null) => void
  markCameraSettled: () => void
  setMode: (mode: GraphMode) => void
}

function isSameNode(
  current: GraphPointRecord | null,
  next: GraphPointRecord | null,
) {
  if (current === next) return true
  if (!current || !next) return false
  return current.id === next.id && current.index === next.index
}

export const useGraphStore = create<GraphUIStore>((set) => ({
  selectedNode: null,
  focusedPointIndex: null,
  focusedPointRevision: 0,
  cameraSettledRevision: 0,
  mode: 'ask',
  selectNode: (node) => set((state) => (
    isSameNode(state.selectedNode, node)
      ? state
      : { selectedNode: node }
  )),
  setFocusedPointIndex: (index) => set((state) => (
    state.focusedPointIndex === index
      ? state
      : {
          focusedPointIndex: index,
          focusedPointRevision: state.focusedPointRevision + 1,
        }
  )),
  markCameraSettled: () => set((state) => ({
    cameraSettledRevision: state.cameraSettledRevision + 1,
  })),
  setMode: (mode) => set({ mode }),
}))
