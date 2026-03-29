jest.mock('@uwdata/mosaic-sql', () => ({
  and: (...parts: unknown[]) => ({ op: 'and', parts }),
  duckDBCodeGenerator: {
    toString: (expr: unknown) => JSON.stringify(expr),
  },
  eq: (column: string, value: unknown) => ({ op: 'eq', column, value }),
  isBetween: (column: string, range: [number, number]) => ({ op: 'between', column, range }),
  or: (...parts: unknown[]) => ({ op: 'or', parts }),
}))

import {
  buildBudgetScopeSql,
  buildVisibilityFocusClause,
  buildVisibilityScopeSql,
  createSelectionSource,
  isVisibilitySelectionSourceId,
} from '../cosmograph-selection'

describe('visibility scope helpers', () => {
  it('treats filter clauses as visibility sources and emits scope SQL', () => {
    const source = createSelectionSource('filter:journal')
    const selection = {
      clauses: [
        {
          source,
          value: 'Neurology',
          predicate: { op: 'eq', column: 'journal', value: 'Neurology' },
          meta: { type: 'point' as const },
        },
      ],
    }

    expect(isVisibilitySelectionSourceId('filter:journal')).toBe(true)
    expect(buildVisibilityScopeSql(selection as never)).toContain('"column":"journal"')
  })

  it('restricts budget scope SQL to filter and timeline clauses', () => {
    const selection = {
      clauses: [
        {
          source: createSelectionSource('filter:journal'),
          value: 'Neurology',
          predicate: { op: 'eq', column: 'journal', value: 'Neurology' },
          meta: { type: 'point' as const },
        },
        {
          source: createSelectionSource('budget:focus-cluster'),
          value: null,
          predicate: { op: 'eq', column: 'clusterId', value: 42 },
          meta: { type: 'point' as const },
        },
      ],
    }

    const sql = buildBudgetScopeSql(selection as never)
    expect(sql).toContain('"column":"journal"')
    expect(sql).not.toContain('"column":"clusterId"')
  })

  it('builds a focus clause from cluster and bounding box constraints', () => {
    const clause = buildVisibilityFocusClause(createSelectionSource('budget:focus-cluster'), {
      layer: 'chunk',
      seedIndex: 11,
      clusterId: 7,
      includeCluster: true,
      xMin: 1,
      xMax: 2,
      yMin: 3,
      yMax: 4,
    })

    expect(clause).toMatchObject({
      meta: { type: 'point' },
      source: { id: 'budget:focus-cluster' },
    })
    expect(JSON.stringify(clause.predicate)).toContain('"column":"clusterId"')
    expect(JSON.stringify(clause.predicate)).toContain('"column":"x"')
    expect(JSON.stringify(clause.predicate)).toContain('"column":"y"')
  })
})
