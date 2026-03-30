import type { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm'

import type { GraphBundle } from '@/features/graph/types'

export type EnsureOptionalBundleTables = (requested: string[]) => Promise<void>

export interface GraphPaperAttachmentProvider {
  attachGraphPaperRefs: (args: {
    bundle: GraphBundle
    conn: AsyncDuckDBConnection
    graphPaperRefs: string[]
    ensureOptionalBundleTables: EnsureOptionalBundleTables
  }) => Promise<void>
}

let graphPaperAttachmentProvider: GraphPaperAttachmentProvider | null = null

export function registerGraphPaperAttachmentProvider(
  provider: GraphPaperAttachmentProvider | null
) {
  graphPaperAttachmentProvider = provider
}

export function getGraphPaperAttachmentProvider() {
  return graphPaperAttachmentProvider
}

export async function maybeAttachGraphPaperRefs(args: {
  bundle: GraphBundle
  conn: AsyncDuckDBConnection
  graphPaperRefs: string[]
  ensureOptionalBundleTables: EnsureOptionalBundleTables
}) {
  if (!graphPaperAttachmentProvider || args.graphPaperRefs.length === 0) {
    return false
  }

  await graphPaperAttachmentProvider.attachGraphPaperRefs(args)
  return true
}
