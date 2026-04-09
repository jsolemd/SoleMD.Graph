import type { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm'

import type { GraphBundle, MapLayer } from '@/features/graph/types'

import { validateTableName, requireBundleTable } from '../utils'

import { registerActivePointViews } from './active-points'
import {
  BASE_POINT_CANONICAL_SOURCE_TABLE,
  BASE_POINT_QUERY_RUNTIME_SOURCE_TABLE,
  createPointCanvasProjectionSql,
  createPointQueryProjectionSql,
  LOCAL_POINT_RUNTIME_COLUMNS,
  registerBasePointQueryViews,
  registerBasePointsView,
} from './base-points'
import {
  BASE_CLUSTER_CANONICAL_SOURCE_TABLE,
  BASE_CLUSTER_RUNTIME_SOURCE_TABLE,
  LOCAL_CLUSTER_RUNTIME_COLUMNS,
  registerClusterViews,
} from './clusters'
import { registerClusterExemplarView } from './details'
import { initializeOverlayMembershipTable } from './overlay'
import { registerPaperDocumentViews } from './paper-documents'
import { materializeBundleParquetTables, resolveBundleRelations } from './relations'
import {
  initializeAttachedUniversePointTable,
  registerUniverseLinksViews,
  registerUniversePointView,
} from './universe'

export interface SessionViewState {
  availableLayers: MapLayer[]
  attachedTableSet: Set<string>
  basePointCount: number
  buildPointCanvasProjectionSql: (sourceTable: string, indexSql: string) => string
  buildPointQueryProjectionSql: (sourceTable: string, indexSql: string) => string
}

async function runBootstrapStep<T>(label: string, operation: () => Promise<T>) {
  try {
    return await operation()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Graph bundle bootstrap failed at ${label}: ${message}`)
  }
}

export async function registerInitialSessionViews(
  conn: AsyncDuckDBConnection,
  bundle: GraphBundle,
  autoloadTables: string[]
): Promise<SessionViewState> {
  await runBootstrapStep('bundle relation registration', () =>
    resolveBundleRelations(conn, bundle, autoloadTables)
  )
  const attachedTableSet = new Set(autoloadTables)

  requireBundleTable(bundle, 'base_points')
  requireBundleTable(bundle, 'base_clusters')
  const basePointCount = requireBundleTable(bundle, 'base_points').rowCount

  const buildPointCanvasProjectionSql = createPointCanvasProjectionSql(bundle)
  const buildPointQueryProjectionSql = createPointQueryProjectionSql(bundle)
  await runBootstrapStep('base point views', () =>
    registerBasePointsView(conn, {
      sourceTable: validateTableName(BASE_POINT_CANONICAL_SOURCE_TABLE),
      buildPointCanvasProjectionSql,
      buildPointQueryProjectionSql,
    })
  )
  await runBootstrapStep('attached universe point table', () =>
    initializeAttachedUniversePointTable(
      conn,
      validateTableName(BASE_POINT_CANONICAL_SOURCE_TABLE)
    )
  )

  await runBootstrapStep('universe point views', () =>
    registerUniversePointView(conn, {
      sourceTable: attachedTableSet.has('universe_points')
        ? validateTableName('universe_points')
        : null,
      selectCanvasSql: buildPointCanvasProjectionSql,
      selectQuerySql: buildPointQueryProjectionSql,
    })
  )

  await runBootstrapStep('overlay membership table', () =>
    initializeOverlayMembershipTable(conn)
  )
  await runBootstrapStep('active point views', () =>
    registerActivePointViews(conn, basePointCount)
  )

  await runBootstrapStep('universe link views', () =>
    registerUniverseLinksViews(conn, {
      universeLinksTable: attachedTableSet.has('universe_links')
        ? validateTableName('universe_links')
        : null,
    })
  )

  await runBootstrapStep('cluster views', () =>
    registerClusterViews(conn, validateTableName(BASE_CLUSTER_CANONICAL_SOURCE_TABLE))
  )

  const availableLayers: MapLayer[] = ['corpus']

  return {
    availableLayers,
    attachedTableSet,
    basePointCount,
    buildPointCanvasProjectionSql,
    buildPointQueryProjectionSql,
  }
}

export function createEnsurePrimaryQueryTables(
  conn: AsyncDuckDBConnection,
  bundle: GraphBundle,
  state: SessionViewState
) {
  let ensurePromise: Promise<void> | null = null
  let materialized = false

  return async () => {
    if (materialized) {
      return
    }

    if (ensurePromise) {
      await ensurePromise
      return
    }

    ensurePromise = (async () => {
      await runBootstrapStep('interactive query runtime materialization', () =>
        materializeBundleParquetTables(conn, bundle, [
          {
            tableName: BASE_POINT_CANONICAL_SOURCE_TABLE,
            runtimeTableName: BASE_POINT_QUERY_RUNTIME_SOURCE_TABLE,
            selectedColumns: LOCAL_POINT_RUNTIME_COLUMNS,
          },
          {
            tableName: BASE_CLUSTER_CANONICAL_SOURCE_TABLE,
            runtimeTableName: BASE_CLUSTER_RUNTIME_SOURCE_TABLE,
            selectedColumns: LOCAL_CLUSTER_RUNTIME_COLUMNS,
          },
        ])
      )

      await runBootstrapStep('interactive point query views', () =>
        registerBasePointQueryViews(conn, {
          sourceTable: BASE_POINT_QUERY_RUNTIME_SOURCE_TABLE,
          buildPointQueryProjectionSql: state.buildPointQueryProjectionSql,
        })
      )
      await runBootstrapStep('interactive cluster query views', () =>
        registerClusterViews(conn, BASE_CLUSTER_RUNTIME_SOURCE_TABLE)
      )

      materialized = true
    })().finally(() => {
      ensurePromise = null
    })

    await ensurePromise
  }
}

export function createEnsureOptionalBundleTables(
  conn: AsyncDuckDBConnection,
  bundle: GraphBundle,
  state: SessionViewState
) {
  let ensurePromise: Promise<void> | null = null

  return async (tableNames: string[]) => {
    while (true) {
      const requested = [...new Set(tableNames)].filter(
        (tableName) =>
          Boolean(bundle.bundleManifest.tables[tableName]) &&
          !state.attachedTableSet.has(tableName)
      )
      if (requested.length === 0) {
        return
      }

      if (ensurePromise) {
        await ensurePromise
        continue
      }

      ensurePromise = (async () => {
        await runBootstrapStep(
          `optional relation registration (${requested.join(', ')})`,
          () => resolveBundleRelations(conn, bundle, requested)
        )

        for (const tableName of requested) {
          state.attachedTableSet.add(tableName)
        }

        if (requested.includes('universe_points')) {
          await runBootstrapStep('optional universe point views', () =>
            registerUniversePointView(conn, {
              sourceTable: validateTableName('universe_points'),
              selectCanvasSql: state.buildPointCanvasProjectionSql,
              selectQuerySql: state.buildPointQueryProjectionSql,
            })
          )
        }

        if (requested.includes('universe_links')) {
          await runBootstrapStep('optional universe link views', () =>
            registerUniverseLinksViews(conn, {
              universeLinksTable: validateTableName('universe_links'),
            })
          )
        }

        if (requested.includes('paper_documents')) {
          await runBootstrapStep('optional paper document views', () =>
            registerPaperDocumentViews(conn, validateTableName('paper_documents'))
          )
        }

        if (requested.includes('cluster_exemplars')) {
          await runBootstrapStep('optional cluster exemplar views', () =>
            registerClusterExemplarView(
              conn,
              validateTableName('cluster_exemplars')
            )
          )
        }
      })().finally(() => {
        ensurePromise = null
      })

      await ensurePromise
      return
    }
  }
}
