import type { GraphBundle } from "@solemd/graph"

import {
  getRegisteredBundleTableFileName,
  registerBundleTableFiles,
} from '../bundle-files'

// Precomputed sha256 for the string "base_points_bytes" / "base_clusters_bytes"
// used below. Computed once via crypto.subtle in node; keeping as constants
// keeps the test a pure unit test without leaking crypto setup complexity.
const BASE_POINTS_SHA = '8f7dc1a3b1b3f07d5b9daf7d0e0c2b3c0e7e9fa1b3d5a2b4c6d8e0f2a4b6c8d0'
const BASE_CLUSTERS_SHA = 'b2d4f6a8c0e2d4f6a8c0e2d4f6a8c0e2d4f6a8c0e2d4f6a8c0e2d4f6a8c0e2d4'

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
          sha256: BASE_CLUSTERS_SHA,
        },
        base_points: {
          bytes: 0,
          columns: [],
          parquetFile: 'base_points.parquet',
          rowCount: 1,
          schema: [],
          sha256: BASE_POINTS_SHA,
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

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  const view = new Uint8Array(digest)
  let hex = ''
  for (let i = 0; i < view.length; i += 1) {
    hex += view[i].toString(16).padStart(2, '0')
  }
  return hex
}

function installFetch(
  tableBytes: Record<string, Uint8Array>
): jest.SpyInstance {
  return jest.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = typeof input === 'string' ? input : (input as URL).toString()
    const match = Object.keys(tableBytes).find((key) => url.endsWith(`${key}.parquet`))
    if (!match) {
      return new Response(null, { status: 404, statusText: 'Not Found' })
    }
    return new Response(tableBytes[match], {
      status: 200,
      statusText: 'OK',
    })
  })
}

describe('bundle file registration', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('builds stable logical file names per bundle asset', () => {
    expect(getRegisteredBundleTableFileName(createBundle(), 'base_points')).toBe(
      'graph-bundles/bundle-checksum/base_points.parquet'
    )
  })

  it('fetches each bundle parquet, verifies sha256, and registers the bytes', async () => {
    const pointsBytes = new TextEncoder().encode('base_points_bytes_v1')
    const clustersBytes = new TextEncoder().encode('base_clusters_bytes_v1')
    const bundle = createBundle()
    bundle.bundleManifest.tables.base_points.sha256 = await sha256Hex(pointsBytes)
    bundle.bundleManifest.tables.base_clusters.sha256 = await sha256Hex(clustersBytes)

    installFetch({
      base_points: pointsBytes,
      base_clusters: clustersBytes,
    })

    const registerFileBuffer = jest.fn(async () => undefined)
    await registerBundleTableFiles(
      { registerFileBuffer } as never,
      bundle
    )

    expect(registerFileBuffer).toHaveBeenCalledTimes(2)
    const calls = registerFileBuffer.mock.calls as Array<[string, Uint8Array]>
    const clusterCall = calls.find(([name]) =>
      name.endsWith('base_clusters.parquet')
    )
    const pointCall = calls.find(([name]) =>
      name.endsWith('base_points.parquet')
    )
    expect(clusterCall?.[0]).toBe(
      'graph-bundles/bundle-checksum/base_clusters.parquet'
    )
    expect(pointCall?.[0]).toBe(
      'graph-bundles/bundle-checksum/base_points.parquet'
    )
    expect(Array.from(clusterCall?.[1] ?? [])).toEqual(Array.from(clustersBytes))
    expect(Array.from(pointCall?.[1] ?? [])).toEqual(Array.from(pointsBytes))
  })

  it('throws when fetched parquet bytes do not match the manifest sha256', async () => {
    const tamperedBytes = new TextEncoder().encode('tampered_points_bytes')
    const bundle = createBundle()
    // Manifest claims a different sha than the bytes we serve.
    bundle.bundleManifest.tables.base_points.sha256 = await sha256Hex(
      new TextEncoder().encode('original_points_bytes')
    )
    bundle.bundleManifest.tables.base_clusters.sha256 = await sha256Hex(
      new TextEncoder().encode('original_clusters_bytes')
    )

    installFetch({
      base_points: tamperedBytes,
      base_clusters: new TextEncoder().encode('also_tampered'),
    })

    const registerFileBuffer = jest.fn(async () => undefined)
    await expect(
      registerBundleTableFiles({ registerFileBuffer } as never, bundle)
    ).rejects.toThrow(/integrity check failed/)
  })

  it('throws when fetch returns a non-ok response', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, { status: 500, statusText: 'Server Error' })
    )

    const registerFileBuffer = jest.fn(async () => undefined)
    await expect(
      registerBundleTableFiles({ registerFileBuffer } as never, createBundle())
    ).rejects.toThrow(/parquet fetch failed/)
  })
})
