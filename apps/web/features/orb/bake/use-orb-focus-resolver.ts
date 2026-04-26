"use client";

import { useEffect, useRef } from "react";
import type { GraphBundleQueries, GraphPointRecord } from "@solemd/graph";

import { useGraphStore } from "@/features/graph/stores";
import { PARTICLE_STATE_CAPACITY } from "@/features/field/renderer/field-particle-state-texture";
import { useOrbFocusVisualStore } from "../stores/focus-visual-store";

const PAPER_SAMPLE_TABLE = "paper_sample";

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
    SELECT particleIdx
    FROM ${PAPER_SAMPLE_TABLE}
    WHERE id = ${idLiteral}
       OR paperId = ${paperLiteral}
    LIMIT 1
  `;
}

function readParticleIndex(row: Record<string, unknown> | undefined): number | null {
  if (!row) return null;
  const value = Number(row.particleIdx);
  return Number.isInteger(value) ? value : null;
}

/**
 * Resolves `useGraphStore.selectedNode` to the sampled orb particle
 * index. This hook deliberately reads selectedNode only: explicit
 * selection sets (`selected_point_indices`) belong to slice 5b/D/E,
 * not the G-lane click spotlight.
 */
export function useOrbFocusResolver(
  options: UseOrbFocusResolverOptions,
): void {
  const { queries, particleCount, enabled = true, paperSampleReady } = options;
  const selectedNode = useGraphStore((s) => s.selectedNode);
  const setFocusIndex = useOrbFocusVisualStore((s) => s.setFocusIndex);
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

    const commitIndex = (index: number | null) => {
      if (
        index == null ||
        index < 0 ||
        index >= particleCount ||
        index >= PARTICLE_STATE_CAPACITY
      ) {
        setFocusIndex(null);
        return;
      }
      setFocusIndex(index);
    };

    const resolveNode = async (node: GraphPointRecord | null) => {
      if (node == null) {
        commitIndex(null);
        return;
      }

      if (!queries || !paperSampleReady || particleCount <= 0) {
        commitIndex(null);
        return;
      }

      try {
        const result = await queries.runReadOnlyQuery(buildFocusResolutionSql(node));
        if (cancelled || pendingNode !== undefined) return;
        commitIndex(readParticleIndex(result.rows[0]));
      } catch {
        if (!cancelled && pendingNode === undefined) commitIndex(null);
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
  }, [enabled, paperSampleReady, particleCount, queries, setFocusIndex]);

  useEffect(() => {
    if (!enabled) return;
    resolverRef.current?.schedule(selectedNode);
  }, [enabled, selectedNode]);
}
