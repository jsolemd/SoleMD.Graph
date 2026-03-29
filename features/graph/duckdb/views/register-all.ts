import type { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm'

import type { GraphBundle, MapLayer } from '@/features/graph/types'

import { validateTableName, requireBundleTable } from '../utils'

import { registerActivePointViews } from './active-points'
import { createPointViewSelectBuilder, registerBasePointsView } from './base-points'
import { registerClusterViews } from './clusters'
import { registerGraphChunkDetailsView, registerClusterExemplarView } from './details'
import { registerGeoViews } from './geo'
import { initializeOverlayMembershipTable } from './overlay'
import { registerPaperDocumentViews } from './paper-documents'
import { resolveBundleRelations } from './relations'
import { registerUniverseLinksViews, registerUniversePointView } from './universe'

export interface SessionViewState {
  availableLayers: MapLayer[]
  attachedTableSet: Set<string>
  bundleAttached: boolean
  buildPointViewSelect: (sourceTable: string, indexSql: string) => string
}

export async function registerInitialSessionViews(
  conn: AsyncDuckDBConnection,
  bundle: GraphBundle,
  autoloadTables: string[]
): Promise<SessionViewState> {
  const bundleAttached = await resolveBundleRelations(conn, bundle, autoloadTables)
  const attachedTableSet = new Set(autoloadTables)

  requireBundleTable(bundle, 'base_points')
  requireBundleTable(bundle, 'base_clusters')

  const buildPointViewSelect = createPointViewSelectBuilder(bundle)
  await registerBasePointsView(conn, buildPointViewSelect)

  await registerUniversePointView(conn, {
    sourceTable: attachedTableSet.has('universe_points')
      ? validateTableName('universe_points')
      : null,
    selectSql: buildPointViewSelect,
  })

  await initializeOverlayMembershipTable(conn)
  await registerActivePointViews(conn)

  await registerUniverseLinksViews(conn, {
    universeLinksTable: attachedTableSet.has('universe_links')
      ? validateTableName('universe_links')
      : null,
  })

  await registerClusterViews(conn)

  const availableLayers: MapLayer[] = ['chunk']

  await registerPaperDocumentViews(
    conn,
    attachedTableSet.has('paper_documents')
      ? validateTableName('paper_documents')
      : null
  )
  await registerGraphChunkDetailsView(conn)
  await registerClusterExemplarView(
    conn,
    attachedTableSet.has('cluster_exemplars')
      ? validateTableName('cluster_exemplars')
      : null
  )

  availableLayers.push('paper')

  await registerGeoViews(conn, bundle, availableLayers)

  return { availableLayers, attachedTableSet, bundleAttached, buildPointViewSelect }
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
        state.bundleAttached = await resolveBundleRelations(
          conn,
          bundle,
          requested,
          state.bundleAttached
        )

        for (const tableName of requested) {
          state.attachedTableSet.add(tableName)
        }

        if (requested.includes('universe_points')) {
          await registerUniversePointView(conn, {
            sourceTable: validateTableName('universe_points'),
            selectSql: state.buildPointViewSelect,
          })
        }

        if (requested.includes('universe_links')) {
          await registerUniverseLinksViews(conn, {
            universeLinksTable: validateTableName('universe_links'),
          })
        }

        if (requested.includes('paper_documents')) {
          await registerPaperDocumentViews(conn, validateTableName('paper_documents'))
          await registerGraphChunkDetailsView(conn)
        }

        if (requested.includes('cluster_exemplars')) {
          await registerClusterExemplarView(
            conn,
            validateTableName('cluster_exemplars')
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
