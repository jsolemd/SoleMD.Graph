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
    it('opens a panel when none is active', () => {
      useDashboardStore.getState().togglePanel('config')
      expect(useDashboardStore.getState().activePanel).toBe('config')
    })

    it('closes the active panel when toggled again', () => {
      resetStore({ activePanel: 'config' })
      useDashboardStore.getState().togglePanel('config')
      expect(useDashboardStore.getState().activePanel).toBeNull()
    })

    it('switches to a different panel', () => {
      resetStore({ activePanel: 'config' })
      useDashboardStore.getState().togglePanel('filters')
      expect(useDashboardStore.getState().activePanel).toBe('filters')
    })
  })

  describe('togglePanelsVisible', () => {
    it('hides panels and clears active panel', () => {
      resetStore({ panelsVisible: true, activePanel: 'config' })
      useDashboardStore.getState().togglePanelsVisible()
      expect(useDashboardStore.getState().panelsVisible).toBe(false)
      expect(useDashboardStore.getState().activePanel).toBeNull()
    })

    it('shows panels without restoring active panel', () => {
      resetStore({ panelsVisible: false, activePanel: null })
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

  describe('setActivePanel', () => {
    it('does not emit when setting the active panel to the same value', () => {
      resetStore({ activePanel: 'config' })
      const listener = jest.fn()
      const unsubscribe = useDashboardStore.subscribe(listener)

      useDashboardStore.getState().setActivePanel('config')

      expect(listener).not.toHaveBeenCalled()
      unsubscribe()
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
    it('wiki is a valid ActivePanel value', () => {
      resetStore()
      useDashboardStore.getState().togglePanel('wiki')
      expect(useDashboardStore.getState().activePanel).toBe('wiki')
    })

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
