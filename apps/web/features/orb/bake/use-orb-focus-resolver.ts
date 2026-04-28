"use client";

import { useEffect, useRef } from "react";
import type { GraphBundleQueries, GraphPointRecord } from "@solemd/graph";

import { useGraphStore } from "@/features/graph/stores";
import { PARTICLE_STATE_CAPACITY } from "@/features/field/renderer/field-particle-state-texture";
import { useOrbFocusVisualStore } from "../stores/focus-visual-store";

const PAPER_SAMPLE_TABLE = "paper_sample";
const NEIGHBOR_HIGHLIGHT_COUNT = 8;

export interface UseOrbFocusResolverOptions {
  queries: GraphBundleQueries | null;
  particleCount: number;
  enabled?: boolean;
  paperSampleReady: boolean;
}

function sqlStringLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function buildFocusResolutionSql(node: GraphPointRecord): string {
  const graphPaperRef = node.paperId ?? node.id;
  const idLiteral = sqlStringLiteral(node.id);
  const paperLiteral = sqlStringLiteral(graphPaperRef);

  return `
    WITH focus AS (
      SELECT
        id,
        paperId,
        clusterId,
        x,
        y
      FROM base_points_web
      WHERE id = ${idLiteral}
         OR paperId = ${paperLiteral}
      LIMIT 1
    ),
    raw_linked_neighbors AS (
      SELECT
        CASE
          WHEN l.source_node_id = focus.id THEN l.target_node_id
          ELSE l.source_node_id
        END AS id,
        MAX(COALESCE(l.weight, 0)) AS weight
      FROM base_links_web l
      CROSS JOIN focus
      WHERE l.source_node_id = focus.id
         OR l.target_node_id = focus.id
      GROUP BY id
    ),
    linked_neighbors AS (
      SELECT
        id,
        ROW_NUMBER() OVER (
          ORDER BY weight DESC, id
        ) AS neighborRank
      FROM raw_linked_neighbors
      WHERE id IS NOT NULL
      LIMIT ${NEIGHBOR_HIGHLIGHT_COUNT}
    ),
    spatial_neighbors AS (
      SELECT
        p.id,
        ROW_NUMBER() OVER (
          ORDER BY
            ((p.x - focus.x) * (p.x - focus.x)) +
            ((p.y - focus.y) * (p.y - focus.y)),
            p.id
        ) AS neighborRank
      FROM base_points_web p
      CROSS JOIN focus
      WHERE p.id <> focus.id
        AND COALESCE(focus.clusterId, 0) > 0
        AND p.clusterId = focus.clusterId
      LIMIT ${NEIGHBOR_HIGHLIGHT_COUNT}
    ),
    ranked_neighbors AS (
      SELECT id, 0 AS sourceRank, neighborRank FROM linked_neighbors
      UNION ALL
      SELECT id, 1 AS sourceRank, neighborRank
      FROM spatial_neighbors
      WHERE id NOT IN (SELECT id FROM linked_neighbors)
    )
    SELECT
      sample.particleIdx,
      TRUE AS isFocus,
      -1 AS sourceRank,
      0 AS neighborRank
    FROM ${PAPER_SAMPLE_TABLE} sample
    JOIN focus
      ON sample.id = focus.id
      OR sample.paperId = focus.paperId
    UNION ALL
    SELECT
      sample.particleIdx,
      FALSE AS isFocus,
      ranked.sourceRank,
      ranked.neighborRank
    FROM ranked_neighbors ranked
    JOIN ${PAPER_SAMPLE_TABLE} sample
      ON sample.id = ranked.id
    ORDER BY isFocus DESC, sourceRank, neighborRank, particleIdx
    LIMIT ${NEIGHBOR_HIGHLIGHT_COUNT + 1}
  `;
}

interface FocusResolution {
  focusIndex: number | null;
  neighborIndices: number[];
}

function readParticleIndex(row: Record<string, unknown>): number | null {
  const value = Number(row.particleIdx);
  return Number.isInteger(value) ? value : null;
}

function readBoolean(value: unknown): boolean {
  return value === true || value === 1 || value === "true";
}

function readFocusResolution(
  rows: Array<Record<string, unknown>>,
): FocusResolution {
  let focusIndex: number | null = null;
  const neighborIndices: number[] = [];

  for (const row of rows) {
    const index = readParticleIndex(row);
    if (index == null) continue;

    if (readBoolean(row.isFocus)) {
      focusIndex = index;
      continue;
    }

    neighborIndices.push(index);
  }

  return { focusIndex, neighborIndices };
}

/**
 * Resolves `useGraphStore.selectedNode` to the sampled orb particle
 * index plus up to 8 resident neighbors. This hook deliberately reads
 * selectedNode only: explicit selection sets (`selected_point_indices`)
 * are bridged by `useOrbSelectionResolver`, not by the click spotlight.
 */
export function useOrbFocusResolver(
  options: UseOrbFocusResolverOptions,
): void {
  const { queries, particleCount, enabled = true, paperSampleReady } = options;
  const selectedNode = useGraphStore((s) => s.selectedNode);
  const setFocusIndex = useOrbFocusVisualStore((s) => s.setFocusIndex);
  const setNeighborIndices = useOrbFocusVisualStore(
    (s) => s.setNeighborIndices,
  );
  const resolverRef = useRef<{
    schedule: (node: GraphPointRecord | null) => void;
    cancel: () => void;
  } | null>(null);

  useEffect(() => {
    if (!enabled) {
      resolverRef.current = null;
      setFocusIndex(null);
      return;
    }

    let cancelled = false;
    let pendingNode: GraphPointRecord | null | undefined;
    let inFlight = false;
    let rafId: number | null = null;

    const clearFrame = () => {
      if (rafId == null) return;
      cancelAnimationFrame(rafId);
      rafId = null;
    };

    const isValidIndex = (index: number | null) =>
      index != null &&
      index >= 0 &&
      index < particleCount &&
      index < PARTICLE_STATE_CAPACITY;

    const commitResolution = (resolution: FocusResolution) => {
      const focusIndex = isValidIndex(resolution.focusIndex)
        ? resolution.focusIndex
        : null;
      const neighborIndices = resolution.neighborIndices.filter(isValidIndex);

      setFocusIndex(focusIndex);
      setNeighborIndices(neighborIndices);
    };

    const clearResolution = () => {
      setFocusIndex(null);
      setNeighborIndices([]);
    };

    const commitIndex = (index: number | null) => {
      if (
        index == null ||
        index < 0 ||
        index >= particleCount ||
        index >= PARTICLE_STATE_CAPACITY
      ) {
        clearResolution();
        return;
      }
      setFocusIndex(index);
      setNeighborIndices([]);
    };

    const resolveNode = async (node: GraphPointRecord | null) => {
      if (node == null) {
        commitIndex(null);
        return;
      }

      if (!queries || !paperSampleReady || particleCount <= 0) {
        clearResolution();
        return;
      }

      try {
        const result = await queries.runReadOnlyQuery(buildFocusResolutionSql(node));
        if (cancelled || pendingNode !== undefined) return;
        commitResolution(readFocusResolution(result.rows));
      } catch {
        if (!cancelled && pendingNode === undefined) clearResolution();
      }
    };

    const dispatchPending = () => {
      if (cancelled || pendingNode === undefined) return;
      const node = pendingNode;
      pendingNode = undefined;
      inFlight = true;
      void resolveNode(node).finally(() => {
        inFlight = false;
        if (!cancelled && pendingNode !== undefined) schedule(pendingNode);
      });
    };

    const schedule = (node: GraphPointRecord | null) => {
      pendingNode = node;
      if (cancelled || inFlight) return;
      clearFrame();
      rafId = requestAnimationFrame(() => {
        rafId = null;
        dispatchPending();
      });
    };

    resolverRef.current = {
      schedule,
      cancel: () => {
        cancelled = true;
        clearFrame();
      },
    };
    schedule(useGraphStore.getState().selectedNode);

    return () => {
      cancelled = true;
      clearFrame();
      if (resolverRef.current?.schedule === schedule) {
        resolverRef.current = null;
      }
    };
  }, [
    enabled,
    paperSampleReady,
    particleCount,
    queries,
    setFocusIndex,
    setNeighborIndices,
  ]);

  useEffect(() => {
    if (!enabled) return;
    resolverRef.current?.schedule(selectedNode);
  }, [enabled, selectedNode]);
}

export { buildFocusResolutionSql, readFocusResolution };
