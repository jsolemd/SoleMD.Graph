import type {
  OverlayActivationResult,
  OverlayProducerId,
} from '@/features/graph/types'
import {
  LEGACY_OVERLAY_PRODUCER,
  MANUAL_CLUSTER_NEIGHBORHOOD_OVERLAY_PRODUCER,
} from '@/features/graph/lib/overlay-producers'

import {
  buildCanvasSource,
  getCanvasPointCounts,
  registerActiveCanvasAliasViews,
} from '../canvas'
import { activateOverlayByClusterNeighborhood } from '../overlay'
import { queryOverlayPointIds, queryRows } from '../queries'
import {
  clearAllOverlayPointIds,
  clearOverlayProducerPointIds,
  refreshActivePointRuntimeTables,
  replaceOverlayProducerPointIds,
  replaceSelectedPointIndices,
  replaceSelectedPointIndicesFromScopeSql,
} from '../views'
import type { GraphCanvasListener } from '../types'
import {
  haveSamePointIds,
  haveSamePointIndices,
  normalizeOverlayPointIds,
  normalizeSelectedPointIndices,
  normalizeSelectedPointScopeSql,
  type SelectedPointState,
} from './session-helpers'
import type {
  CreateSessionOverlayControllerArgs,
  SessionOverlayController,
} from './session-types'

export function createSessionOverlayController({
  conn,
  db,
  basePointCount,
  ensureOptionalBundleTables,
  initialPointCounts,
  resetOverlayDependentCaches,
}: CreateSessionOverlayControllerArgs): SessionOverlayController {
  let overlayRevision = 0
  let selectedPointState: SelectedPointState = { kind: 'empty' }
  let canvas = buildCanvasSource({
    conn,
    db,
    pointCounts: initialPointCounts,
    overlayCount: 0,
    overlayRevision,
  })
  const canvasListeners = new Set<GraphCanvasListener>()

  const emitCanvas = () => {
    for (const listener of canvasListeners) {
      listener(canvas)
    }
  }

  const refreshCanvas = async ({
    incrementRevision = true,
    overlayCount,
  }: {
    incrementRevision?: boolean
    overlayCount: number
  }) => {
    if (incrementRevision) {
      overlayRevision += 1
    }
    await registerActiveCanvasAliasViews(conn, {
      overlayRevision,
      overlayCount,
    })
    canvas = buildCanvasSource({
      conn,
      db,
      pointCounts: getCanvasPointCounts(basePointCount, overlayCount),
      overlayCount,
      overlayRevision,
    })
    emitCanvas()
    return { overlayCount: canvas.overlayCount }
  }

  let overlayMutationChain: Promise<void> = Promise.resolve()

  const runOverlayMutation = async <T>(operation: () => Promise<T>): Promise<T> => {
    const previousMutation = overlayMutationChain
    let releaseMutation!: () => void
    overlayMutationChain = new Promise<void>((resolve) => {
      releaseMutation = resolve
    })

    await previousMutation
    try {
      return await operation()
    } finally {
      releaseMutation()
    }
  }

  const clearSelectedPointState = async () => {
    if (selectedPointState.kind === 'empty') {
      return
    }

    await replaceSelectedPointIndices(conn, [])
    selectedPointState = { kind: 'empty' }
  }

  const queryOverlayProducerPointIds = async (producerId: OverlayProducerId) => {
    const rows = await queryRows<{ id: string }>(
      conn,
      `SELECT id
       FROM overlay_point_ids_by_producer
       WHERE producer_id = ?
       ORDER BY id`,
      [producerId]
    )

    return rows
      .map((row) => row.id)
      .filter((pointId): pointId is string => typeof pointId === 'string' && pointId.length > 0)
  }

  const queryOverlayPointIdsExcludingProducer = async (producerId: OverlayProducerId) => {
    const rows = await queryRows<{ id: string }>(
      conn,
      `SELECT DISTINCT id
       FROM overlay_point_ids_by_producer
       WHERE producer_id <> ?
       ORDER BY id`,
      [producerId]
    )

    return rows
      .map((row) => row.id)
      .filter((pointId): pointId is string => typeof pointId === 'string' && pointId.length > 0)
  }

  const refreshOverlayCanvas = async () => {
    const { overlayCount } = await refreshActivePointRuntimeTables(conn, basePointCount)
    await clearSelectedPointState()
    return refreshCanvas({ overlayCount })
  }

  const setOverlayProducerPointIdsInternal = async ({
    producerId,
    pointIds,
  }: {
    producerId: OverlayProducerId
    pointIds: string[]
  }) => {
    const nextProducerPointIds = normalizeOverlayPointIds(pointIds)
    const currentProducerPointIds = await queryOverlayProducerPointIds(producerId)

    if (haveSamePointIds(currentProducerPointIds, nextProducerPointIds)) {
      return { overlayCount: canvas.overlayCount }
    }

    resetOverlayDependentCaches()
    if (nextProducerPointIds.length === 0) {
      await clearOverlayProducerPointIds(conn, producerId)
    } else {
      await ensureOptionalBundleTables(['universe_points'])
      await replaceOverlayProducerPointIds(conn, {
        producerId,
        pointIds: nextProducerPointIds,
      })
    }

    return refreshOverlayCanvas()
  }

  const clearOverlayProducerInternal = async (producerId: OverlayProducerId) => {
    const currentProducerPointIds = await queryOverlayProducerPointIds(producerId)
    if (currentProducerPointIds.length === 0) {
      return { overlayCount: canvas.overlayCount }
    }

    resetOverlayDependentCaches()
    await clearOverlayProducerPointIds(conn, producerId)
    return refreshOverlayCanvas()
  }

  const reconcileOverlayPointIdsInternal = async ({
    previousPointIds,
    nextPointIds,
  }: {
    previousPointIds: string[]
    nextPointIds: string[]
  }) => {
    const currentOverlayPointIds = await queryOverlayPointIds(conn)
    const previousPointIdSet = new Set(normalizeOverlayPointIds(previousPointIds))
    const preservedPointIds = currentOverlayPointIds.filter(
      (pointId) => !previousPointIdSet.has(pointId)
    )
    const desiredOverlayPointIds = normalizeOverlayPointIds([
      ...preservedPointIds,
      ...nextPointIds,
    ])
    const otherProducerPointIds = await queryOverlayPointIdsExcludingProducer(
      LEGACY_OVERLAY_PRODUCER
    )
    const otherProducerPointIdSet = new Set(otherProducerPointIds)
    const nextLegacyPointIds = desiredOverlayPointIds.filter(
      (pointId) => !otherProducerPointIdSet.has(pointId)
    )

    return setOverlayProducerPointIdsInternal({
      producerId: LEGACY_OVERLAY_PRODUCER,
      pointIds: nextLegacyPointIds,
    })
  }

  return {
    getCanvas() {
      return canvas
    },
    subscribeCanvas(listener) {
      canvasListeners.add(listener)
      listener(canvas)
      return () => {
        canvasListeners.delete(listener)
      }
    },
    async setSelectedPointIndices(pointIndices: number[]) {
      const normalized = normalizeSelectedPointIndices(pointIndices)
      if (
        (normalized.length === 0 && selectedPointState.kind === 'empty') ||
        (selectedPointState.kind === 'indices' &&
          haveSamePointIndices(selectedPointState.pointIndices, normalized))
      ) {
        return
      }
      await replaceSelectedPointIndices(conn, normalized)
      selectedPointState =
        normalized.length > 0
          ? { kind: 'indices', pointIndices: normalized }
          : { kind: 'empty' }
    },
    async setSelectedPointScopeSql(scopeSql: string | null) {
      const normalizedScopeSql = normalizeSelectedPointScopeSql(scopeSql)
      if (
        (!normalizedScopeSql && selectedPointState.kind === 'empty') ||
        (selectedPointState.kind === 'scope' &&
          selectedPointState.scopeSql === normalizedScopeSql)
      ) {
        return
      }
      await replaceSelectedPointIndicesFromScopeSql(conn, normalizedScopeSql)
      selectedPointState = normalizedScopeSql
        ? { kind: 'scope', scopeSql: normalizedScopeSql }
        : { kind: 'empty' }
    },
    getOverlayPointIds() {
      return queryOverlayPointIds(conn)
    },
    async reconcileOverlayPointIds(args) {
      return runOverlayMutation(async () => reconcileOverlayPointIdsInternal(args))
    },
    async setOverlayProducerPointIds(args) {
      return runOverlayMutation(async () => setOverlayProducerPointIdsInternal(args))
    },
    async clearOverlayProducer(producerId) {
      return runOverlayMutation(async () => clearOverlayProducerInternal(producerId))
    },
    async setOverlayPointIds(pointIds: string[]) {
      return runOverlayMutation(async () =>
        setOverlayProducerPointIdsInternal({
          producerId: MANUAL_CLUSTER_NEIGHBORHOOD_OVERLAY_PRODUCER,
          pointIds,
        })
      )
    },
    async clearOverlay() {
      return runOverlayMutation(async () => {
        if (canvas.overlayCount === 0) {
          return { overlayCount: 0 }
        }

        resetOverlayDependentCaches()
        await clearAllOverlayPointIds(conn)
        return refreshOverlayCanvas()
      })
    },
    async activateOverlay(args): Promise<OverlayActivationResult> {
      return runOverlayMutation(async () => {
        await ensureOptionalBundleTables(['universe_points'])
        resetOverlayDependentCaches()
        const result =
          args.kind === 'cluster-neighborhood'
            ? await activateOverlayByClusterNeighborhood(
                conn,
                args,
                MANUAL_CLUSTER_NEIGHBORHOOD_OVERLAY_PRODUCER
              )
            : (() => {
                throw new Error(`Unsupported overlay activation kind: ${args.kind}`)
              })()

        if (!result.applied) {
          return {
            kind: args.kind,
            layer: args.layer,
            scope: args.scope,
            overlayCount: canvas.overlayCount,
            addedCount: 0,
            seedCount: 0,
            clusterCount: 0,
          }
        }

        const overlayState = await refreshOverlayCanvas()
        return {
          kind: result.kind,
          layer: result.layer,
          scope: result.scope,
          overlayCount: overlayState.overlayCount,
          addedCount: result.addedCount,
          seedCount: result.seedCount,
          clusterCount: result.clusterCount,
        }
      })
    },
  }
}
