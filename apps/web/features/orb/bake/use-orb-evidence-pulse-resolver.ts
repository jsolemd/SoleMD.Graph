"use client";

import { useEffect } from "react";
import type { GraphBundleQueries } from "@solemd/graph";
import type { GraphRagQueryResponsePayload } from "@solemd/api-client/shared/graph-rag";

import { useDashboardStore } from "@/features/graph/stores";
import { useOrbFocusVisualStore } from "../stores/focus-visual-store";
import { ORB_PARTICLE_CAPACITY } from "./orb-particle-constants";

const PAPER_SAMPLE_TABLE = "paper_sample";
const ANSWER_SIGNAL_INTENSITY = 255;
const GRAPH_SIGNAL_INTENSITY = 216;
const RESULT_SIGNAL_INTENSITY = 176;
const MIN_SIGNAL_INTENSITY = 96;
const RANK_STEP = 8;

export interface UseOrbEvidencePulseResolverOptions {
  queries: GraphBundleQueries | null;
  particleCount: number;
  enabled?: boolean;
  paperSampleReady: boolean;
}

export interface EvidencePulseRef {
  graphPaperRef: string;
  intensity: number;
}

function sqlStringLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function normalizeGraphPaperRef(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function rankedIntensity(base: number, rank: number | null | undefined): number {
  const rankOffset =
    typeof rank === "number" && Number.isFinite(rank)
      ? Math.max(0, Math.floor(rank) - 1) * RANK_STEP
      : 0;
  return Math.max(MIN_SIGNAL_INTENSITY, Math.min(255, base - rankOffset));
}

function upsertPulseRef(
  refs: Map<string, number>,
  graphPaperRef: string | null,
  intensity: number,
): void {
  if (!graphPaperRef) return;
  refs.set(graphPaperRef, Math.max(refs.get(graphPaperRef) ?? 0, intensity));
}

export function collectEvidencePulseRefs(
  response: GraphRagQueryResponsePayload | null,
): EvidencePulseRef[] {
  if (!response) return [];

  const refs = new Map<string, number>();
  for (const graphPaperRef of response.answer_graph_paper_refs) {
    upsertPulseRef(
      refs,
      normalizeGraphPaperRef(graphPaperRef),
      ANSWER_SIGNAL_INTENSITY,
    );
  }

  for (const signal of response.graph_signals) {
    const base = signal.signal_kind.startsWith("answer_")
      ? ANSWER_SIGNAL_INTENSITY
      : GRAPH_SIGNAL_INTENSITY;
    upsertPulseRef(
      refs,
      normalizeGraphPaperRef(signal.graph_paper_ref),
      rankedIntensity(base, signal.rank),
    );
  }

  for (const bundle of response.evidence_bundles) {
    upsertPulseRef(
      refs,
      normalizeGraphPaperRef(bundle.graph_paper_ref),
      rankedIntensity(RESULT_SIGNAL_INTENSITY, bundle.rank),
    );
  }

  for (const result of response.results) {
    upsertPulseRef(
      refs,
      normalizeGraphPaperRef(result.graph_paper_ref),
      rankedIntensity(RESULT_SIGNAL_INTENSITY, result.result_index + 1),
    );
  }

  return Array.from(refs, ([graphPaperRef, intensity]) => ({
    graphPaperRef,
    intensity,
  }));
}

export function buildEvidencePulseResolutionSql(
  refs: readonly EvidencePulseRef[],
): string {
  const values = refs
    .map(
      (ref) =>
        `(${sqlStringLiteral(ref.graphPaperRef)}, ${Math.max(
          0,
          Math.min(255, Math.round(ref.intensity)),
        )})`,
    )
    .join(", ");

  return `
    WITH pulse_refs(graphPaperRef, intensity) AS (VALUES ${values})
    SELECT
      sample.particleIdx,
      MAX(pulse_refs.intensity)::INTEGER AS intensity
    FROM pulse_refs
    JOIN ${PAPER_SAMPLE_TABLE} sample
      ON sample.id = pulse_refs.graphPaperRef
      OR sample.paperId = pulse_refs.graphPaperRef
    GROUP BY sample.particleIdx
    ORDER BY intensity DESC, sample.particleIdx
  `;
}

function readParticleIndex(row: Record<string, unknown>): number | null {
  const value = Number(row.particleIdx);
  return Number.isInteger(value) ? value : null;
}

function readIntensity(row: Record<string, unknown>): number {
  const value = Number(row.intensity);
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(255, Math.round(value)));
}

export function useOrbEvidencePulseResolver(
  options: UseOrbEvidencePulseResolverOptions,
): void {
  const { queries, particleCount, enabled = true, paperSampleReady } = options;
  const ragResponse = useDashboardStore((s) => s.ragResponse);
  const setEvidenceIndices = useOrbFocusVisualStore((s) => s.setEvidenceIndices);

  useEffect(() => {
    if (!enabled) return;

    const refs = collectEvidencePulseRefs(ragResponse);
    if (!ragResponse || refs.length === 0) {
      setEvidenceIndices([]);
      return;
    }

    if (!queries || !paperSampleReady || particleCount <= 0) {
      setEvidenceIndices([]);
      return;
    }

    let cancelled = false;
    const rafId = requestAnimationFrame(() => {
      void queries
        .runReadOnlyQuery(buildEvidencePulseResolutionSql(refs))
        .then((result) => {
          if (cancelled) return;

          const evidenceIndices: number[] = [];
          for (const row of result.rows) {
            const index = readParticleIndex(row);
            if (
              index == null ||
              index < 0 ||
              index >= particleCount ||
              index >= ORB_PARTICLE_CAPACITY ||
              readIntensity(row) <= 0
            ) {
              continue;
            }
            evidenceIndices.push(index);
          }
          setEvidenceIndices(evidenceIndices);
        })
        .catch(() => {
          if (cancelled) return;
          setEvidenceIndices([]);
        });
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
    };
  }, [
    enabled,
    paperSampleReady,
    particleCount,
    queries,
    ragResponse,
    setEvidenceIndices,
  ]);
}
