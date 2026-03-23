import type { StateCreator } from 'zustand'
import type { DashboardState } from '../dashboard-store'

export type ActivePanel = 'about' | 'config' | 'filters' | 'info' | 'query' | null

/** Callbacks registered by MapCanvas so the Wordmark toolbar can control the map. */
export interface MapControls {
  zoomIn: () => void
  zoomOut: () => void
  fitView: () => void
}

export interface PanelSlice {
  // Panel visibility
  activePanel: ActivePanel
  panelsVisible: boolean
  panelBottomY: { left: number; right: number }
  tableOpen: boolean
  tableHeight: number
  uiHidden: boolean

  // Map controls — registered by MapCanvas, consumed by Wordmark
  mapControls: MapControls | null

  // Prompt size: minimized (pill) / normal / maximized (full-height)
  promptMinimized: boolean
  promptMaximized: boolean

  // Write mode
  writeContent: string

  // Actions
  setActivePanel: (panel: ActivePanel) => void
  togglePanel: (panel: ActivePanel) => void
  setPanelsVisible: (visible: boolean) => void
  setPanelBottomY: (side: 'left' | 'right', y: number) => void
  togglePanelsVisible: () => void
  setTableOpen: (open: boolean) => void
  toggleTable: () => void
  setTableHeight: (height: number) => void
  setUiHidden: (hidden: boolean) => void
  toggleUiHidden: () => void
  setPromptMinimized: (minimized: boolean) => void
  setPromptMaximized: (maximized: boolean) => void
  togglePromptMinimized: () => void
  togglePromptMaximized: () => void
  setWriteContent: (content: string) => void
  setMapControls: (controls: MapControls | null) => void
}

export const createPanelSlice: StateCreator<DashboardState, [], [], PanelSlice> = (set) => ({
  activePanel: null,
  panelsVisible: false,
  panelBottomY: { left: 0, right: 0 },
  tableOpen: false,
  tableHeight: 280,
  uiHidden: false,
  mapControls: null,
  promptMinimized: false,
  promptMaximized: false,
  writeContent: '',

  setActivePanel: (panel) => set({ activePanel: panel }),
  togglePanel: (panel) =>
    set((s) => ({ activePanel: s.activePanel === panel ? null : panel })),
  setPanelsVisible: (visible) => set({ panelsVisible: visible }),
  setPanelBottomY: (side, y) =>
    set((s) => s.panelBottomY[side] === y ? s : { panelBottomY: { ...s.panelBottomY, [side]: y } }),
  togglePanelsVisible: () =>
    set((s) => {
      const next = !s.panelsVisible
      return { panelsVisible: next, ...(next ? {} : { activePanel: null }) }
    }),
  setTableOpen: (open) => set({ tableOpen: open }),
  toggleTable: () => set((s) => ({ tableOpen: !s.tableOpen })),
  setTableHeight: (height) => set({ tableHeight: height }),
  setUiHidden: (hidden) => set({ uiHidden: hidden }),
  toggleUiHidden: () => set((s) => ({ uiHidden: !s.uiHidden })),
  setPromptMinimized: (minimized) => set({ promptMinimized: minimized, promptMaximized: false }),
  setPromptMaximized: (maximized) => set({ promptMaximized: maximized, promptMinimized: false }),
  togglePromptMinimized: () => set((s) => ({ promptMinimized: !s.promptMinimized, promptMaximized: false })),
  togglePromptMaximized: () => set((s) => ({ promptMaximized: !s.promptMaximized, promptMinimized: false })),
  setWriteContent: (content) => set({ writeContent: content }),
  setMapControls: (controls) => set({ mapControls: controls }),
})
