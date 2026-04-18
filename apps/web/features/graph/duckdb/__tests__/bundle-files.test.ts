import { DuckDBDataProtocol } from '@duckdb/duckdb-wasm'

import type { GraphBundle } from "@solemd/graph"

import {
  getRegisteredBundleTableFileName,
  registerBundleTableFiles,
} from '../bundle-files'

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
          columns: [],
          parquetFile: 'base_clusters.parquet',
          rowCount: 1,
          schema: [],
          sha256: 'sha-clusters',
        },
        base_points: {
          bytes: 0,
          columns: [],
          parquetFile: 'base_points.parquet',
          rowCount: 1,
          schema: [],
          sha256: 'sha-points',
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

describe('bundle file registration', () => {
  it('builds stable logical file names per bundle asset', () => {
    expect(getRegisteredBundleTableFileName(createBundle(), 'base_points')).toBe(
      'graph-bundles/bundle-checksum/base_points.parquet'
    )
  })

  it('registers each bundle table URL once on the DuckDB instance', async () => {
    const registerFileURL = jest.fn(async () => undefined)

    await registerBundleTableFiles(
      {
        registerFileURL,
      } as never,
      createBundle()
    )

    expect(registerFileURL).toHaveBeenCalledTimes(2)
    expect(registerFileURL).toHaveBeenNthCalledWith(
      1,
      'graph-bundles/bundle-checksum/base_clusters.parquet',
      'https://example.test/base_clusters.parquet',
      DuckDBDataProtocol.HTTP,
      false
    )
    expect(registerFileURL).toHaveBeenNthCalledWith(
      2,
      'graph-bundles/bundle-checksum/base_points.parquet',
      'https://example.test/base_points.parquet',
      DuckDBDataProtocol.HTTP,
      false
    )
  })
})
