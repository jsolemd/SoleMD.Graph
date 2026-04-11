import { useDashboardStore } from '../dashboard-store'

type DashboardState = ReturnType<typeof useDashboardStore.getState>

function resetStore(overrides: Partial<DashboardState> = {}) {
  useDashboardStore.setState({
    ...useDashboardStore.getInitialState(),
    ...overrides,
  })
}

beforeEach(() => resetStore())

describe('panel-slice', () => {
  describe('togglePanel', () => {
    it('opens a panel when closed', () => {
      useDashboardStore.getState().togglePanel('config')
      expect(useDashboardStore.getState().openPanels.config).toBe(true)
    })

    it('closes a panel when open', () => {
      resetStore({ openPanels: { ...useDashboardStore.getState().openPanels, config: true } })
      useDashboardStore.getState().togglePanel('config')
      expect(useDashboardStore.getState().openPanels.config).toBe(false)
    })

    it('does not close other panels (non-exclusive)', () => {
      resetStore({ openPanels: { ...useDashboardStore.getState().openPanels, config: true } })
      useDashboardStore.getState().togglePanel('filters')
      expect(useDashboardStore.getState().openPanels.config).toBe(true)
      expect(useDashboardStore.getState().openPanels.filters).toBe(true)
    })
  })

  describe('openPanel / closePanel', () => {
    it('openPanel opens a specific panel', () => {
      useDashboardStore.getState().openPanel('wiki')
      expect(useDashboardStore.getState().openPanels.wiki).toBe(true)
    })

    it('openPanel is idempotent', () => {
      resetStore({ openPanels: { ...useDashboardStore.getState().openPanels, wiki: true } })
      const before = useDashboardStore.getState()
      useDashboardStore.getState().openPanel('wiki')
      expect(useDashboardStore.getState()).toBe(before)
    })

    it('closePanel closes a specific panel', () => {
      resetStore({ openPanels: { ...useDashboardStore.getState().openPanels, info: true } })
      useDashboardStore.getState().closePanel('info')
      expect(useDashboardStore.getState().openPanels.info).toBe(false)
    })

    it('closePanel is idempotent', () => {
      const before = useDashboardStore.getState()
      useDashboardStore.getState().closePanel('info')
      expect(useDashboardStore.getState()).toBe(before)
    })
  })

  describe('closeAllPanels', () => {
    it('closes all panels', () => {
      resetStore({ openPanels: { about: true, config: true, filters: true, info: true, query: true, wiki: true } })
      useDashboardStore.getState().closeAllPanels()
      const panels = useDashboardStore.getState().openPanels
      expect(Object.values(panels).every(v => v === false)).toBe(true)
    })
  })

  describe('togglePanelsVisible', () => {
    it('hides panels and closes all open panels', () => {
      resetStore({
        panelsVisible: true,
        openPanels: { ...useDashboardStore.getState().openPanels, config: true, wiki: true },
      })
      useDashboardStore.getState().togglePanelsVisible()
      expect(useDashboardStore.getState().panelsVisible).toBe(false)
      expect(useDashboardStore.getState().openPanels.config).toBe(false)
      expect(useDashboardStore.getState().openPanels.wiki).toBe(false)
    })

    it('shows panels without restoring open panels', () => {
      resetStore({ panelsVisible: false })
      useDashboardStore.getState().togglePanelsVisible()
      expect(useDashboardStore.getState().panelsVisible).toBe(true)
    })
  })

  describe('toggleTable', () => {
    it('toggles table open/closed', () => {
      resetStore({ tableOpen: false })
      useDashboardStore.getState().toggleTable()
      expect(useDashboardStore.getState().tableOpen).toBe(true)
      useDashboardStore.getState().toggleTable()
      expect(useDashboardStore.getState().tableOpen).toBe(false)
    })
  })

  describe('prompt mode state machine', () => {
    it('starts in normal mode', () => {
      expect(useDashboardStore.getState().promptMode).toBe('normal')
    })

    it('collapsePrompt remembers last expanded mode', () => {
      resetStore({ promptMode: 'maximized', lastExpandedPromptMode: 'maximized' })
      useDashboardStore.getState().collapsePrompt()
      const s = useDashboardStore.getState()
      expect(s.promptMode).toBe('collapsed')
      expect(s.lastExpandedPromptMode).toBe('maximized')
    })

    it('expandPrompt restores last expanded mode', () => {
      resetStore({ promptMode: 'collapsed', lastExpandedPromptMode: 'maximized' })
      useDashboardStore.getState().expandPrompt()
      expect(useDashboardStore.getState().promptMode).toBe('maximized')
    })

    it('stepPromptDown from maximized goes to normal', () => {
      resetStore({ promptMode: 'maximized' })
      useDashboardStore.getState().stepPromptDown()
      expect(useDashboardStore.getState().promptMode).toBe('normal')
    })

    it('stepPromptDown from normal goes to collapsed', () => {
      resetStore({ promptMode: 'normal' })
      useDashboardStore.getState().stepPromptDown()
      expect(useDashboardStore.getState().promptMode).toBe('collapsed')
    })

    it('stepPromptDown from collapsed is a no-op', () => {
      resetStore({ promptMode: 'collapsed', lastExpandedPromptMode: 'normal' })
      useDashboardStore.getState().stepPromptDown()
      expect(useDashboardStore.getState().promptMode).toBe('collapsed')
    })

    it('stepPromptUp from collapsed restores last expanded', () => {
      resetStore({ promptMode: 'collapsed', lastExpandedPromptMode: 'maximized' })
      useDashboardStore.getState().stepPromptUp()
      expect(useDashboardStore.getState().promptMode).toBe('maximized')
    })

    it('stepPromptUp from normal goes to maximized', () => {
      resetStore({ promptMode: 'normal' })
      useDashboardStore.getState().stepPromptUp()
      expect(useDashboardStore.getState().promptMode).toBe('maximized')
    })

    it('stepPromptUp from maximized is a no-op', () => {
      resetStore({ promptMode: 'maximized' })
      useDashboardStore.getState().stepPromptUp()
      expect(useDashboardStore.getState().promptMode).toBe('maximized')
    })

    it('togglePromptCollapsed collapses from normal', () => {
      resetStore({ promptMode: 'normal' })
      useDashboardStore.getState().togglePromptCollapsed()
      expect(useDashboardStore.getState().promptMode).toBe('collapsed')
      expect(useDashboardStore.getState().lastExpandedPromptMode).toBe('normal')
    })

    it('togglePromptCollapsed expands from collapsed', () => {
      resetStore({ promptMode: 'collapsed', lastExpandedPromptMode: 'maximized' })
      useDashboardStore.getState().togglePromptCollapsed()
      expect(useDashboardStore.getState().promptMode).toBe('maximized')
    })

    it('applyPromptModeDefault resets fullHeight', () => {
      resetStore({ promptShellFullHeight: true })
      useDashboardStore.getState().applyPromptModeDefault('normal')
      const s = useDashboardStore.getState()
      expect(s.promptMode).toBe('normal')
      expect(s.promptShellFullHeight).toBe(false)
      expect(s.lastExpandedPromptMode).toBe('normal')
    })
  })

  describe('setPanelBottomY', () => {
    it('sets left panel bottom y', () => {
      useDashboardStore.getState().setPanelBottomY('left', 100)
      expect(useDashboardStore.getState().panelBottomY.left).toBe(100)
    })

    it('does not update state when value is the same', () => {
      resetStore({ panelBottomY: { left: 100, right: 0 } })
      const before = useDashboardStore.getState()
      useDashboardStore.getState().setPanelBottomY('left', 100)
      expect(useDashboardStore.getState()).toBe(before)
    })
  })

  describe('toggleUiHidden', () => {
    it('toggles UI visibility', () => {
      resetStore({ uiHidden: false })
      useDashboardStore.getState().toggleUiHidden()
      expect(useDashboardStore.getState().uiHidden).toBe(true)
    })
  })

  describe('wiki panel state', () => {
    it('wikiExpanded defaults to false', () => {
      expect(useDashboardStore.getState().wikiExpanded).toBe(false)
    })

    it('setWikiExpanded toggles expanded state', () => {
      useDashboardStore.getState().setWikiExpanded(true)
      expect(useDashboardStore.getState().wikiExpanded).toBe(true)
      useDashboardStore.getState().setWikiExpanded(false)
      expect(useDashboardStore.getState().wikiExpanded).toBe(false)
    })

    it('setWikiExpandedWidth updates the width', () => {
      useDashboardStore.getState().setWikiExpandedWidth(700)
      expect(useDashboardStore.getState().wikiExpandedWidth).toBe(700)
    })

    it('does not emit when setting wikiExpanded to same value', () => {
      resetStore({ wikiExpanded: false })
      const before = useDashboardStore.getState()
      useDashboardStore.getState().setWikiExpanded(false)
      expect(useDashboardStore.getState()).toBe(before)
    })
  })
})
