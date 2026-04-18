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
  lastOpenedPanel: PanelId | null
  panelsVisible: boolean
  panelBottomY: { left: number; right: number }
  /** Rendered top Y of the prompt card in viewport coords (0 = unknown).
   *  Docked, unpinned panels clamp their height against this so their
   *  bottom edge stops above the prompt instead of overlapping it. */
  promptTopY: number
  tableOpen: boolean
  tableHeight: number
  uiHidden: boolean

  // Prompt size: collapsed pill / normal / maximized full-height
  promptMode: PromptMode
  lastExpandedPromptMode: ExpandedPromptMode

  // Wiki panel expanded mode
  wikiExpanded: boolean
  // Mirrored from wikiStore.currentRoute.kind === 'graph' via WikiPanel's
  // layout effect. The dock reads this to size the wiki slot for the
  // graph-route view, which is wider than the page-route default.
  wikiRouteIsGraph: boolean

  // Selection detail panel: split from `selectedNode` so mobile can show
  // the panel on explicit opt-in without clearing the underlying
  // Cosmograph selection when the user dismisses it.
  detailPanelOpen: boolean

  // Write mode
  writeContent: string

  // Remembered panel positions — survives close/reopen within a session.
  // `width` is the currently rendered width (clamped); `preferredWidth` is
  // the user's intent used by the elastic dock when siblings close.
  // `leftOffset` is captured at pin-time so pinned docked panels keep their
  // x position even when siblings open/close.
  panelPositions: Record<string, { x: number; y: number; width: number; height?: number; docked: boolean; pinned?: boolean; preferredWidth?: number; leftOffset?: number }>
  panelScales: Record<string, number>

  // Keyed registry — any floating element registers by ID
  floatingObstacles: Record<string, { x: number; y: number; width: number; height: number }>

  // Actions
  togglePanel: (panel: PanelId) => void
  openPanel: (panel: PanelId) => void
  openOnlyPanel: (panel: PanelId) => void
  closePanel: (panel: PanelId) => void
  closeAllPanels: () => void
  setPanelsVisible: (visible: boolean) => void
  setPanelBottomY: (side: 'left' | 'right', y: number) => void
  setPromptTopY: (y: number) => void
  togglePanelsVisible: () => void
  setTableOpen: (open: boolean) => void
  toggleTable: () => void
  setTableHeight: (height: number) => void
  setUiHidden: (hidden: boolean) => void
  toggleUiHidden: () => void
  setPromptMode: (mode: PromptMode) => void
  applyPromptModeDefault: (mode: PromptMode) => void
  collapsePrompt: () => void
  expandPrompt: () => void
  maximizePrompt: () => void
  stepPromptDown: () => void
  stepPromptUp: () => void
  togglePromptCollapsed: () => void
  setWriteContent: (content: string) => void
  setWikiExpanded: (expanded: boolean) => void
  setWikiRouteIsGraph: (isGraph: boolean) => void
  setDetailPanelOpen: (open: boolean) => void
  savePanelPosition: (id: string, pos: { x: number; y: number; width: number; height?: number; docked: boolean; pinned?: boolean; preferredWidth?: number; leftOffset?: number }) => void
  setPanelScale: (id: string, scale: number) => void
  stepPanelScale: (id: string, delta: number) => void
  resetPanelScale: (id: string) => void
  togglePanelPinned: (id: string, leftOffset?: number) => void
  setFloatingObstacle: (id: string, rect: { x: number; y: number; width: number; height: number }) => void
  clearFloatingObstacle: (id: string) => void
}

export const createPanelSlice: StateCreator<DashboardState, [], [], PanelSlice> = (set) => ({
  openPanels: { ...CLOSED_PANELS },
  lastOpenedPanel: null,
  panelsVisible: true,
  panelBottomY: { left: 0, right: 0 },
  promptTopY: 0,
  tableOpen: false,
  tableHeight: 280,
  uiHidden: false,
  promptMode: 'normal',
  lastExpandedPromptMode: 'normal',
  wikiExpanded: false,
  wikiRouteIsGraph: false,
  detailPanelOpen: false,
  writeContent: '',
  panelPositions: {},
  panelScales: {},
  floatingObstacles: {},

  togglePanel: (panel) =>
    set((s) => {
      const isOpen = s.openPanels[panel]
      return {
        openPanels: { ...s.openPanels, [panel]: !isOpen },
        lastOpenedPanel: isOpen
          ? (s.lastOpenedPanel === panel ? null : s.lastOpenedPanel)
          : panel,
      }
    }),
  openPanel: (panel) =>
    set((s) => (
      s.openPanels[panel] && s.lastOpenedPanel === panel
        ? s
        : {
            openPanels: s.openPanels[panel]
              ? s.openPanels
              : { ...s.openPanels, [panel]: true },
            lastOpenedPanel: panel,
          }
    )),
  openOnlyPanel: (panel) =>
    set((s) => {
      const nextOpenPanels = { ...CLOSED_PANELS, [panel]: true }
      const alreadyExclusive = s.lastOpenedPanel === panel
        && Object.entries(s.openPanels).every(([id, open]) => open === nextOpenPanels[id as PanelId])

      return alreadyExclusive
        ? s
        : {
            openPanels: nextOpenPanels,
            lastOpenedPanel: panel,
          }
    }),
  closePanel: (panel) =>
    set((s) => (
      !s.openPanels[panel]
        ? s
        : {
            openPanels: { ...s.openPanels, [panel]: false },
            lastOpenedPanel: s.lastOpenedPanel === panel ? null : s.lastOpenedPanel,
          }
    )),
  closeAllPanels: () =>
    set({ openPanels: { ...CLOSED_PANELS }, lastOpenedPanel: null }),
  setPanelsVisible: (visible) => set((s) => (
    s.panelsVisible === visible ? s : { panelsVisible: visible }
  )),
  setPanelBottomY: (side, y) =>
    set((s) => s.panelBottomY[side] === y ? s : { panelBottomY: { ...s.panelBottomY, [side]: y } }),
  // ResizeObserver reports sub-pixel noise; 1px tolerance keeps docked panels
  // from re-clamping every frame while the prompt tweens.
  setPromptTopY: (y) =>
    set((s) => (Math.abs(s.promptTopY - y) < 1 ? s : { promptTopY: y })),
  togglePanelsVisible: () =>
    set((s) => {
      const next = !s.panelsVisible
      return {
        panelsVisible: next,
        ...(next
          ? {}
          : {
              openPanels: { ...CLOSED_PANELS },
              lastOpenedPanel: null,
            }),
      }
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
  applyPromptModeDefault: (promptMode) =>
    set({
      promptMode,
      lastExpandedPromptMode:
        promptMode === 'collapsed' ? 'normal' : promptMode,
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
  setWikiRouteIsGraph: (isGraph) => set((s) => (
    s.wikiRouteIsGraph === isGraph ? s : { wikiRouteIsGraph: isGraph }
  )),
  setDetailPanelOpen: (open) => set((s) => (
    s.detailPanelOpen === open ? s : { detailPanelOpen: open }
  )),
  savePanelPosition: (id, pos) =>
    set((s) => {
      const prior = s.panelPositions[id]
      const merged = pos.preferredWidth !== undefined || prior?.preferredWidth === undefined
        ? pos
        : { ...pos, preferredWidth: prior.preferredWidth }
      return { panelPositions: { ...s.panelPositions, [id]: merged } }
    }),
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
  togglePanelPinned: (id, leftOffset) =>
    set((s) => {
      // Seed a default when no prior entry exists so never-dragged panels can
      // still be pinned. `width: 0` is inert — layout reads `preferredWidth`
      // and falls back to PANEL_DOCK_WIDTH_PX[id] via resolvePreferredPanelWidth.
      const current = s.panelPositions[id] ?? { x: 0, y: 0, width: 0, docked: true, pinned: false }
      // Pinning captures the panel's current dock offset so it stays put when
      // siblings open. Unpinning drops it so the panel returns to linear flow.
      const next = !current.pinned
        ? {
            ...current,
            pinned: true,
            leftOffset: typeof leftOffset === 'number' ? leftOffset : current.leftOffset,
          }
        : { ...current, pinned: false, leftOffset: undefined }
      return {
        panelPositions: {
          ...s.panelPositions,
          [id]: next,
        },
      }
    }),
})
