import type { ClauseSource, Selection, SelectionClause } from '@uwdata/mosaic-core'
import {
  and,
  column as sqlColumn,
  duckDBCodeGenerator,
  eq,
  isBetween,
  isNull,
  literal,
  or,
  sql,
} from '@uwdata/mosaic-sql'
import { getColumnMeta } from '@/features/graph/lib/columns'
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

export function matchesSelectionSourceId(
  actualSourceId: string | null | undefined,
  expectedSourceId: string | null | undefined,
): boolean {
  if (!actualSourceId || !expectedSourceId) {
    return false
  }

  return (
    actualSourceId === expectedSourceId ||
    actualSourceId.startsWith(`${expectedSourceId}-`)
  )
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

  const sourceId = getSelectionSourceId(source)
  if (sourceId) {
    const matchingClauses = selection.clauses.filter((clause) =>
      matchesSelectionSourceId(getSelectionSourceId(clause.source), sourceId)
    )

    if (matchingClauses.length > 0) {
      for (const clause of matchingClauses) {
        if (typeof clause.source?.reset === 'function') {
          clause.source.reset()
        } else {
          selection.update({
            source: clause.source,
            value: null,
            predicate: null,
            meta: { type: 'point' },
          })
        }
      }
      return
    }
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
      !matchesSelectionSourceId(sourceId, excludedSourceId) &&
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
    (candidate) =>
      matchesSelectionSourceId(getSelectionSourceId(candidate.source), sourceId),
  )

  if (!clause) {
    return null
  }

  const resolvedValue = resolveSelectionValue(clause)
  return (resolvedValue as T | undefined) ?? null
}

function resolveSelectionValue(clause: SelectionClause): unknown {
  if (clause.value == null) {
    return null
  }

  if (typeof clause.value !== 'object') {
    return clause.value
  }

  const predicate = clause.predicate
  if (!predicate || typeof predicate !== 'object' || !('type' in predicate)) {
    return clause.value
  }

  if (predicate.type === 'BETWEEN' && 'extent' in predicate) {
    const extent = predicate.extent
    if (Array.isArray(extent) && extent.length === 2) {
      const left = extractLiteralValue(extent[0])
      const right = extractLiteralValue(extent[1])
      if (left != null && right != null) {
        return [left, right]
      }
    }
  }

  if (predicate.type === 'BINARY' && 'op' in predicate && predicate.op === '=') {
    return 'right' in predicate ? extractLiteralValue(predicate.right) : clause.value
  }

  return clause.value
}

function extractLiteralValue(node: unknown): unknown {
  if (typeof node !== 'object' || node === null || !('type' in node)) {
    return null
  }

  if (node.type !== 'LITERAL' || !('value' in node)) {
    return null
  }

  return node.value
}

export function buildCategoricalFilterClause(
  source: ClauseSource,
  column: string,
  value: string,
): SelectionClause {
  const columnMeta = getColumnMeta(column)
  const predicate =
    value === 'null'
      ? isNull(column)
      : columnMeta?.isMultiValue
        ? sql`list_contains(string_split_regex(CAST(${sqlColumn(column)} AS VARCHAR), '\\s*,\\s*'), ${literal(value)})`
        : eq(column, literal(value))

  return {
    source,
    value,
    predicate,
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
