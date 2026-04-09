'use client'

import type { GraphBundle } from '@/features/graph/types'

import type { GraphPaperAttachmentProvider } from './attachment'
import { GRAPH_POINT_ATTACHMENT_MAX_REFS } from './attachment-contract'
import { ATTACHED_UNIVERSE_POINTS_TABLE } from './views/universe'
import { LOCAL_POINT_RUNTIME_COLUMNS } from './views/base-points'

const ATTACHED_UNIVERSE_STAGE_TABLE = 'attached_universe_points_stage'
const GRAPH_POINT_ATTACHMENT_ROUTE = '/api/graph/attach-points'

function resolveGraphReleaseId(bundle: GraphBundle) {
  return (
    bundle.bundleChecksum ||
    bundle.runId ||
    bundle.bundleManifest.graphRunId
  )
}

function getStageProjectionSql() {
  return LOCAL_POINT_RUNTIME_COLUMNS.join(', ')
}

function chunkGraphPaperRefs(graphPaperRefs: string[]) {
  const batches: string[][] = []

  for (let index = 0; index < graphPaperRefs.length; index += GRAPH_POINT_ATTACHMENT_MAX_REFS) {
    batches.push(graphPaperRefs.slice(index, index + GRAPH_POINT_ATTACHMENT_MAX_REFS))
  }

  return batches
}

async function parseAttachmentError(response: Response) {
  const contentType = response.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) {
    const body = (await response.json().catch(() => null)) as {
      error?: unknown
      error_code?: unknown
    } | null
    if (body?.error && typeof body.error === 'string') {
      return body.error
    }
    if (body?.error_code && typeof body.error_code === 'string') {
      return body.error_code
    }
  }

  const body = await response.text().catch(() => '')
  if (body.trim().length > 0) {
    return body
  }

  return `Graph attachment request failed with ${response.status}`
}

export const remoteGraphPaperAttachmentProvider: GraphPaperAttachmentProvider = {
  async attachGraphPaperRefs({ bundle, conn, graphPaperRefs }) {
    const uniqueGraphPaperRefs = [
      ...new Set(graphPaperRefs.filter((graphPaperRef) => graphPaperRef.trim().length > 0)),
    ]
    if (uniqueGraphPaperRefs.length === 0) {
      return
    }

    const graphReleaseId = resolveGraphReleaseId(bundle)

    for (const graphPaperRefsBatch of chunkGraphPaperRefs(uniqueGraphPaperRefs)) {
      const response = await fetch(GRAPH_POINT_ATTACHMENT_ROUTE, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          graph_release_id: graphReleaseId,
          graph_paper_refs: graphPaperRefsBatch,
        }),
        cache: 'no-store',
      })

      if (!response.ok) {
        throw new Error(await parseAttachmentError(response))
      }

      const payload = new Uint8Array(await response.arrayBuffer())

      await conn.query(`DROP TABLE IF EXISTS ${ATTACHED_UNIVERSE_STAGE_TABLE}`)
      try {
        await conn.insertArrowFromIPCStream(payload, {
          name: ATTACHED_UNIVERSE_STAGE_TABLE,
          create: true,
        })
        await conn.query(
          `DELETE FROM ${ATTACHED_UNIVERSE_POINTS_TABLE}
           USING ${ATTACHED_UNIVERSE_STAGE_TABLE}
           WHERE ${ATTACHED_UNIVERSE_POINTS_TABLE}.id = ${ATTACHED_UNIVERSE_STAGE_TABLE}.id`
        )
        await conn.query(
          `INSERT INTO ${ATTACHED_UNIVERSE_POINTS_TABLE}
           SELECT ${getStageProjectionSql()}
           FROM ${ATTACHED_UNIVERSE_STAGE_TABLE}`
        )
      } finally {
        await conn.query(`DROP TABLE IF EXISTS ${ATTACHED_UNIVERSE_STAGE_TABLE}`)
      }
    }
  },
}
