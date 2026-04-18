import { LOCAL_POINT_RUNTIME_COLUMNS } from '../views/base-points'
import { registerInitialSessionViews } from '../views/register-all'

jest.mock('../views/relations', () => ({
  resolveBundleRelations: jest.fn(async () => undefined),
}))

describe('registerInitialSessionViews', () => {
  it('keeps query views bound to the canonical local tables without duplicating runtime copies', async () => {
    const query = jest.fn(async () => undefined)

    await registerInitialSessionViews(
      { query } as never,
      {
        bundleManifest: {
          contract: {
            artifactSets: {
              base: ['base_points', 'base_clusters'],
            },
          },
          tables: {
            base_points: {
              rowCount: 1,
              columns: LOCAL_POINT_RUNTIME_COLUMNS.map((name) => name.toUpperCase()),
            },
            base_clusters: { rowCount: 1 },
          },
        },
      } as never,
      ['base_points', 'base_clusters']
    )

    const executedSql = query.mock.calls.map(([sql]) => String(sql))
    expect(executedSql.some((sql) => sql.includes('base_points_query_runtime'))).toBe(false)
    expect(executedSql.some((sql) => sql.includes('base_clusters_runtime'))).toBe(false)
    expect(executedSql.some((sql) => sql.includes('FROM base_points'))).toBe(true)
    expect(executedSql.some((sql) => sql.includes('FROM base_clusters'))).toBe(true)
  })
})
