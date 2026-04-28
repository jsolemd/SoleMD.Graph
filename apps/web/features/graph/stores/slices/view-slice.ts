import type { StateCreator } from 'zustand'
import type { DashboardState } from '../dashboard-store'

/**
 * Renderer mode for the /graph workspace.
 *
 * - '3d' — the OrbSurface field-particle paper-identity workspace, rendered
 *   on the persistent 16384-particle FieldCanvas substrate. This is the
 *   primary product surface and the default for /graph.
 * - '2d' — the native Cosmograph lens (DashboardShell). Available as an
 *   analytic toggle without restoring Cosmograph as the default surface.
 *
 * Phase 1 / M5a defaults to '3d'. The toggle exists so users can fall back
 * to the native 2D map; flipping the default is intentionally a one-line
 * change in this file.
 */
export type RendererMode = '3d' | '2d'
export type OrbSelectionTool = 'navigate' | 'rectangle'

export interface ViewSlice {
  rendererMode: RendererMode
  orbSelectionTool: OrbSelectionTool
  orbResidentPointCount: number | null
  orbResidentRevision: number
  setRendererMode: (mode: RendererMode) => void
  toggleRendererMode: () => void
  setOrbSelectionTool: (tool: OrbSelectionTool) => void
  toggleOrbRectangleSelection: () => void
  setOrbResidentPointCount: (count: number | null) => void
}

export const createViewSlice: StateCreator<DashboardState, [], [], ViewSlice> = (set) => ({
  rendererMode: '3d',
  orbSelectionTool: 'navigate',
  orbResidentPointCount: null,
  orbResidentRevision: 0,
  setRendererMode: (mode) => set((s) => (
    s.rendererMode === mode ? s : { rendererMode: mode }
  )),
  toggleRendererMode: () => set((s) => ({
    rendererMode: s.rendererMode === '3d' ? '2d' : '3d',
  })),
  setOrbSelectionTool: (tool) => set((s) => (
    s.orbSelectionTool === tool ? s : { orbSelectionTool: tool }
  )),
  toggleOrbRectangleSelection: () => set((s) => ({
    orbSelectionTool: s.orbSelectionTool === 'rectangle' ? 'navigate' : 'rectangle',
  })),
  setOrbResidentPointCount: (count) => set((s) => (
    s.orbResidentPointCount === count
      ? s
      : {
          orbResidentPointCount: count,
          orbResidentRevision: s.orbResidentRevision + 1,
        }
  )),
})
