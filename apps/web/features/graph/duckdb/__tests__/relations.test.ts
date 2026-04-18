import type { GraphBundle } from "@solemd/graph"

import { getRegisteredBundleTableFileName } from '../bundle-files'
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
        base_clusters: {
          bytes: 0,
          columns: [
            'cluster_id',
            'label',
            'label_mode',
            'member_count',
            'centroid_x',
            'centroid_y',
            'representative_node_id',
            'label_source',
            'candidate_count',
            'mean_cluster_probability',
            'mean_outlier_score',
            'paper_count',
            'is_noise',
            'description',
          ],
          parquetFile: 'base_clusters.parquet',
          rowCount: 1,
          schema: [],
          sha256: 'sha',
        },
        base_points: {
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
          parquetFile: 'base_points.parquet',
          rowCount: 1,
          schema: [],
          sha256: 'sha',
        },
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
      base_clusters: 'https://example.test/base_clusters.parquet',
      base_points: 'https://example.test/base_points.parquet',
      paper_documents: 'https://example.test/paper_documents.parquet',
      universe_points: 'https://example.test/universe_points.parquet',
    },
  }
}

describe('resolveBundleRelations', () => {
  it('materializes the hot base bundle tables into persistent local runtime tables during bootstrap', async () => {
    const query = jest.fn(async () => undefined)

    await resolveBundleRelations({ query } as never, createBundle(), [
      'base_points',
      'base_clusters',
    ])

    expect(query).toHaveBeenCalledTimes(2)
    expect(query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('CREATE TABLE IF NOT EXISTS base_points AS')
    )
    expect(query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining(
        `FROM read_parquet('${getRegisteredBundleTableFileName(createBundle(), 'base_points')}')`
      )
    )
    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('CREATE TABLE IF NOT EXISTS base_clusters AS')
    )
    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining(
        `FROM read_parquet('${getRegisteredBundleTableFileName(createBundle(), 'base_clusters')}')`
      )
    )
  })

  it('keeps optional universe points parquet-backed instead of hydrating the full table locally', async () => {
    const query = jest.fn(async () => undefined)

    await resolveBundleRelations({ query } as never, createBundle(), [
      'universe_points',
      'universe_points',
    ])

    expect(query).toHaveBeenCalledTimes(1)
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('CREATE OR REPLACE VIEW universe_points AS')
    )
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining(
        `FROM read_parquet('${getRegisteredBundleTableFileName(createBundle(), 'universe_points')}')`
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
        `read_parquet('${getRegisteredBundleTableFileName(createBundle(), 'paper_documents')}')`
      )
    )
  })
})
