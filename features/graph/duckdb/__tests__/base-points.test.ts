import type { GraphBundle } from '@/features/graph/types'

import {
  createPointCanvasProjectionSql,
  createPointQueryProjectionSql,
} from '../views/base-points'

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
  'cluster_probability',
  'title',
  'citekey',
  'journal',
  'year',
  'display_label',
  'semantic_groups_csv',
  'organ_systems_csv',
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
    tableUrls: {},
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
    expect(querySql).toContain('organSystems')
    expect(querySql).toContain('semanticGroups')
    expect(querySql).toContain('relationCategories')
    expect(querySql).toContain('textAvailability')
    expect(querySql).toContain('baseRank')
  })
})
