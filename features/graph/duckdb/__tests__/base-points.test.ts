import type { GraphBundle } from '@/features/graph/types'

import {
  BASE_POINT_QUERY_RUNTIME_SOURCE_TABLE,
  LOCAL_POINT_RUNTIME_COLUMNS,
  createPointCanvasProjectionSql,
  createPointQueryProjectionSql,
  registerBasePointQueryViews,
  registerBasePointsView,
} from '../views/base-points'
import {
  BASE_CLUSTER_RUNTIME_SOURCE_TABLE,
  LOCAL_CLUSTER_RUNTIME_COLUMNS,
} from '../views/clusters'
import { materializeBundleParquetTables } from '../views/relations'

const REQUIRED_COLUMNS = [
  'point_index',
  'id',
  'paper_id',
  'hex_color',
  'hex_color_light',
  'x',
  'y',
  'cluster_id',
  'cluster_label',
  'title',
  'citekey',
  'journal',
  'year',
  'display_label',
  'semantic_groups_csv',
  'relation_categories_csv',
  'text_availability',
  'is_in_base',
  'base_rank',
  'paper_author_count',
  'paper_reference_count',
  'paper_entity_count',
  'paper_relation_count',
] as const

function createBundle(): GraphBundle {
  return {
    assetBaseUrl: '',
    bundleBytes: 0,
    bundleChecksum: 'bundle-checksum',
    bundleFormat: 'parquet-manifest',
    bundleManifest: {
      bundleFormat: 'parquet-manifest',
      bundleProfile: 'base',
      bundleVersion: '1',
      contract: {
        artifactSets: {
          base: [],
          universe: [],
          evidence: [],
        },
        files: {},
      },
      createdAt: null,
      duckdbFile: null,
      graphName: 'cosmograph',
      graphRunId: 'run-id',
      nodeKind: 'corpus',
      tables: {
        base_clusters: {
          bytes: 0,
          columns: [...LOCAL_CLUSTER_RUNTIME_COLUMNS],
          parquetFile: 'base_clusters.parquet',
          rowCount: 0,
          schema: [],
          sha256: 'sha-clusters',
        },
        base_points: {
          bytes: 0,
          columns: [...REQUIRED_COLUMNS],
          parquetFile: 'base_points.parquet',
          rowCount: 0,
          schema: [],
          sha256: 'sha',
        },
      },
    },
    bundleUri: '',
    bundleVersion: '1',
    graphName: 'cosmograph',
    manifestUrl: '',
    nodeKind: 'corpus',
    qaSummary: null,
    runId: 'run-id',
    tableUrls: {
      base_clusters: 'https://example.test/base_clusters.parquet',
      base_points: 'https://example.test/base_points.parquet',
    },
  }
}

describe('base point projections', () => {
  it('keeps query-only facet fields out of the canvas projection', () => {
    const bundle = createBundle()

    const canvasSql = createPointCanvasProjectionSql(bundle)('base_points', 'point_index')
    const querySql = createPointQueryProjectionSql(bundle)('base_points', 'point_index')

    expect(canvasSql).not.toContain('organSystems')
    expect(canvasSql).not.toContain('semanticGroups')
    expect(canvasSql).not.toContain('relationCategories')
    expect(canvasSql).not.toContain('textAvailability')
    expect(canvasSql).not.toContain('baseRank')
    expect(canvasSql).not.toContain('AS resolvedClusterLabel')
    expect(querySql).toContain('semanticGroups')
    expect(querySql).toContain('relationCategories')
    expect(querySql).toContain('textAvailability')
    expect(querySql).toContain('baseRank')
    expect(querySql).not.toContain('AS resolvedClusterLabel')
  })

  it('projects a canonical clusterLabel with fallback text for labeled clusters only', () => {
    const bundle = createBundle()

    const canvasSql = createPointCanvasProjectionSql(bundle)('base_points', 'point_index')
    const querySql = createPointQueryProjectionSql(bundle)('base_points', 'point_index')

    expect(canvasSql).toContain('CASE')
    expect(canvasSql).toContain("WHEN COALESCE(cluster_id, 0) > 0")
    expect(canvasSql).toContain("NULLIF(cluster_label, '')")
    expect(canvasSql).toContain("AS clusterLabel")
    expect(querySql).toContain('CASE')
    expect(querySql).toContain("WHEN COALESCE(cluster_id, 0) > 0")
    expect(querySql).toContain("NULLIF(cluster_label, '')")
    expect(querySql).toContain("AS clusterLabel")
  })

  it('builds the public base point views from the canonical bundle relation by default', async () => {
    const query = jest.fn(async () => undefined)

    await registerBasePointsView(
      {
        query,
      } as never,
      {
        buildPointCanvasProjectionSql: (sourceTable, indexSql) =>
          `SELECT ${indexSql} AS index FROM ${sourceTable}`,
        buildPointQueryProjectionSql: (sourceTable, indexSql) =>
          `SELECT ${indexSql} AS index FROM ${sourceTable}`,
      }
    )

    expect(query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('FROM base_points')
    )
    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('FROM base_points')
    )
  })

  it('can switch the query views to the local interactive runtime table', async () => {
    const query = jest.fn(async () => undefined)

    await registerBasePointQueryViews(
      {
        query,
      } as never,
      {
        sourceTable: BASE_POINT_QUERY_RUNTIME_SOURCE_TABLE,
        buildPointQueryProjectionSql: (sourceTable, indexSql) =>
          `SELECT ${indexSql} AS index FROM ${sourceTable}`,
      }
    )

    expect(query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining(`FROM ${BASE_POINT_QUERY_RUNTIME_SOURCE_TABLE}`)
    )
  })

  it('materializes the interactive base parquet sources into local temp tables once per session', async () => {
    const query = jest.fn(async () => undefined)

    await materializeBundleParquetTables(
      {
        query,
      } as never,
      createBundle(),
      [
        {
          tableName: 'base_points',
          runtimeTableName: BASE_POINT_QUERY_RUNTIME_SOURCE_TABLE,
          selectedColumns: LOCAL_POINT_RUNTIME_COLUMNS,
        },
        {
          tableName: 'base_clusters',
          runtimeTableName: BASE_CLUSTER_RUNTIME_SOURCE_TABLE,
          selectedColumns: LOCAL_CLUSTER_RUNTIME_COLUMNS,
        },
      ]
    )

    expect(query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining(`CREATE TEMP TABLE IF NOT EXISTS ${BASE_POINT_QUERY_RUNTIME_SOURCE_TABLE} AS`)
    )
    expect(query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining(
        `SELECT ${LOCAL_POINT_RUNTIME_COLUMNS.join(', ')}`
      )
    )
    expect(query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("FROM read_parquet('https://example.test/base_points.parquet')")
    )
    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining(`CREATE TEMP TABLE IF NOT EXISTS ${BASE_CLUSTER_RUNTIME_SOURCE_TABLE} AS`)
    )
    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining(
        `SELECT ${LOCAL_CLUSTER_RUNTIME_COLUMNS.join(', ')}`
      )
    )
  })
})
