import type { StateCreator } from 'zustand'
import {
  SELECTED_POINT_INDICES_SCOPE_SQL,
  combineScopeSqlClauses,
  hasCurrentPointScopeSql,
  normalizeCurrentPointScopeSql,
} from '@/features/graph/lib/selection-query-state'
import type { DashboardState } from '../dashboard-store'

export type VisibilityScopeClause =
  | {
      kind: 'categorical'
      sourceId: string
      column: string
      value: string
      sql: string
    }
  | {
      kind: 'numeric' | 'timeline'
      sourceId: string
      column: string
      value: [number, number]
      sql: string
    }

function hasSameVisibilityScopeClause(
  current: VisibilityScopeClause | undefined,
  next: VisibilityScopeClause,
): boolean {
  return (
    current?.kind === next.kind &&
    current.sourceId === next.sourceId &&
    current.column === next.column &&
    current.sql === next.sql &&
    (
      typeof current.value === 'string'
        ? current.value === next.value
        : Array.isArray(next.value) &&
          current.value[0] === next.value[0] &&
          current.value[1] === next.value[1]
    )
  )
}

function resolveVisibilityScopeSql(
  clauses: Record<string, VisibilityScopeClause>,
): string | null {
  return combineScopeSqlClauses(
    ...Object.values(clauses).map((clause) => clause.sql),
  )
}

function resolveCurrentScopeSql(args: {
  visibilityScopeClauses: Record<string, VisibilityScopeClause>
  selectedPointCount: number
  selectionLocked: boolean
}): string | null {
  const visibilityScopeSql = resolveVisibilityScopeSql(args.visibilityScopeClauses)
  return args.selectionLocked && args.selectedPointCount > 0
    ? combineScopeSqlClauses(SELECTED_POINT_INDICES_SCOPE_SQL, visibilityScopeSql)
    : visibilityScopeSql
}

function omitVisibilityScopeClause(
  clauses: Record<string, VisibilityScopeClause>,
  sourceId: string,
): Record<string, VisibilityScopeClause> {
  return Object.fromEntries(
    Object.entries(clauses).filter(([key]) => key !== sourceId),
  )
}

export interface SelectionSlice {
  // Selection behavior
  /** When true, clicking a point selects it AND all connected points (via links). */
  connectedSelect: boolean

  // Crossfilter state mirrored from Cosmograph callbacks.
  // "Current" is visibility-scoped (filters, timeline, budget), not manual selection intent.
  currentPointScopeSql: string | null
  currentScopeRevision: number
  selectedPointCount: number
  selectedPointRevision: number
  activeSelectionSourceId: string | null
  selectionLocked: boolean
  visibilityScopeClauses: Record<string, VisibilityScopeClause>

  // Actions
  setConnectedSelect: (on: boolean) => void
  toggleConnectedSelect: () => void
  setCurrentPointScopeSql: (
    sql: string | null,
    options?: { forceRevision?: boolean },
  ) => void
  setSelectedPointCount: (
    count: number,
    options?: { forceRevision?: boolean },
  ) => void
  setActiveSelectionSourceId: (sourceId: string | null) => void
  setVisibilityScopeClause: (clause: VisibilityScopeClause) => void
  clearVisibilityScopeClause: (sourceId: string) => void
  clearVisibilityScopeClauses: () => void
  lockSelection: () => void
  unlockSelection: () => void
}

export const createSelectionSlice: StateCreator<DashboardState, [], [], SelectionSlice> = (set) => ({
  connectedSelect: false,
  currentPointScopeSql: null,
  currentScopeRevision: 0,
  selectedPointCount: 0,
  selectedPointRevision: 0,
  activeSelectionSourceId: null,
  selectionLocked: false,
  visibilityScopeClauses: {},

  setConnectedSelect: (on) => set((s) => (
    s.connectedSelect === on ? s : { connectedSelect: on }
  )),
  toggleConnectedSelect: () => set((s) => ({ connectedSelect: !s.connectedSelect })),
  setCurrentPointScopeSql: (sql, options) => set((state) => {
    const next = normalizeCurrentPointScopeSql(sql)
    return state.currentPointScopeSql === next && !options?.forceRevision
      ? state
      : {
          currentPointScopeSql: next,
          currentScopeRevision: state.currentScopeRevision + 1,
        }
  }),
  setSelectedPointCount: (count, options) => set((state) => {
    const normalized = Math.max(0, Math.floor(count))
    return state.selectedPointCount === normalized && !options?.forceRevision
      ? state
      : {
          selectedPointCount: normalized,
          selectedPointRevision: state.selectedPointRevision + 1,
          currentPointScopeSql: state.selectionLocked
            ? resolveCurrentScopeSql({
                visibilityScopeClauses: state.visibilityScopeClauses,
                selectedPointCount: normalized,
                selectionLocked: state.selectionLocked,
              })
            : state.currentPointScopeSql,
        }
  }),
  setActiveSelectionSourceId: (sourceId) => set((state) => (
    state.activeSelectionSourceId === sourceId
      ? state
      : { activeSelectionSourceId: sourceId }
  )),
  setVisibilityScopeClause: (clause) => set((state) => {
    const sql = normalizeCurrentPointScopeSql(clause.sql)
    if (!sql) {
      if (!(clause.sourceId in state.visibilityScopeClauses)) return state
      const nextClauses = omitVisibilityScopeClause(
        state.visibilityScopeClauses,
        clause.sourceId,
      )
      return {
        visibilityScopeClauses: nextClauses,
        currentPointScopeSql: resolveCurrentScopeSql({
          visibilityScopeClauses: nextClauses,
          selectedPointCount: state.selectedPointCount,
          selectionLocked: state.selectionLocked,
        }),
        currentScopeRevision: state.currentScopeRevision + 1,
      }
    }

    const nextClause = { ...clause, sql } satisfies VisibilityScopeClause
    if (
      hasSameVisibilityScopeClause(
        state.visibilityScopeClauses[clause.sourceId],
        nextClause,
      )
    ) {
      return state
    }

    const nextClauses = {
      ...state.visibilityScopeClauses,
      [clause.sourceId]: nextClause,
    }
    return {
      visibilityScopeClauses: nextClauses,
      currentPointScopeSql: resolveCurrentScopeSql({
        visibilityScopeClauses: nextClauses,
        selectedPointCount: state.selectedPointCount,
        selectionLocked: state.selectionLocked,
      }),
      currentScopeRevision: state.currentScopeRevision + 1,
    }
  }),
  clearVisibilityScopeClause: (sourceId) => set((state) => {
    if (!(sourceId in state.visibilityScopeClauses)) return state
    const nextClauses = omitVisibilityScopeClause(
      state.visibilityScopeClauses,
      sourceId,
    )
    return {
      visibilityScopeClauses: nextClauses,
      currentPointScopeSql: resolveCurrentScopeSql({
        visibilityScopeClauses: nextClauses,
        selectedPointCount: state.selectedPointCount,
        selectionLocked: state.selectionLocked,
      }),
      currentScopeRevision: state.currentScopeRevision + 1,
    }
  }),
  clearVisibilityScopeClauses: () => set((state) => {
    if (Object.keys(state.visibilityScopeClauses).length === 0) return state
    return {
      visibilityScopeClauses: {},
      currentPointScopeSql: resolveCurrentScopeSql({
        visibilityScopeClauses: {},
        selectedPointCount: state.selectedPointCount,
        selectionLocked: state.selectionLocked,
      }),
      currentScopeRevision: state.currentScopeRevision + 1,
    }
  }),
  lockSelection: () => set((s) => {
    if (s.selectedPointCount === 0 && !hasCurrentPointScopeSql(s.currentPointScopeSql)) {
      return s
    }

    return s.selectionLocked
      ? s
      : {
          selectionLocked: true,
          currentPointScopeSql: resolveCurrentScopeSql({
            visibilityScopeClauses: s.visibilityScopeClauses,
            selectedPointCount: s.selectedPointCount,
            selectionLocked: true,
          }) ?? s.currentPointScopeSql,
        }
  }),
  unlockSelection: () => set((s) => (
    s.selectionLocked
      ? {
          selectionLocked: false,
          currentPointScopeSql: resolveCurrentScopeSql({
            visibilityScopeClauses: s.visibilityScopeClauses,
            selectedPointCount: s.selectedPointCount,
            selectionLocked: false,
          }),
        }
      : s
  )),
})
