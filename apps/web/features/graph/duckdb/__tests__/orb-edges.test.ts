import { queryRows } from '../queries/core'
import {
  buildOrbClusterChordSql,
  queryOrbClusterChords,
} from '../queries/orb-edges'

jest.mock('../queries/core', () => ({
  queryRows: jest.fn(),
}))

const queryRowsMock = jest.mocked(queryRows)

describe('buildOrbClusterChordSql', () => {
  it('aggregates inter-cluster citation and entity edges in SQL', () => {
    const sql = buildOrbClusterChordSql({
      activeLayer: 'corpus',
      currentPointScopeSql: 'year >= 2020',
    })

    expect(sql).toContain('FROM active_links_web')
    expect(sql).toContain('FROM orb_entity_edges_current')
    expect(sql).toContain('WHERE year >= 2020')
    expect(sql).toContain('LEAST(src.clusterId, dst.clusterId)')
    expect(sql).toContain('GREATEST(src.clusterId, dst.clusterId)')
    expect(sql).toContain('GROUP BY sourceClusterId, targetClusterId')
    expect(sql).toContain('JOIN release_cluster_centroids source_centroid')
  })

  it('can restrict aggregation to entity edges without querying citations', () => {
    const sql = buildOrbClusterChordSql({
      activeLayer: 'corpus',
      currentPointScopeSql: null,
      sources: ['entity'],
      limit: 12,
    })

    expect(sql).not.toContain('FROM active_links_web')
    expect(sql).toContain('FROM orb_entity_edges_current')
    expect(sql).toContain('LIMIT 12')
  })
})

describe('queryOrbClusterChords', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns an empty chord buffer when cluster centroids are not registered', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
    queryRowsMock.mockRejectedValueOnce(
      new Error('Catalog Error: Table with name release_cluster_centroids does not exist'),
    )

    await expect(
      queryOrbClusterChords({} as never, {
        activeLayer: 'corpus',
        currentPointScopeSql: null,
      }),
    ).resolves.toEqual([])

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('release_cluster_centroids'),
    )
    warnSpy.mockRestore()
  })
})
