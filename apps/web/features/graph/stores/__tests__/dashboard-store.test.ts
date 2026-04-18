import {
  computeDockedLayout,
  selectBottomObstacles,
  selectBottomClearance,
  selectLeftClearance,
  selectDockedBottomClearance,
  selectPanelAvailableWidth,
  selectPanelLeftOffset,
  resolveAdjacentFloatingPanelOffsets,
  resolveCenteredFloatingPanelOffsets,
  resolvePanelAnchorRect,
  selectRightClearance,
  resolveWikiPanelWidth,
  resolveWikiPanelGeometry,
  useDashboardStore,
  PANEL_DOCK_ORDER,
} from '../dashboard-store'
import { APP_CHROME_PX, PANEL_DOCK_MIN_PX, PANEL_DOCK_WIDTH_PX, WIKI_PANEL_PX } from '@/lib/density'
import { BOTTOM_BASE, PROMPT_FALLBACK_NORMAL_HEIGHT } from '@/features/graph/components/panels/prompt/constants'

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
    expect(selectBottomObstacles(makeState({ showTimeline: true, tableOpen: false }))).toBe(APP_CHROME_PX.timelineHeight)
  })

  it('adds tableHeight for open table', () => {
    expect(selectBottomObstacles(makeState({ showTimeline: false, tableOpen: true, tableHeight: 300 }))).toBe(300)
  })

  it('combines timeline and table', () => {
    expect(selectBottomObstacles(makeState({ showTimeline: true, tableOpen: true, tableHeight: 200 }))).toBe(
      APP_CHROME_PX.timelineHeight + 200,
    )
  })
})

describe('selectBottomClearance', () => {
  it('adds toolbar clearance when panels visible', () => {
    const state = makeState({ showTimeline: false, tableOpen: false, panelsVisible: true })
    expect(selectBottomClearance(state)).toBe(
      APP_CHROME_PX.toolbarBase + APP_CHROME_PX.toolbarIcon + APP_CHROME_PX.toolbarGap,
    )
  })

  it('returns obstacles only when panels hidden', () => {
    const state = makeState({ showTimeline: true, tableOpen: false, panelsVisible: false })
    expect(selectBottomClearance(state)).toBe(APP_CHROME_PX.timelineHeight)
  })

  it('combines obstacles and toolbar', () => {
    const state = makeState({ showTimeline: true, tableOpen: true, tableHeight: 200, panelsVisible: true })
    expect(selectBottomClearance(state)).toBe(
      APP_CHROME_PX.timelineHeight + 200 + APP_CHROME_PX.toolbarBase + APP_CHROME_PX.toolbarIcon + APP_CHROME_PX.toolbarGap,
    )
  })
})

describe('selectDockedBottomClearance', () => {
  const viewportHeight = 1000

  it('returns the prompt-space fallback floor when the prompt top has not published yet', () => {
    // Frame-1 mount race: the prompt card's ResizeObserver has not fired, so
    // promptTopY is still 0. The docked clearance must still reserve enough
    // space for a normal-mode prompt so the initial paint does not overshoot.
    const state = makeState({ promptTopY: 0, panelsVisible: true })
    const fallback = BOTTOM_BASE + PROMPT_FALLBACK_NORMAL_HEIGHT + APP_CHROME_PX.panelGap
    const actual = selectDockedBottomClearance(state, viewportHeight)
    expect(actual).toBeGreaterThanOrEqual(fallback)
    expect(actual).toBe(Math.max(selectBottomClearance(state), fallback))
  })

  it('reserves the space from prompt top down to viewport bottom plus a panel gap when the prompt is present', () => {
    const state = makeState({ promptTopY: 850, panelsVisible: true })
    const expected = Math.max(
      selectBottomClearance(state),
      viewportHeight - 850 + APP_CHROME_PX.panelGap,
    )
    expect(selectDockedBottomClearance(state, viewportHeight)).toBe(expected)
    // Sanity: with a short prompt (150 px + gap), the prompt-driven reservation
    // should win over the ~toolbar-only base clearance.
    expect(selectDockedBottomClearance(state, viewportHeight)).toBeGreaterThan(
      selectBottomClearance(state),
    )
  })

  it('keeps the base clearance when a tall bottom dock already reserves more than the prompt', () => {
    // Table open with a tall height — the base clearance exceeds what the
    // prompt reserves, so the docked selector returns the base value.
    const state = makeState({
      promptTopY: 900,
      showTimeline: true,
      tableOpen: true,
      tableHeight: 400,
      panelsVisible: true,
    })
    expect(selectDockedBottomClearance(state, viewportHeight)).toBe(selectBottomClearance(state))
  })

  it('returns the base clearance when the viewport height is unknown', () => {
    const state = makeState({ promptTopY: 500, panelsVisible: true })
    expect(selectDockedBottomClearance(state, 0)).toBe(selectBottomClearance(state))
  })
})

describe('selectLeftClearance', () => {
  it('returns 0 when no panels are open', () => {
    expect(selectLeftClearance(makeState({ openPanels: { ...CLOSED_PANELS } }))).toBe(0)
  })

  it('returns about panel width regardless of panelsVisible', () => {
    const panels = { ...CLOSED_PANELS, about: true }
    expect(selectLeftClearance(makeState({ openPanels: panels, panelsVisible: false }))).toBe(
      PANEL_DOCK_WIDTH_PX.about + APP_CHROME_PX.panelMargin,
    )
    expect(selectLeftClearance(makeState({ openPanels: panels, panelsVisible: true }))).toBe(
      PANEL_DOCK_WIDTH_PX.about + APP_CHROME_PX.panelMargin,
    )
  })

  it('returns 0 for non-about panels when panelsVisible is false', () => {
    expect(selectLeftClearance(makeState({ openPanels: { ...CLOSED_PANELS, config: true }, panelsVisible: false }))).toBe(0)
    expect(selectLeftClearance(makeState({ openPanels: { ...CLOSED_PANELS, filters: true }, panelsVisible: false }))).toBe(0)
  })

  it('returns width + margin for each panel type', () => {
    const cases: Array<[keyof typeof CLOSED_PANELS, number]> = [
      ['config', PANEL_DOCK_WIDTH_PX.config + APP_CHROME_PX.panelMargin],
      ['filters', PANEL_DOCK_WIDTH_PX.filters + APP_CHROME_PX.panelMargin],
      ['info', PANEL_DOCK_WIDTH_PX.info + APP_CHROME_PX.panelMargin],
      ['query', PANEL_DOCK_WIDTH_PX.query + APP_CHROME_PX.panelMargin],
      ['wiki', PANEL_DOCK_WIDTH_PX.wiki + APP_CHROME_PX.panelMargin],
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
    expect(selectLeftClearance(state)).toBe(
      (PANEL_DOCK_WIDTH_PX.filters + APP_CHROME_PX.panelMargin)
      + (PANEL_DOCK_WIDTH_PX.wiki + APP_CHROME_PX.panelMargin),
    )
  })

  it('returns derived expanded width for wiki when wikiExpanded is true', () => {
    const state = makeState({
      openPanels: { ...CLOSED_PANELS, wiki: true },
      panelsVisible: true,
      wikiExpanded: true,
    })
    // At a 1920 viewport the 0.70 ratio (1344) hits the expandedWidthMax cap.
    expect(selectLeftClearance(state, 1920)).toBe(WIKI_PANEL_PX.expandedWidthMax + APP_CHROME_PX.panelMargin)
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
    expect(selectPanelLeftOffset(state, 'wiki')).toBe(PANEL_DOCK_WIDTH_PX.config + APP_CHROME_PX.panelGap)
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
      left: APP_CHROME_PX.edgeMargin,
      top: 116,
      width: PANEL_DOCK_WIDTH_PX.wiki,
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
      x: 320 - APP_CHROME_PX.edgeMargin,
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

describe('computeDockedLayout — elastic dock', () => {
  const ALL_OPEN = { about: true, config: true, filters: true, info: true, query: true, wiki: true }

  function openPanels(ids: readonly string[]) {
    const panels = { ...CLOSED_PANELS }
    for (const id of ids) panels[id as keyof typeof CLOSED_PANELS] = true
    return panels
  }

  describe('at preferred widths when budget is ample', () => {
    it.each([[1920], [1440], [1280]])(
      'renders wiki alone at preferred (viewport %i)',
      (vw) => {
        const state = makeState({ openPanels: openPanels(['wiki']), panelsVisible: true })
        const layout = computeDockedLayout(state, vw)
        expect(layout.widths.wiki).toBe(PANEL_DOCK_WIDTH_PX.wiki)
        expect(layout.offsets.wiki).toBe(0)
      },
    )

    it('renders about+config+wiki at preferred (viewport 1920)', () => {
      const state = makeState({ openPanels: openPanels(['about', 'config', 'wiki']), panelsVisible: true })
      const layout = computeDockedLayout(state, 1920)
      expect(layout.widths.about).toBe(PANEL_DOCK_WIDTH_PX.about)
      expect(layout.widths.config).toBe(PANEL_DOCK_WIDTH_PX.config)
      expect(layout.widths.wiki).toBe(PANEL_DOCK_WIDTH_PX.wiki)
    })
  })

  describe('shrinks last-in-order when budget is tight', () => {
    it('shrinks wiki first when all six panels open at 1920', () => {
      const state = makeState({ openPanels: { ...ALL_OPEN }, panelsVisible: true })
      const layout = computeDockedLayout(state, 1920)
      // Wiki is last and unpinned → takes the squeeze first.
      expect(layout.widths.wiki).toBeLessThan(PANEL_DOCK_WIDTH_PX.wiki)
      expect(layout.widths.wiki).toBeGreaterThanOrEqual(PANEL_DOCK_MIN_PX.wiki)
      // Earlier panels untouched until wiki hits its floor.
      expect(layout.widths.about).toBe(PANEL_DOCK_WIDTH_PX.about)
    })

    it('cascades to earlier panels once wiki hits its min (viewport 900)', () => {
      const state = makeState({ openPanels: { ...ALL_OPEN }, panelsVisible: true })
      const layout = computeDockedLayout(state, 900)
      expect(layout.widths.wiki).toBe(PANEL_DOCK_MIN_PX.wiki)
      // At least one panel earlier than wiki has also shrunk below preferred.
      const someEarlierShrunk = PANEL_DOCK_ORDER.slice(0, -1).some(
        (id) => layout.widths[id] < (PANEL_DOCK_WIDTH_PX[id as keyof typeof PANEL_DOCK_WIDTH_PX] ?? 0),
      )
      expect(someEarlierShrunk).toBe(true)
    })
  })

  describe('pin-as-primary', () => {
    it('leaves pinned wiki at preferred; earlier panels shrink instead', () => {
      const state = makeState({
        openPanels: { ...ALL_OPEN },
        panelsVisible: true,
        panelPositions: {
          wiki: { x: 0, y: 0, width: PANEL_DOCK_WIDTH_PX.wiki, docked: true, pinned: true },
        },
      })
      // Viewport sized so the pinned wiki preferred + other-panel mins still
      // fit the budget — pinned wiki otherwise falls into the "all clamp to
      // min" overflow branch. Wiki's dock reservation is 820 (density-scaled)
      // so the floor scales up with it.
      const layout = computeDockedLayout(state, 1800)
      expect(layout.widths.wiki).toBe(PANEL_DOCK_WIDTH_PX.wiki)
      // Some earlier unpinned panel absorbed the squeeze.
      const earlierShrunk = PANEL_DOCK_ORDER.slice(0, -1).some(
        (id) => layout.widths[id] < (PANEL_DOCK_WIDTH_PX[id as keyof typeof PANEL_DOCK_WIDTH_PX] ?? 0),
      )
      expect(earlierShrunk).toBe(true)
    })

    it('right-pins the rightmost panel when mins exceed the budget', () => {
      const state = makeState({
        openPanels: { ...ALL_OPEN },
        panelsVisible: true,
        panelPositions: Object.fromEntries(
          PANEL_DOCK_ORDER.map((id) => [id, { x: 0, y: 0, width: PANEL_DOCK_WIDTH_PX[id as keyof typeof PANEL_DOCK_WIDTH_PX], docked: true, pinned: true }]),
        ),
      })
      const layout = computeDockedLayout(state, 900)
      const lastId = PANEL_DOCK_ORDER[PANEL_DOCK_ORDER.length - 1]
      // Rightmost right-pinned at viewportWidth - edgeMargin (offset measured
      // from the dock's left anchor at edgeMargin).
      const lastRight = APP_CHROME_PX.edgeMargin + layout.offsets[lastId] + layout.widths[lastId]
      expect(lastRight).toBeLessThanOrEqual(900 - APP_CHROME_PX.edgeMargin + 1)
    })
  })

  describe('pinned panel preserves leftOffset', () => {
    it('pinned wiki keeps its x position when about opens (unpinned flows around)', () => {
      // Simulates: open wiki alone (leftOffset=0), pin, then open about.
      const state = makeState({
        openPanels: openPanels(['about', 'wiki']),
        panelsVisible: true,
        panelPositions: {
          wiki: { x: 0, y: 0, width: 0, docked: true, pinned: true, leftOffset: 0 },
        },
        wikiRouteIsGraph: true,
      })
      const layout = computeDockedLayout(state, 1282)
      // Wiki stays at offset 0 (its pinned position).
      expect(layout.offsets.wiki).toBe(0)
      // At viewport 1282 the 0.58 ratio hits the routeGraphWidthMax cap, so
      // about flows past the cap instead of taking the first slot.
      const gap = APP_CHROME_PX.panelGap
      expect(layout.offsets.about).toBe(WIKI_PANEL_PX.routeGraphWidthMax + gap)
    })

    it('unpinning wiki clears leftOffset so it returns to linear flow', () => {
      // Simulates post-unpin state: pinned:false and no leftOffset.
      const state = makeState({
        openPanels: openPanels(['about', 'wiki']),
        panelsVisible: true,
        panelPositions: {
          wiki: { x: 0, y: 0, width: 0, docked: true, pinned: false },
        },
        wikiRouteIsGraph: true,
      })
      const layout = computeDockedLayout(state, 1282)
      // About takes the first slot, wiki flows after it.
      expect(layout.offsets.about).toBe(0)
      const gap = APP_CHROME_PX.panelGap
      expect(layout.offsets.wiki).toBe(PANEL_DOCK_WIDTH_PX.about + gap)
    })
  })

  describe('togglePanelPinned seed + elastic dock', () => {
    it('post-unpin wiki still shrinks (seed with pinned:false is not treated as pinned)', () => {
      // Simulates panelPositions left behind by togglePanelPinned after pin+unpin
      // for a never-dragged wiki: pinned:false but the entry exists.
      const state = makeState({
        openPanels: openPanels(['about', 'config', 'filters', 'wiki']),
        panelsVisible: true,
        panelPositions: {
          wiki: { x: 0, y: 0, width: 0, docked: true, pinned: false },
        },
        wikiRouteIsGraph: true,
      })
      const layout = computeDockedLayout(state, 1282)
      expect(layout.widths.wiki).toBeLessThan(WIKI_PANEL_PX.routeGraphWidthMax)
      expect(layout.widths.about).toBe(PANEL_DOCK_WIDTH_PX.about)
    })

    it('seed with pinned:true keeps a never-dragged non-wiki panel at preferred', () => {
      // Simulates the seed togglePanelPinned plants for a never-dragged info panel.
      const state = makeState({
        openPanels: openPanels(['config', 'filters', 'info', 'wiki']),
        panelsVisible: true,
        panelPositions: {
          info: { x: 0, y: 0, width: 0, docked: true, pinned: true },
        },
        wikiRouteIsGraph: true,
      })
      const layout = computeDockedLayout(state, 1282)
      expect(layout.widths.info).toBe(PANEL_DOCK_WIDTH_PX.info)
      // Wiki absorbs the squeeze instead (unpinned, last in dock order).
      expect(layout.widths.wiki).toBeLessThan(WIKI_PANEL_PX.routeGraphWidthMax)
    })
  })

  describe('invariants under shrinking', () => {
    it.each([[1440], [1280], [1024], [900]])('no panel below its min at viewport %i', (vw) => {
      const state = makeState({ openPanels: { ...ALL_OPEN }, panelsVisible: true })
      const layout = computeDockedLayout(state, vw)
      for (const id of layout.dockedIds) {
        expect(layout.widths[id]).toBeGreaterThanOrEqual(PANEL_DOCK_MIN_PX[id as keyof typeof PANEL_DOCK_MIN_PX])
      }
    })

    it('preferred width is never exceeded', () => {
      const state = makeState({ openPanels: { ...ALL_OPEN }, panelsVisible: true })
      const layout = computeDockedLayout(state, 1920)
      for (const id of layout.dockedIds) {
        expect(layout.widths[id]).toBeLessThanOrEqual(PANEL_DOCK_WIDTH_PX[id as keyof typeof PANEL_DOCK_WIDTH_PX])
      }
    })
  })
})

describe('selectPanelAvailableWidth', () => {
  it('returns layout-clamped rendered width for a docked panel', () => {
    const state = makeState({
      openPanels: { about: true, config: true, filters: true, info: true, query: true, wiki: true },
      panelsVisible: true,
    })
    const available = selectPanelAvailableWidth(state, 'wiki', 900)
    expect(available).toBeGreaterThanOrEqual(PANEL_DOCK_MIN_PX.wiki)
    expect(available).toBeLessThanOrEqual(PANEL_DOCK_WIDTH_PX.wiki)
  })

  it('returns full viewport minus edge margins for a floating panel', () => {
    const state = makeState({
      openPanels: { ...CLOSED_PANELS, wiki: true },
      panelsVisible: true,
      floatingObstacles: { wiki: { x: 100, y: 100, width: 400, height: 600 } },
    })
    expect(selectPanelAvailableWidth(state, 'wiki', 1440)).toBe(1440 - 2 * APP_CHROME_PX.edgeMargin)
  })

  it('returns full viewport minus edge margins for an id not in dock order', () => {
    const state = makeState()
    expect(selectPanelAvailableWidth(state, 'wiki-global-graph', 1280)).toBe(1280 - 2 * APP_CHROME_PX.edgeMargin)
  })
})

describe('resolveWikiPanelWidth', () => {
  it('returns default width when not expanded', () => {
    expect(resolveWikiPanelWidth(1920, false)).toBe(PANEL_DOCK_WIDTH_PX.wiki)
  })

  it('returns 70% of viewport when expanded, capped at the density-scaled max', () => {
    expect(resolveWikiPanelWidth(1920, true)).toBe(WIKI_PANEL_PX.expandedWidthMax)
  })

  it('returns the dock width floor once the viewport ratio drops below it', () => {
    expect(resolveWikiPanelWidth(700, true)).toBe(PANEL_DOCK_WIDTH_PX.wiki)
  })
})

describe('resolveWikiPanelGeometry', () => {
  const wideViewport = { width: 1920, height: 1080 }

  it('renders graph home as a true square — width === height', () => {
    const geometry = resolveWikiPanelGeometry(wideViewport.width, wideViewport.height, {
      wikiRouteIsGraph: true,
      wikiExpanded: false,
    })
    expect(geometry.width).toBe(WIKI_PANEL_PX.baseWidth)
    expect(geometry.width).toBe(geometry.height)
  })

  it('keeps width constant across graph ↔ page so route flips never move the width edge', () => {
    const graphHome = resolveWikiPanelGeometry(wideViewport.width, wideViewport.height, {
      wikiRouteIsGraph: true,
      wikiExpanded: false,
    })
    const wikiPage = resolveWikiPanelGeometry(wideViewport.width, wideViewport.height, {
      wikiRouteIsGraph: false,
      wikiExpanded: false,
    })
    expect(wikiPage.width).toBe(graphHome.width)
    // Wiki page grows downward — height differs but width stays put.
    expect(wikiPage.height).toBeGreaterThan(graphHome.height)
  })

  it('clamps the width to the viewport minus edge margins when the viewport is narrower than the square side', () => {
    const narrow = 600
    const geometry = resolveWikiPanelGeometry(narrow, wideViewport.height, {
      wikiRouteIsGraph: true,
      wikiExpanded: false,
    })
    expect(geometry.width).toBe(narrow - 2 * APP_CHROME_PX.edgeMargin)
    expect(geometry.width).toBeLessThan(WIKI_PANEL_PX.baseWidth)
  })

  it('floors the width at routeGraphMinHeight so the square never collapses below the graph-viz floor', () => {
    const extremelyNarrow = 200
    const geometry = resolveWikiPanelGeometry(extremelyNarrow, wideViewport.height, {
      wikiRouteIsGraph: true,
      wikiExpanded: false,
    })
    expect(geometry.width).toBe(WIKI_PANEL_PX.routeGraphMinHeight)
  })

  it('uses the 70% expanded width when wikiExpanded is true', () => {
    const geometry = resolveWikiPanelGeometry(wideViewport.width, wideViewport.height, {
      wikiRouteIsGraph: false,
      wikiExpanded: true,
    })
    expect(geometry.width).toBe(WIKI_PANEL_PX.expandedWidthMax)
  })

  it('clamps the wiki page height against the supplied dockedBottomClearance and returns an explicit maxHeight', () => {
    const vh = 1080
    const clearance = 540
    const geometry = resolveWikiPanelGeometry(wideViewport.width, vh, {
      wikiRouteIsGraph: false,
      wikiExpanded: false,
    }, clearance)
    const expectedMax = Math.max(
      WIKI_PANEL_PX.routeGraphMinHeight,
      vh - APP_CHROME_PX.panelTop - clearance - APP_CHROME_PX.edgeMargin,
    )
    expect(geometry.maxHeight).toBe(expectedMax)
    expect(geometry.height).toBeLessThanOrEqual(expectedMax)
    // Sanity: without the clearance the natural height would exceed the ceiling.
    const naturalGeometry = resolveWikiPanelGeometry(wideViewport.width, vh, {
      wikiRouteIsGraph: false,
      wikiExpanded: false,
    })
    expect(naturalGeometry.height).toBeGreaterThan(expectedMax)
  })

  it('clamps the expanded wiki height against the supplied dockedBottomClearance and returns an explicit maxHeight', () => {
    const vh = 1080
    const clearance = 540
    const geometry = resolveWikiPanelGeometry(wideViewport.width, vh, {
      wikiRouteIsGraph: false,
      wikiExpanded: true,
    }, clearance)
    const expectedMax = Math.max(
      WIKI_PANEL_PX.routeGraphMinHeight,
      vh - APP_CHROME_PX.panelTop - clearance - APP_CHROME_PX.edgeMargin,
    )
    expect(geometry.maxHeight).toBe(expectedMax)
    expect(geometry.height).toBeLessThanOrEqual(expectedMax)
  })

  it('leaves the graph-home square untouched when a dockedBottomClearance is supplied', () => {
    const geometry = resolveWikiPanelGeometry(wideViewport.width, wideViewport.height, {
      wikiRouteIsGraph: true,
      wikiExpanded: false,
    }, 540)
    expect(geometry.width).toBe(geometry.height)
    expect(geometry.maxHeight).toBe(WIKI_PANEL_PX.routeGraphMaxHeight)
  })

  it('ignores persisted preferredWidth in the dock reservation so resizes on route X do not leak into route Y', () => {
    // Wiki on page route with a stored preferredWidth from a previous wider
    // drag. computeDockedLayout reads via resolvePreferredPanelWidth, which
    // routes wiki through resolveWikiPanelGeometry — the stored value must
    // not win.
    const state = makeState({
      openPanels: { ...CLOSED_PANELS, wiki: true },
      panelsVisible: true,
      panelPositions: {
        wiki: { x: 0, y: 0, width: 900, preferredWidth: 900, docked: true, pinned: false },
      },
      wikiRouteIsGraph: false,
      wikiExpanded: false,
    })
    const layout = computeDockedLayout(state, 1920)
    const geometry = resolveWikiPanelGeometry(1920, 1080, {
      wikiRouteIsGraph: false,
      wikiExpanded: false,
    })
    expect(layout.widths.wiki).toBe(geometry.width)
    expect(layout.widths.wiki).not.toBe(900)
  })
})

describe('selectRightClearance', () => {
  it('returns 0 when panelBottomY.right is 0', () => {
    expect(selectRightClearance(makeState({ panelBottomY: { left: 0, right: 0 } }))).toBe(0)
  })

  it('returns detail panel clearance when panelBottomY.right > 0', () => {
    expect(selectRightClearance(makeState({ panelBottomY: { left: 0, right: 100 } }))).toBe(
      APP_CHROME_PX.detailPanelWidth + APP_CHROME_PX.panelMargin,
    )
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
