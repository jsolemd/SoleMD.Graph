import { create } from 'zustand'
import type { GraphMode, GraphPointRecord } from '@/features/graph/types'

export type AnimationPhase = 'idle' | 'repositioning' | 'focusing'

interface GraphUIStore {
  selectedNode: GraphPointRecord | null
  focusedPointIndex: number | null
  focusedPointRevision: number
  cameraSettledRevision: number
  graphContentContrastLevel: 0 | 1 | 2
  zoomedIn: boolean
  mode: GraphMode
  animationPhase: AnimationPhase
  isRepositioningNodes: boolean
  selectNode: (node: GraphPointRecord | null) => void
  setFocusedPointIndex: (index: number | null) => void
  markCameraSettled: () => void
  setGraphContentContrastLevel: (level: 0 | 1 | 2) => void
  setZoomedIn: (zoomedIn: boolean) => void
  setMode: (mode: GraphMode) => void
  setAnimationPhase: (phase: AnimationPhase) => void
  setRepositioningNodes: (value: boolean) => void
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
  graphContentContrastLevel: 0,
  zoomedIn: false,
  mode: 'ask',
  animationPhase: 'idle',
  isRepositioningNodes: false,
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
  setGraphContentContrastLevel: (level) => set((state) => (
    state.graphContentContrastLevel === level
      ? state
      : { graphContentContrastLevel: level }
  )),
  setZoomedIn: (zoomedIn) => set((state) => (
    state.zoomedIn === zoomedIn ? state : { zoomedIn }
  )),
  setMode: (mode) => set((state) => (
    state.mode === mode ? state : { mode }
  )),
  setAnimationPhase: (phase) => set((state) => (
    state.animationPhase === phase ? state : { animationPhase: phase }
  )),
  setRepositioningNodes: (value) => set((state) => (
    state.isRepositioningNodes === value ? state : { isRepositioningNodes: value }
  )),
}))
