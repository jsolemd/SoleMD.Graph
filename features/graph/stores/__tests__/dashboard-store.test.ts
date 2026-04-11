import {
  selectBottomObstacles,
  selectBottomClearance,
  selectLeftClearance,
  selectPanelLeftOffset,
  resolveAdjacentFloatingPanelOffsets,
  resolveCenteredFloatingPanelOffsets,
  resolvePanelAnchorRect,
  selectRightClearance,
  resolveWikiPanelWidth,
  useDashboardStore,
} from '../dashboard-store'

type DashboardState = ReturnType<typeof useDashboardStore.getState>

const CLOSED_PANELS = { about: false, config: false, filters: false, info: false, query: false, wiki: false }

/** Build a partial state merged onto defaults. */
function makeState(overrides: Partial<DashboardState> = {}): DashboardState {
  return { ...useDashboardStore.getState(), ...overrides }
}

describe('selectBottomObstacles', () => {
  it('returns 0 when timeline hidden and table closed', () => {
    expect(selectBottomObstacles(makeState({ showTimeline: false, tableOpen: false }))).toBe(0)
  })

  it('adds 44 for timeline', () => {
    expect(selectBottomObstacles(makeState({ showTimeline: true, tableOpen: false }))).toBe(44)
  })

  it('adds tableHeight for open table', () => {
    expect(selectBottomObstacles(makeState({ showTimeline: false, tableOpen: true, tableHeight: 300 }))).toBe(300)
  })

  it('combines timeline and table', () => {
    expect(selectBottomObstacles(makeState({ showTimeline: true, tableOpen: true, tableHeight: 200 }))).toBe(244)
  })
})

describe('selectBottomClearance', () => {
  it('adds toolbar clearance when panels visible', () => {
    // toolbarBase(12) + toolbarIcon(34) + gap(8) = 54
    const state = makeState({ showTimeline: false, tableOpen: false, panelsVisible: true })
    expect(selectBottomClearance(state)).toBe(54)
  })

  it('returns obstacles only when panels hidden', () => {
    const state = makeState({ showTimeline: true, tableOpen: false, panelsVisible: false })
    expect(selectBottomClearance(state)).toBe(44)
  })

  it('combines obstacles and toolbar', () => {
    const state = makeState({ showTimeline: true, tableOpen: true, tableHeight: 200, panelsVisible: true })
    // obstacles: 44 + 200 = 244, toolbar: 54 → total 298
    expect(selectBottomClearance(state)).toBe(298)
  })
})

describe('selectLeftClearance', () => {
  it('returns 0 when no panels are open', () => {
    expect(selectLeftClearance(makeState({ openPanels: { ...CLOSED_PANELS } }))).toBe(0)
  })

  it('returns about panel width regardless of panelsVisible', () => {
    // about: 320 + margin 24 = 344
    const panels = { ...CLOSED_PANELS, about: true }
    expect(selectLeftClearance(makeState({ openPanels: panels, panelsVisible: false }))).toBe(344)
    expect(selectLeftClearance(makeState({ openPanels: panels, panelsVisible: true }))).toBe(344)
  })

  it('returns 0 for non-about panels when panelsVisible is false', () => {
    expect(selectLeftClearance(makeState({ openPanels: { ...CLOSED_PANELS, config: true }, panelsVisible: false }))).toBe(0)
    expect(selectLeftClearance(makeState({ openPanels: { ...CLOSED_PANELS, filters: true }, panelsVisible: false }))).toBe(0)
  })

  it('returns width + margin for each panel type', () => {
    const cases: Array<[keyof typeof CLOSED_PANELS, number]> = [
      ['config', 300 + 24],
      ['filters', 300 + 24],
      ['info', 320 + 24],
      ['query', 420 + 24],
      ['wiki', 520 + 24],
    ]
    for (const [panel, expected] of cases) {
      expect(selectLeftClearance(makeState({ openPanels: { ...CLOSED_PANELS, [panel]: true }, panelsVisible: true }))).toBe(expected)
    }
  })

  it('sums multiple docked panels', () => {
    const state = makeState({
      openPanels: { ...CLOSED_PANELS, filters: true, wiki: true },
      panelsVisible: true,
    })
    // filters (300 + 24) + wiki (520 + 24) = 868
    expect(selectLeftClearance(state)).toBe((300 + 24) + (520 + 24))
  })

  it('returns expanded width for wiki when wikiExpanded is true', () => {
    const state = makeState({
      openPanels: { ...CLOSED_PANELS, wiki: true },
      panelsVisible: true,
      wikiExpanded: true,
      wikiExpandedWidth: 650,
    })
    expect(selectLeftClearance(state)).toBe(650 + 24)
  })

  it('excludes floating (undocked) panels from clearance', () => {
    const state = makeState({
      openPanels: { ...CLOSED_PANELS, wiki: true },
      panelsVisible: true,
      floatingObstacles: { wiki: { x: 100, y: 100, width: 400, height: 600 } },
    })
    expect(selectLeftClearance(state)).toBe(0)
  })
})

describe('selectPanelLeftOffset', () => {
  it('returns 0 for the first panel in dock order', () => {
    const state = makeState({
      openPanels: { ...CLOSED_PANELS, about: true, config: true },
      panelsVisible: true,
    })
    expect(selectPanelLeftOffset(state, 'about')).toBe(0)
  })

  it('returns offset from panels before it', () => {
    const state = makeState({
      openPanels: { ...CLOSED_PANELS, config: true, wiki: true },
      panelsVisible: true,
    })
    // wiki comes after config in order; config width = 300 + 12 gap
    expect(selectPanelLeftOffset(state, 'wiki')).toBe(312)
  })

  it('skips closed panels', () => {
    const state = makeState({
      openPanels: { ...CLOSED_PANELS, wiki: true },
      panelsVisible: true,
    })
    expect(selectPanelLeftOffset(state, 'wiki')).toBe(0)
  })
})

describe('panel anchor helpers', () => {
  it('returns a floating panel anchor from floating obstacles', () => {
    const state = makeState({
      floatingObstacles: {
        wiki: { x: 240, y: 180, width: 520, height: 620 },
      },
    })

    expect(resolvePanelAnchorRect(state, 'wiki', 116)).toEqual({
      left: 240,
      top: 180,
      width: 520,
    })
  })

  it('returns a docked panel anchor from dock layout', () => {
    const state = makeState({
      openPanels: { ...CLOSED_PANELS, wiki: true },
      panelsVisible: true,
    })

    expect(resolvePanelAnchorRect(state, 'wiki', 116)).toEqual({
      left: 12,
      top: 116,
      width: 520,
    })
  })

  it('resolves centered floating offsets within the viewport', () => {
    const state = makeState({
      openPanels: { ...CLOSED_PANELS, wiki: true },
      panelsVisible: true,
    })

    expect(resolveCenteredFloatingPanelOffsets({
      state,
      panelId: 'wiki-global-graph',
      panelWidth: 960,
      panelHeight: 720,
      panelTop: 116,
      viewportWidth: 1600,
      viewportHeight: 1000,
    })).toEqual({
      x: 308,
      y: 24,
    })
  })

  it('resolves adjacent floating offsets beside the anchor rect', () => {
    const state = makeState({
      openPanels: { ...CLOSED_PANELS, wiki: true },
      panelsVisible: true,
      floatingObstacles: {
        wiki: { x: 200, y: 180, width: 520, height: 620 },
      },
    })

    expect(resolveAdjacentFloatingPanelOffsets({
      state,
      panelId: 'wiki-graph',
      anchorRect: { left: 200, top: 180, width: 520 },
      panelWidth: 320,
      panelTop: 116,
      viewportWidth: 1600,
    })).toEqual({
      x: 720,
      y: 64,
    })
  })
})

describe('resolveWikiPanelWidth', () => {
  it('returns default width when not expanded', () => {
    expect(resolveWikiPanelWidth(1920, false)).toBe(520)
  })

  it('returns 65% of viewport when expanded, capped at 840', () => {
    expect(resolveWikiPanelWidth(1920, true)).toBe(840)
  })

  it('returns 65% of viewport for smaller screens', () => {
    expect(resolveWikiPanelWidth(800, true)).toBe(520)
  })
})

describe('selectRightClearance', () => {
  it('returns 0 when panelBottomY.right is 0', () => {
    expect(selectRightClearance(makeState({ panelBottomY: { left: 0, right: 0 } }))).toBe(0)
  })

  it('returns detail panel clearance (380 + 24) when panelBottomY.right > 0', () => {
    expect(selectRightClearance(makeState({ panelBottomY: { left: 0, right: 100 } }))).toBe(404)
  })
})

describe('selection locking', () => {
  afterEach(() => {
    useDashboardStore.setState({
      currentPointScopeSql: null,
      selectedPointCount: 0,
      selectionLocked: false,
    })
  })

  it('does not lock when there is no active subset', () => {
    useDashboardStore.getState().lockSelection()
    expect(useDashboardStore.getState().selectionLocked).toBe(false)
  })

  it('locks when there is a manual selection', () => {
    useDashboardStore.setState({ selectedPointCount: 3 })
    useDashboardStore.getState().lockSelection()
    expect(useDashboardStore.getState().selectionLocked).toBe(true)
  })

  it('locks when there is a current filtered subset', () => {
    useDashboardStore.setState({
      currentPointScopeSql: 'index IN (1, 2, 3)',
      selectedPointCount: 0,
    })
    useDashboardStore.getState().lockSelection()
    expect(useDashboardStore.getState().selectionLocked).toBe(true)
  })
})

describe('prompt mode actions', () => {
  afterEach(() => {
    useDashboardStore.setState({
      promptMode: 'normal',
      lastExpandedPromptMode: 'normal',
    })
  })

  it('collapses and expands through a single canonical prompt mode', () => {
    useDashboardStore.getState().collapsePrompt()
    expect(useDashboardStore.getState().promptMode).toBe('collapsed')

    useDashboardStore.getState().expandPrompt()
    expect(useDashboardStore.getState().promptMode).toBe('normal')
  })

  it('maximizes and restores without overlapping collapsed state', () => {
    useDashboardStore.getState().maximizePrompt()
    expect(useDashboardStore.getState().promptMode).toBe('maximized')

    useDashboardStore.getState().setPromptMode('normal')
    expect(useDashboardStore.getState().promptMode).toBe('normal')
  })

  it('toggles collapsed state from the current mode', () => {
    useDashboardStore.getState().togglePromptCollapsed()
    expect(useDashboardStore.getState().promptMode).toBe('collapsed')

    useDashboardStore.getState().togglePromptCollapsed()
    expect(useDashboardStore.getState().promptMode).toBe('normal')
  })

  it('restores the prior expanded size when reopening after collapse', () => {
    useDashboardStore.getState().maximizePrompt()
    useDashboardStore.getState().collapsePrompt()
    expect(useDashboardStore.getState().promptMode).toBe('collapsed')

    useDashboardStore.getState().expandPrompt()
    expect(useDashboardStore.getState().promptMode).toBe('maximized')
  })

  it('resets restored prompt size when a graph mode applies a new default', () => {
    useDashboardStore.getState().maximizePrompt()
    useDashboardStore.getState().applyPromptModeDefault('collapsed')
    expect(useDashboardStore.getState().promptMode).toBe('collapsed')

    useDashboardStore.getState().expandPrompt()
    expect(useDashboardStore.getState().promptMode).toBe('normal')
  })

  it('can apply maximized as a graph-mode default', () => {
    useDashboardStore.getState().applyPromptModeDefault('maximized')
    expect(useDashboardStore.getState().promptMode).toBe('maximized')

    useDashboardStore.getState().collapsePrompt()
    useDashboardStore.getState().expandPrompt()
    expect(useDashboardStore.getState().promptMode).toBe('maximized')
  })

  it('steps prompt size down through maximized, normal, then collapsed', () => {
    useDashboardStore.getState().maximizePrompt()
    useDashboardStore.getState().stepPromptDown()
    expect(useDashboardStore.getState().promptMode).toBe('normal')
    expect(useDashboardStore.getState().lastExpandedPromptMode).toBe('normal')

    useDashboardStore.getState().stepPromptDown()
    expect(useDashboardStore.getState().promptMode).toBe('collapsed')
    expect(useDashboardStore.getState().lastExpandedPromptMode).toBe('normal')
  })

  it('steps prompt size up through normal, then maximized', () => {
    useDashboardStore.getState().collapsePrompt()
    useDashboardStore.getState().stepPromptUp()
    expect(useDashboardStore.getState().promptMode).toBe('normal')

    useDashboardStore.getState().stepPromptUp()
    expect(useDashboardStore.getState().promptMode).toBe('maximized')
    expect(useDashboardStore.getState().lastExpandedPromptMode).toBe('maximized')
  })
})
