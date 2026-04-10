import type { StateCreator } from 'zustand'
import type { DashboardState } from '../dashboard-store'

export type ActivePanel = 'about' | 'config' | 'filters' | 'info' | 'query' | 'wiki' | null
export type PromptMode = 'collapsed' | 'normal' | 'maximized'
type ExpandedPromptMode = Exclude<PromptMode, 'collapsed'>

export interface PanelSlice {
  // Panel visibility
  activePanel: ActivePanel
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
}

export const createPanelSlice: StateCreator<DashboardState, [], [], PanelSlice> = (set) => ({
  activePanel: null,
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

  setActivePanel: (panel) => set((s) => (
    s.activePanel === panel ? s : { activePanel: panel }
  )),
  togglePanel: (panel) =>
    set((s) => ({ activePanel: s.activePanel === panel ? null : panel })),
  setPanelsVisible: (visible) => set((s) => (
    s.panelsVisible === visible ? s : { panelsVisible: visible }
  )),
  setPanelBottomY: (side, y) =>
    set((s) => s.panelBottomY[side] === y ? s : { panelBottomY: { ...s.panelBottomY, [side]: y } }),
  togglePanelsVisible: () =>
    set((s) => {
      const next = !s.panelsVisible
      return { panelsVisible: next, ...(next ? {} : { activePanel: null }) }
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
})
