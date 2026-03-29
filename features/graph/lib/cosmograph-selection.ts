import type { ClauseSource, Selection, SelectionClause } from '@uwdata/mosaic-core'
import { and, duckDBCodeGenerator, eq, isBetween, or } from '@uwdata/mosaic-sql'
import type { VisibilityFocus } from '@/features/graph/stores/slices/visibility-slice'

const VISIBILITY_SOURCE_PREFIXES = ["filter:", "timeline:", "budget:"] as const
const BUDGET_SCOPE_SOURCE_PREFIXES = ["filter:", "timeline:"] as const

export const BUDGET_FOCUS_SOURCE_ID = 'budget:focus-cluster'

export function isVisibilitySelectionSourceId(
  sourceId: string | null | undefined,
): boolean {
  if (!sourceId) {
    return false
  }

  return VISIBILITY_SOURCE_PREFIXES.some((prefix) => sourceId.startsWith(prefix))
}

export interface SelectionSource extends ClauseSource {
  id: string
}

export function getSelectionSourceId(
  source: ClauseSource | { id?: unknown } | null | undefined,
): string | null {
  if (
    typeof source !== 'object' ||
    source === null ||
    !('id' in source) ||
    typeof source.id !== 'string'
  ) {
    return null
  }

  return source.id
}

export function isBudgetScopeSelectionSourceId(
  sourceId: string | null | undefined,
): boolean {
  if (!sourceId) {
    return false
  }

  return BUDGET_SCOPE_SOURCE_PREFIXES.some((prefix) => sourceId.startsWith(prefix))
}

export function createSelectionSource(id: string): SelectionSource {
  return { id }
}

export function clearSelectionClause(
  selection: Selection | null | undefined,
  source: ClauseSource,
): void {
  if (!selection) {
    return
  }

  selection.update({
    source,
    value: null,
    predicate: null,
    meta: { type: 'point' },
  })
}

export function buildVisibilityFocusClause(
  source: ClauseSource,
  focus: VisibilityFocus,
): SelectionClause {
  const predicates: NonNullable<SelectionClause['predicate']>[] = [
    eq('index', focus.seedIndex),
  ]

  if (focus.includeCluster && focus.clusterId != null && focus.clusterId > 0) {
    predicates.push(eq('clusterId', focus.clusterId))
  }

  if (
    focus.xMin != null &&
    focus.xMax != null &&
    focus.yMin != null &&
    focus.yMax != null
  ) {
    predicates.push(
      and(
        isBetween('x', [focus.xMin, focus.xMax]),
        isBetween('y', [focus.yMin, focus.yMax]),
      ),
    )
  }

  const predicate =
    predicates.length === 1 ? predicates[0] : or(...predicates)

  return {
    source,
    value: focus,
    predicate,
    meta: { type: 'point' },
  }
}

export function buildBudgetScopeSql(
  selection: Selection | null | undefined,
): string | null {
  return buildSelectionScopeSql(selection, (clause) =>
    isBudgetScopeSelectionSourceId(getSelectionSourceId(clause.source)),
  )
}

export function buildVisibilityScopeSql(
  selection: Selection | null | undefined,
): string | null {
  return buildSelectionScopeSql(selection, (clause) =>
    isVisibilitySelectionSourceId(getSelectionSourceId(clause.source)),
  )
}

export function buildVisibilityScopeSqlExcludingSource(
  selection: Selection | null | undefined,
  excludedSourceId: string,
): string | null {
  return buildSelectionScopeSql(selection, (clause) => {
    const sourceId = getSelectionSourceId(clause.source)
    return (
      sourceId !== null &&
      sourceId !== excludedSourceId &&
      isVisibilitySelectionSourceId(sourceId)
    )
  })
}

export function buildIntentSelectionScopeSql(
  selection: Selection | null | undefined,
): string | null {
  return buildSelectionScopeSql(selection, (clause) => {
    const sourceId = getSelectionSourceId(clause.source)
    return sourceId !== null && !isVisibilitySelectionSourceId(sourceId)
  })
}

function buildSelectionScopeSql(
  selection: Selection | null | undefined,
  shouldIncludeClause: (clause: SelectionClause) => boolean,
): string | null {
  if (!selection) {
    return null
  }

  const predicates = selection.clauses
    .filter((clause) => shouldIncludeClause(clause))
    .map((clause) => clause.predicate)
    .filter((predicate): predicate is NonNullable<SelectionClause['predicate']> => predicate != null)

  if (predicates.length === 0) {
    return null
  }

  const expression = predicates.length === 1 ? predicates[0] : and(...predicates)
  return duckDBCodeGenerator.toString(expression)
}

export function hasBudgetScopeClauses(
  selection: Selection | null | undefined,
): boolean {
  if (!selection) {
    return false
  }

  return selection.clauses.some((clause) =>
    isBudgetScopeSelectionSourceId(getSelectionSourceId(clause.source)),
  )
}

export function getSelectionValueForSource<T>(
  selection: Selection | null | undefined,
  sourceId: string,
): T | null {
  if (!selection) {
    return null
  }

  const clause = selection.clauses.find(
    (candidate) => getSelectionSourceId(candidate.source) === sourceId,
  )

  return (clause?.value as T | undefined) ?? null
}

export function buildCategoricalFilterClause(
  source: ClauseSource,
  column: string,
  value: string,
): SelectionClause {
  return {
    source,
    value,
    predicate: eq(column, value),
    meta: { type: 'point' },
  }
}

export function buildNumericRangeFilterClause(
  source: ClauseSource,
  column: string,
  range: [number, number],
): SelectionClause {
  return {
    source,
    value: range,
    predicate: isBetween(column, range),
    meta: { type: 'point' },
  }
}
