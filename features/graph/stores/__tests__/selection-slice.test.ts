import { useDashboardStore } from '../dashboard-store'

type DashboardState = ReturnType<typeof useDashboardStore.getState>

function resetStore(overrides: Partial<DashboardState> = {}) {
  useDashboardStore.setState({
    ...useDashboardStore.getInitialState(),
    ...overrides,
  })
}

beforeEach(() => resetStore())

describe('selection-slice', () => {
  describe('toggleConnectedSelect', () => {
    it('toggles connected select on/off', () => {
      expect(useDashboardStore.getState().connectedSelect).toBe(false)
      useDashboardStore.getState().toggleConnectedSelect()
      expect(useDashboardStore.getState().connectedSelect).toBe(true)
      useDashboardStore.getState().toggleConnectedSelect()
      expect(useDashboardStore.getState().connectedSelect).toBe(false)
    })
  })

  describe('setCurrentPointScopeSql', () => {
    it('sets non-empty SQL and increments revision', () => {
      const revBefore = useDashboardStore.getState().currentScopeRevision
      useDashboardStore.getState().setCurrentPointScopeSql('year > 2020')
      const s = useDashboardStore.getState()
      expect(s.currentPointScopeSql).toBe('year > 2020')
      expect(s.currentScopeRevision).toBe(revBefore + 1)
    })

    it('normalizes whitespace-only SQL to null', () => {
      useDashboardStore.getState().setCurrentPointScopeSql('   ')
      expect(useDashboardStore.getState().currentPointScopeSql).toBeNull()
    })

    it('does not increment revision when value unchanged', () => {
      useDashboardStore.getState().setCurrentPointScopeSql('year > 2020')
      const revBefore = useDashboardStore.getState().currentScopeRevision
      useDashboardStore.getState().setCurrentPointScopeSql('year > 2020')
      expect(useDashboardStore.getState().currentScopeRevision).toBe(revBefore)
    })
  })

  describe('setSelectedPointCount', () => {
    it('normalizes to non-negative integer', () => {
      useDashboardStore.getState().setSelectedPointCount(-5)
      expect(useDashboardStore.getState().selectedPointCount).toBe(0)
    })

    it('floors fractional counts', () => {
      useDashboardStore.getState().setSelectedPointCount(3.7)
      expect(useDashboardStore.getState().selectedPointCount).toBe(3)
    })

    it('increments revision on change', () => {
      const revBefore = useDashboardStore.getState().selectedPointRevision
      useDashboardStore.getState().setSelectedPointCount(10)
      expect(useDashboardStore.getState().selectedPointRevision).toBe(revBefore + 1)
    })

    it('does not increment revision when count unchanged', () => {
      useDashboardStore.getState().setSelectedPointCount(10)
      const revBefore = useDashboardStore.getState().selectedPointRevision
      useDashboardStore.getState().setSelectedPointCount(10)
      expect(useDashboardStore.getState().selectedPointRevision).toBe(revBefore)
    })
  })

  describe('lockSelection / unlockSelection', () => {
    it('locks when there are selected points', () => {
      resetStore({ selectedPointCount: 5 })
      useDashboardStore.getState().lockSelection()
      expect(useDashboardStore.getState().selectionLocked).toBe(true)
    })

    it('locks when there is a scope SQL even with 0 selected points', () => {
      resetStore({ selectedPointCount: 0, currentPointScopeSql: 'year > 2020' })
      useDashboardStore.getState().lockSelection()
      expect(useDashboardStore.getState().selectionLocked).toBe(true)
    })

    it('does not lock when no selected points and no scope SQL', () => {
      resetStore({ selectedPointCount: 0, currentPointScopeSql: null })
      useDashboardStore.getState().lockSelection()
      expect(useDashboardStore.getState().selectionLocked).toBe(false)
    })

    it('does not lock when scope SQL is whitespace-only', () => {
      resetStore({ selectedPointCount: 0, currentPointScopeSql: '   ' })
      useDashboardStore.getState().lockSelection()
      expect(useDashboardStore.getState().selectionLocked).toBe(false)
    })

    it('unlockSelection clears lock', () => {
      resetStore({ selectionLocked: true })
      useDashboardStore.getState().unlockSelection()
      expect(useDashboardStore.getState().selectionLocked).toBe(false)
    })
  })
})
