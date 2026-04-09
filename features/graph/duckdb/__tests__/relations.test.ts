import type { GraphBundle } from '@/features/graph/types'

import { resolveBundleRelations } from '../views/relations'

function createBundle(): GraphBundle {
  return {
    assetBaseUrl: '',
    bundleBytes: 0,
    bundleChecksum: 'bundle-checksum',
    bundleFormat: 'parquet-manifest',
    bundleManifest: {
      bundleFormat: 'parquet-manifest',
      bundleProfile: 'full',
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
        paper_documents: {
          bytes: 0,
          columns: [],
          parquetFile: 'paper_documents.parquet',
          rowCount: 1,
          schema: [],
          sha256: 'sha',
        },
        universe_points: {
          bytes: 0,
          columns: [
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
          ],
          parquetFile: 'universe_points.parquet',
          rowCount: 1,
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
      paper_documents: 'https://example.test/paper_documents.parquet',
      universe_points: 'https://example.test/universe_points.parquet',
    },
  }
}

describe('resolveBundleRelations', () => {
  it('materializes optional universe points into a local temp table', async () => {
    const query = jest.fn(async () => undefined)

    await resolveBundleRelations({ query } as never, createBundle(), [
      'universe_points',
      'universe_points',
    ])

    expect(query).toHaveBeenCalledTimes(1)
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('CREATE TEMP TABLE IF NOT EXISTS universe_points AS')
    )
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining(
        "FROM read_parquet('https://example.test/universe_points.parquet')"
      )
    )
  })

  it('keeps non-hot optional bundle relations as lazy views', async () => {
    const query = jest.fn(async () => undefined)

    await resolveBundleRelations({ query } as never, createBundle(), [
      'paper_documents',
    ])

    expect(query).toHaveBeenCalledTimes(1)
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('CREATE OR REPLACE VIEW paper_documents AS')
    )
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining(
        "read_parquet('https://example.test/paper_documents.parquet')"
      )
    )
  })
})
