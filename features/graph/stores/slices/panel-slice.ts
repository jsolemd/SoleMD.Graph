import type { StateCreator } from 'zustand'
import type { DashboardState } from '../dashboard-store'

export type PanelId = 'about' | 'config' | 'filters' | 'info' | 'query' | 'wiki'
/** @deprecated Use PanelId instead — kept for backward-compat in type exports. */
export type ActivePanel = PanelId | null
export type PromptMode = 'collapsed' | 'normal' | 'maximized'
type ExpandedPromptMode = Exclude<PromptMode, 'collapsed'>

export const PANEL_SCALE_DEFAULT = 1
export const PANEL_SCALE_MIN = 0.8
export const PANEL_SCALE_MAX = 1.6
export const PANEL_SCALE_STEP = 0.1

function clampPanelScale(scale: number): number {
  return Math.min(PANEL_SCALE_MAX, Math.max(PANEL_SCALE_MIN, Math.round(scale * 100) / 100))
}

function resolveNextPanelScales(panelScales: Record<string, number>, id: string, scale: number): Record<string, number> {
  const nextScale = clampPanelScale(scale)
  const currentScale = panelScales[id] ?? PANEL_SCALE_DEFAULT

  if (currentScale === nextScale) {
    return panelScales
  }

  if (nextScale === PANEL_SCALE_DEFAULT) {
    if (!(id in panelScales)) {
      return panelScales
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- destructure to omit key
    const { [id]: _, ...rest } = panelScales
    return rest
  }

  return { ...panelScales, [id]: nextScale }
}

/** Initial state for openPanels — all closed. */
const CLOSED_PANELS: Record<PanelId, boolean> = {
  about: false,
  config: false,
  filters: false,
  info: false,
  query: false,
  wiki: false,
}

export interface PanelSlice {
  // Panel visibility
  openPanels: Record<PanelId, boolean>
  panelsVisible: boolean
  panelBottomY: { left: number; right: number }
  tableOpen: boolean
  tableHeight: number
  uiHidden: boolean

  // Prompt size: collapsed pill / normal / maximized full-height
  promptMode: PromptMode
  lastExpandedPromptMode: ExpandedPromptMode
  promptShellFullHeight: boolean

  // Wiki panel expanded mode
  wikiExpanded: boolean
  wikiExpandedWidth: number

  // Write mode
  writeContent: string

  // Remembered panel positions — survives close/reopen within a session
  panelPositions: Record<string, { x: number; y: number; width: number; height?: number; docked: boolean; pinned?: boolean }>
  panelScales: Record<string, number>

  // Keyed registry — any floating element registers by ID
  floatingObstacles: Record<string, { x: number; y: number; width: number; height: number }>

  // Actions
  togglePanel: (panel: PanelId) => void
  openPanel: (panel: PanelId) => void
  closePanel: (panel: PanelId) => void
  closeAllPanels: () => void
  setPanelsVisible: (visible: boolean) => void
  setPanelBottomY: (side: 'left' | 'right', y: number) => void
  togglePanelsVisible: () => void
  setTableOpen: (open: boolean) => void
  toggleTable: () => void
  setTableHeight: (height: number) => void
  setUiHidden: (hidden: boolean) => void
  toggleUiHidden: () => void
  setPromptMode: (mode: PromptMode) => void
  setPromptShellFullHeight: (fullHeight: boolean) => void
  applyPromptModeDefault: (mode: PromptMode) => void
  collapsePrompt: () => void
  expandPrompt: () => void
  maximizePrompt: () => void
  stepPromptDown: () => void
  stepPromptUp: () => void
  togglePromptCollapsed: () => void
  setWriteContent: (content: string) => void
  setWikiExpanded: (expanded: boolean) => void
  setWikiExpandedWidth: (width: number) => void
  savePanelPosition: (id: string, pos: { x: number; y: number; width: number; height?: number; docked: boolean; pinned?: boolean }) => void
  setPanelScale: (id: string, scale: number) => void
  stepPanelScale: (id: string, delta: number) => void
  resetPanelScale: (id: string) => void
  togglePanelPinned: (id: string) => void
  setFloatingObstacle: (id: string, rect: { x: number; y: number; width: number; height: number }) => void
  clearFloatingObstacle: (id: string) => void
}

export const createPanelSlice: StateCreator<DashboardState, [], [], PanelSlice> = (set) => ({
  openPanels: { ...CLOSED_PANELS },
  panelsVisible: true,
  panelBottomY: { left: 0, right: 0 },
  tableOpen: false,
  tableHeight: 280,
  uiHidden: false,
  promptMode: 'normal',
  lastExpandedPromptMode: 'normal',
  promptShellFullHeight: false,
  wikiExpanded: false,
  wikiExpandedWidth: 420,
  writeContent: '',
  panelPositions: {},
  panelScales: {},
  floatingObstacles: {},

  togglePanel: (panel) =>
    set((s) => ({ openPanels: { ...s.openPanels, [panel]: !s.openPanels[panel] } })),
  openPanel: (panel) =>
    set((s) => (s.openPanels[panel] ? s : { openPanels: { ...s.openPanels, [panel]: true } })),
  closePanel: (panel) =>
    set((s) => (!s.openPanels[panel] ? s : { openPanels: { ...s.openPanels, [panel]: false } })),
  closeAllPanels: () =>
    set({ openPanels: { ...CLOSED_PANELS } }),
  setPanelsVisible: (visible) => set((s) => (
    s.panelsVisible === visible ? s : { panelsVisible: visible }
  )),
  setPanelBottomY: (side, y) =>
    set((s) => s.panelBottomY[side] === y ? s : { panelBottomY: { ...s.panelBottomY, [side]: y } }),
  togglePanelsVisible: () =>
    set((s) => {
      const next = !s.panelsVisible
      return { panelsVisible: next, ...(next ? {} : { openPanels: { ...CLOSED_PANELS } }) }
    }),
  setTableOpen: (open) => set((s) => (
    s.tableOpen === open ? s : { tableOpen: open }
  )),
  toggleTable: () => set((s) => ({ tableOpen: !s.tableOpen })),
  setTableHeight: (height) => set((s) => (
    s.tableHeight === height ? s : { tableHeight: height }
  )),
  setUiHidden: (hidden) => set((s) => (
    s.uiHidden === hidden ? s : { uiHidden: hidden }
  )),
  toggleUiHidden: () => set((s) => ({ uiHidden: !s.uiHidden })),
  setPromptMode: (promptMode) =>
    set((s) => ({
      promptMode,
      lastExpandedPromptMode:
        promptMode === 'collapsed'
          ? (s.promptMode === 'collapsed' ? s.lastExpandedPromptMode : s.promptMode)
          : promptMode,
    })),
  setPromptShellFullHeight: (promptShellFullHeight) => set((s) => (
    s.promptShellFullHeight === promptShellFullHeight
      ? s
      : { promptShellFullHeight }
  )),
  applyPromptModeDefault: (promptMode) =>
    set({
      promptMode,
      lastExpandedPromptMode:
        promptMode === 'collapsed' ? 'normal' : promptMode,
      promptShellFullHeight: false,
    }),
  collapsePrompt: () =>
    set((s) => ({
      promptMode: 'collapsed',
      lastExpandedPromptMode:
        s.promptMode === 'collapsed' ? s.lastExpandedPromptMode : s.promptMode,
    })),
  expandPrompt: () =>
    set((s) => ({
      promptMode: s.lastExpandedPromptMode,
    })),
  maximizePrompt: () =>
    set({
      promptMode: 'maximized',
      lastExpandedPromptMode: 'maximized',
    }),
  stepPromptDown: () =>
    set((s) => {
      if (s.promptMode === 'maximized') {
        return {
          promptMode: 'normal',
          lastExpandedPromptMode: 'normal',
        }
      }
      if (s.promptMode === 'normal') {
        return {
          promptMode: 'collapsed',
          lastExpandedPromptMode: 'normal',
        }
      }
      return s
    }),
  stepPromptUp: () =>
    set((s) => {
      if (s.promptMode === 'collapsed') {
        return {
          promptMode: s.lastExpandedPromptMode,
        }
      }
      if (s.promptMode === 'normal') {
        return {
          promptMode: 'maximized',
          lastExpandedPromptMode: 'maximized',
        }
      }
      return s
    }),
  togglePromptCollapsed: () =>
    set((s) => ({
      promptMode: s.promptMode === 'collapsed' ? s.lastExpandedPromptMode : 'collapsed',
      lastExpandedPromptMode:
        s.promptMode === 'collapsed' ? s.lastExpandedPromptMode : s.promptMode,
    })),
  setWriteContent: (content) => set((s) => (
    s.writeContent === content ? s : { writeContent: content }
  )),
  setWikiExpanded: (expanded) => set((s) => (
    s.wikiExpanded === expanded ? s : { wikiExpanded: expanded }
  )),
  setWikiExpandedWidth: (width) => set((s) => (
    s.wikiExpandedWidth === width ? s : { wikiExpandedWidth: width }
  )),
  savePanelPosition: (id, pos) =>
    set((s) => ({
      panelPositions: { ...s.panelPositions, [id]: pos },
    })),
  setPanelScale: (id, scale) =>
    set((s) => {
      const panelScales = resolveNextPanelScales(s.panelScales, id, scale)
      return panelScales === s.panelScales ? s : { panelScales }
    }),
  stepPanelScale: (id, delta) =>
    set((s) => {
      const panelScales = resolveNextPanelScales(
        s.panelScales,
        id,
        (s.panelScales[id] ?? PANEL_SCALE_DEFAULT) + delta,
      )
      return panelScales === s.panelScales ? s : { panelScales }
    }),
  resetPanelScale: (id) =>
    set((s) => {
      const panelScales = resolveNextPanelScales(s.panelScales, id, PANEL_SCALE_DEFAULT)
      return panelScales === s.panelScales ? s : { panelScales }
    }),
  setFloatingObstacle: (id, rect) =>
    set((s) => ({
      floatingObstacles: { ...s.floatingObstacles, [id]: rect },
    })),
  clearFloatingObstacle: (id) =>
    set((s) => {
      if (!(id in s.floatingObstacles)) return s
      // eslint-disable-next-line @typescript-eslint/no-unused-vars -- destructure to omit key
      const { [id]: _, ...rest } = s.floatingObstacles
      return { floatingObstacles: rest }
    }),
  togglePanelPinned: (id) =>
    set((s) => {
      const current = s.panelPositions[id]
      if (!current) return s
      return {
        panelPositions: {
          ...s.panelPositions,
          [id]: { ...current, pinned: !current.pinned },
        },
      }
    }),
})
