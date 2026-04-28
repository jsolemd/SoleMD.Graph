/**
 * @jest-environment jsdom
 */
import { act, cleanup, renderHook } from "@testing-library/react";
import type { GraphBundleQueries } from "@solemd/graph";
import type { GraphRagQueryResponsePayload } from "@solemd/api-client/shared/graph-rag";

import { useDashboardStore } from "@/features/graph/stores";
import { useOrbFocusVisualStore } from "../../stores/focus-visual-store";
import {
  buildEvidencePulseResolutionSql,
  collectEvidencePulseRefs,
  useOrbEvidencePulseResolver,
} from "../use-orb-evidence-pulse-resolver";

interface QueryResult {
  rows: Array<{ particleIdx: number; intensity: number }>;
}

function buildQueries(runReadOnlyQuery: jest.Mock): GraphBundleQueries {
  return { runReadOnlyQuery } as unknown as GraphBundleQueries;
}

function buildResponse(): GraphRagQueryResponsePayload {
  return {
    meta: {
      request_id: "req-1",
      generated_at: "2026-04-26T00:00:00.000Z",
      duration_ms: 12,
      cache_control: "no-store",
      retrieval_version: "test",
    },
    release: {
      graph_release_id: "release",
      graph_run_id: "run",
      bundle_checksum: "checksum",
      graph_name: "test",
      layer_key: "paper",
      node_kind: "paper",
      is_current: true,
    },
    query: "bdnf",
    selected_layer_key: null,
    selected_node_id: null,
    selected_graph_paper_ref: null,
    selection_graph_paper_refs: [],
    selected_cluster_id: null,
    scope_mode: "global",
    answer: null,
    answer_model: null,
    answer_graph_paper_refs: ["paper-answer"],
    grounded_answer: null,
    results: [],
    evidence_bundles: [
      {
        corpus_id: 2,
        graph_paper_ref: "paper-result",
        paper_id: "paper-result",
        paper: {} as never,
        score: 0.9,
        rank: 2,
        snippet: null,
        matched_channels: [],
        match_reasons: [],
        rank_features: {},
        citation_contexts: [],
        entity_hits: [],
        relation_hits: [],
        references: [],
        assets: [],
      },
    ],
    graph_signals: [
      {
        corpus_id: 1,
        graph_paper_ref: "paper-answer",
        paper_id: "paper-answer",
        signal_kind: "answer_evidence",
        channel: "semantic_neighbor",
        score: 1,
        rank: 1,
        reason: null,
        matched_terms: [],
      },
      {
        corpus_id: 3,
        graph_paper_ref: "paper-neighbor",
        paper_id: "paper-neighbor",
        signal_kind: "semantic_neighbor",
        channel: "semantic_neighbor",
        score: 0.6,
        rank: 3,
        reason: null,
        matched_terms: [],
      },
    ],
    retrieval_channels: [],
    evidence_flags: {},
  };
}

async function flushRaf(): Promise<void> {
  await act(async () => {
    jest.advanceTimersByTime(20);
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("useOrbEvidencePulseResolver", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    useDashboardStore.setState({ ragResponse: null });
    useOrbFocusVisualStore.getState().reset();
  });

  afterEach(() => {
    cleanup();
    jest.useRealTimers();
    useDashboardStore.setState({ ragResponse: null });
    useOrbFocusVisualStore.getState().reset();
  });

  it("deduplicates graph refs and lets answer signals win intensity", () => {
    expect(collectEvidencePulseRefs(buildResponse())).toEqual(
      expect.arrayContaining([
        { graphPaperRef: "paper-answer", intensity: 255 },
        { graphPaperRef: "paper-result", intensity: 168 },
        { graphPaperRef: "paper-neighbor", intensity: 200 },
      ]),
    );
  });

  it("builds a paper_sample-backed B-lane resolution query", () => {
    const sql = buildEvidencePulseResolutionSql([
      { graphPaperRef: "paper-a", intensity: 255 },
    ]);

    expect(sql).toContain("FROM pulse_refs");
    expect(sql).toContain("JOIN paper_sample sample");
    expect(sql).toContain("sample.paperId = pulse_refs.graphPaperRef");
  });

  it("publishes resident evidence refs into the WebGPU visual store", async () => {
    const runReadOnlyQuery = jest
      .fn<Promise<QueryResult>, [string]>()
      .mockResolvedValue({
        rows: [
          { particleIdx: 2, intensity: 255 },
          { particleIdx: 4, intensity: 168 },
        ],
      });
    const queries = buildQueries(runReadOnlyQuery);

    renderHook(() =>
      useOrbEvidencePulseResolver({
        enabled: true,
        paperSampleReady: true,
        particleCount: 16,
        queries,
      }),
    );

    act(() => {
      useDashboardStore.setState({ ragResponse: buildResponse() });
    });
    await flushRaf();

    expect(runReadOnlyQuery).toHaveBeenCalledTimes(1);
    expect(useOrbFocusVisualStore.getState().evidenceIndices).toEqual([2, 4]);

    act(() => {
      useDashboardStore.setState({ ragResponse: null });
    });
    await flushRaf();

    expect(useOrbFocusVisualStore.getState().evidenceIndices).toEqual([]);
  });
});
