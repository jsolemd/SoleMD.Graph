jest.mock('@/features/graph/lib/cosmograph-selection', () => ({
  SELECTED_POINT_INDICES_SCOPE_SQL:
    'index IN (SELECT index FROM selected_point_indices)',
  combineScopeSqlClauses: (
    ...clauses: Array<string | null | undefined>
  ): string | null => {
    const normalized = clauses
      .map((clause) => clause?.trim())
      .filter((clause): clause is string => Boolean(clause))
    if (normalized.length === 0) return null
    if (normalized.length === 1) return normalized[0]
    return normalized.map((clause) => `(${clause})`).join(' AND ')
  },
}))

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

    it('does not emit when connected select is already at the requested value', () => {
      const listener = jest.fn()
      const unsubscribe = useDashboardStore.subscribe(listener)

      useDashboardStore.getState().setConnectedSelect(false)

      expect(listener).not.toHaveBeenCalled()
      unsubscribe()
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

    it('can force a revision when table-backed scope contents changed', () => {
      const selectedSql = 'index IN (SELECT index FROM selected_point_indices)'
      useDashboardStore.getState().setCurrentPointScopeSql(selectedSql)
      const revBefore = useDashboardStore.getState().currentScopeRevision

      useDashboardStore.getState().setCurrentPointScopeSql(selectedSql, {
        forceRevision: true,
      })

      expect(useDashboardStore.getState().currentScopeRevision).toBe(revBefore + 1)
    })
  })

  describe('visibility scope clauses', () => {
    it('sets filter scope SQL without changing selected point count', () => {
      const revBefore = useDashboardStore.getState().currentScopeRevision

      useDashboardStore.getState().setVisibilityScopeClause({
        kind: 'categorical',
        sourceId: 'filter:journal',
        column: 'journal',
        value: 'Nature',
        sql: "journal = 'Nature'",
      })

      const state = useDashboardStore.getState()
      expect(state.currentPointScopeSql).toBe("journal = 'Nature'")
      expect(state.currentScopeRevision).toBe(revBefore + 1)
      expect(state.selectedPointCount).toBe(0)
      expect(state.selectedPointRevision).toBe(0)
      expect(state.visibilityScopeClauses['filter:journal']?.value).toBe('Nature')
    })

    it('ANDs active filter and timeline scope SQL', () => {
      useDashboardStore.getState().setVisibilityScopeClause({
        kind: 'categorical',
        sourceId: 'filter:journal',
        column: 'journal',
        value: 'Nature',
        sql: "journal = 'Nature'",
      })
      useDashboardStore.getState().setVisibilityScopeClause({
        kind: 'timeline',
        sourceId: 'timeline:year',
        column: 'year',
        value: [2020, 2024],
        sql: 'year BETWEEN 2020 AND 2024',
      })

      expect(useDashboardStore.getState().currentPointScopeSql).toBe(
        "(journal = 'Nature') AND (year BETWEEN 2020 AND 2024)",
      )
    })

    it('combines locked explicit selection with visibility scope', () => {
      useDashboardStore.getState().setSelectedPointCount(3)
      useDashboardStore.getState().setVisibilityScopeClause({
        kind: 'timeline',
        sourceId: 'timeline:year',
        column: 'year',
        value: [2020, 2024],
        sql: 'year BETWEEN 2020 AND 2024',
      })

      useDashboardStore.getState().lockSelection()

      expect(useDashboardStore.getState().currentPointScopeSql).toBe(
        '(index IN (SELECT index FROM selected_point_indices)) AND (year BETWEEN 2020 AND 2024)',
      )
    })

    it('clears one visibility source without clearing the others', () => {
      useDashboardStore.getState().setVisibilityScopeClause({
        kind: 'categorical',
        sourceId: 'filter:journal',
        column: 'journal',
        value: 'Nature',
        sql: "journal = 'Nature'",
      })
      useDashboardStore.getState().setVisibilityScopeClause({
        kind: 'timeline',
        sourceId: 'timeline:year',
        column: 'year',
        value: [2020, 2024],
        sql: 'year BETWEEN 2020 AND 2024',
      })

      useDashboardStore.getState().clearVisibilityScopeClause('filter:journal')

      expect(useDashboardStore.getState().currentPointScopeSql).toBe(
        'year BETWEEN 2020 AND 2024',
      )
      expect(
        useDashboardStore.getState().visibilityScopeClauses['filter:journal'],
      ).toBeUndefined()
    })

    it('clears all visibility sources', () => {
      useDashboardStore.getState().setVisibilityScopeClause({
        kind: 'categorical',
        sourceId: 'filter:journal',
        column: 'journal',
        value: 'Nature',
        sql: "journal = 'Nature'",
      })

      useDashboardStore.getState().clearVisibilityScopeClauses()

      expect(useDashboardStore.getState().currentPointScopeSql).toBeNull()
      expect(useDashboardStore.getState().visibilityScopeClauses).toEqual({})
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

    it('can force a revision when the explicit set changes but the count does not', () => {
      useDashboardStore.getState().setSelectedPointCount(10)
      const revBefore = useDashboardStore.getState().selectedPointRevision
      useDashboardStore.getState().setSelectedPointCount(10, {
        forceRevision: true,
      })
      expect(useDashboardStore.getState().selectedPointRevision).toBe(revBefore + 1)
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

    it('does not emit when unlocking an already-unlocked selection', () => {
      const listener = jest.fn()
      const unsubscribe = useDashboardStore.subscribe(listener)

      useDashboardStore.getState().unlockSelection()

      expect(listener).not.toHaveBeenCalled()
      unsubscribe()
    })
  })
})
