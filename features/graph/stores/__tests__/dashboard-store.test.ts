import {
  selectBottomObstacles,
  selectBottomClearance,
  selectLeftClearance,
  selectRightClearance,
  useDashboardStore,
} from '../dashboard-store'

type DashboardState = ReturnType<typeof useDashboardStore.getState>

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
  it('returns 0 when no panel active', () => {
    expect(selectLeftClearance(makeState({ activePanel: null }))).toBe(0)
  })

  it('returns about panel width regardless of panelsVisible', () => {
    // about: 320 + margin 24 = 344
    expect(selectLeftClearance(makeState({ activePanel: 'about', panelsVisible: false }))).toBe(344)
    expect(selectLeftClearance(makeState({ activePanel: 'about', panelsVisible: true }))).toBe(344)
  })

  it('returns 0 for non-about panels when panelsVisible is false', () => {
    expect(selectLeftClearance(makeState({ activePanel: 'config', panelsVisible: false }))).toBe(0)
    expect(selectLeftClearance(makeState({ activePanel: 'filters', panelsVisible: false }))).toBe(0)
  })

  it('returns width + margin for each panel type', () => {
    const cases: Array<[NonNullable<DashboardState['activePanel']>, number]> = [
      ['config', 300 + 24],
      ['filters', 300 + 24],
      ['info', 320 + 24],
      ['query', 420 + 24],
    ]
    for (const [panel, expected] of cases) {
      expect(selectLeftClearance(makeState({ activePanel: panel, panelsVisible: true }))).toBe(expected)
    }
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
