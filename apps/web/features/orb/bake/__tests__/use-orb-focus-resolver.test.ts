/**
 * @jest-environment jsdom
 */
import { act, cleanup, renderHook } from "@testing-library/react";
import type { GraphBundleQueries, GraphPointRecord } from "@solemd/graph";

import {
  getParticleStateData,
  PARTICLE_STATE_LANES,
  resetParticleStateTexture,
} from "@/features/field/renderer/field-particle-state-texture";
import { useGraphStore } from "@/features/graph/stores";
import { useOrbFocusVisualStore } from "../../stores/focus-visual-store";
import { useOrbScopeMutationStore } from "../../stores/scope-mutation-store";
import { useOrbFocusResolver } from "../use-orb-focus-resolver";
import { useOrbHoverResolver } from "../use-orb-hover-resolver";

interface QueryResult {
  rows: Array<{ particleIdx: number; isFocus?: boolean }>;
}

function buildQueries(runReadOnlyQuery: jest.Mock): GraphBundleQueries {
  return { runReadOnlyQuery } as unknown as GraphBundleQueries;
}

function buildPoint(overrides: Partial<GraphPointRecord> = {}): GraphPointRecord {
  return {
    index: 7,
    id: "point-7",
    paperId: "paper-7",
    nodeKind: "paper",
    nodeRole: "primary",
    color: "#000000",
    colorLight: "#ffffff",
    x: 0,
    y: 0,
    clusterId: 1,
    clusterLabel: null,
    displayLabel: "Paper 7",
    displayPreview: null,
    paperTitle: "Paper 7",
    citekey: null,
    journal: null,
    year: null,
    semanticGroups: null,
    relationCategories: null,
    textAvailability: null,
    paperAuthorCount: null,
    paperReferenceCount: null,
    paperEntityCount: null,
    paperRelationCount: null,
    isInBase: true,
    baseRank: null,
    isOverlayActive: false,
    ...overrides,
  };
}

function gByte(index: number): number {
  return index * PARTICLE_STATE_LANES + 1;
}

async function flushRaf(count = 1): Promise<void> {
  for (let i = 0; i < count; i += 1) {
    await act(async () => {
      jest.advanceTimersByTime(20);
      await Promise.resolve();
      await Promise.resolve();
    });
  }
}

describe("useOrbFocusResolver", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    resetParticleStateTexture();
    useGraphStore.setState(useGraphStore.getInitialState());
    useOrbFocusVisualStore.getState().reset();
    useOrbScopeMutationStore.getState().reset();
  });

  afterEach(() => {
    cleanup();
    jest.useRealTimers();
    resetParticleStateTexture();
    useGraphStore.setState(useGraphStore.getInitialState());
    useOrbFocusVisualStore.getState().reset();
    useOrbScopeMutationStore.getState().reset();
  });

  it("writes a full-intensity G lane spotlight for selectedNode", async () => {
    const runReadOnlyQuery = jest
      .fn<Promise<QueryResult>, [string]>()
      .mockResolvedValue({ rows: [{ particleIdx: 5, isFocus: true }] });
    const queries = buildQueries(runReadOnlyQuery);

    renderHook(() => {
      useOrbFocusResolver({
        enabled: true,
        paperSampleReady: true,
        particleCount: 16,
        queries,
      });
      useOrbHoverResolver({ enabled: true, particleCount: 16 });
    });

    act(() => {
      useGraphStore.getState().selectNode(buildPoint());
    });
    await flushRaf(3);

    expect(runReadOnlyQuery).toHaveBeenCalledTimes(1);
    expect(runReadOnlyQuery.mock.calls[0]?.[0]).toContain("paper-7");
    expect(runReadOnlyQuery.mock.calls[0]?.[0]).toContain("base_links_web");
    expect(getParticleStateData()[gByte(5)]).toBe(255);
  });

  it("writes lower-intensity G lane highlights for focus neighbors", async () => {
    const runReadOnlyQuery = jest
      .fn<Promise<QueryResult>, [string]>()
      .mockResolvedValue({
        rows: [
          { particleIdx: 5, isFocus: true },
          { particleIdx: 6, isFocus: false },
          { particleIdx: 9, isFocus: false },
        ],
      });
    const queries = buildQueries(runReadOnlyQuery);

    renderHook(() => {
      useOrbFocusResolver({
        enabled: true,
        paperSampleReady: true,
        particleCount: 16,
        queries,
      });
      useOrbHoverResolver({ enabled: true, particleCount: 16 });
    });

    act(() => {
      useGraphStore.getState().selectNode(buildPoint());
    });
    await flushRaf(3);

    expect(useOrbFocusVisualStore.getState().neighborIndices).toEqual([6, 9]);
    expect(getParticleStateData()[gByte(5)]).toBe(255);
    expect(getParticleStateData()[gByte(6)]).toBe(96);
    expect(getParticleStateData()[gByte(9)]).toBe(96);
  });

  it("clears the focused G lane when selectedNode clears", async () => {
    const runReadOnlyQuery = jest
      .fn<Promise<QueryResult>, [string]>()
      .mockResolvedValue({ rows: [{ particleIdx: 5, isFocus: true }] });
    const queries = buildQueries(runReadOnlyQuery);

    renderHook(() => {
      useOrbFocusResolver({
        enabled: true,
        paperSampleReady: true,
        particleCount: 16,
        queries,
      });
      useOrbHoverResolver({ enabled: true, particleCount: 16 });
    });

    act(() => {
      useGraphStore.getState().selectNode(buildPoint());
    });
    await flushRaf(3);
    expect(getParticleStateData()[gByte(5)]).toBe(255);

    act(() => {
      useGraphStore.getState().selectNode(null);
    });
    await flushRaf(2);

    expect(getParticleStateData()[gByte(5)]).toBe(0);
  });

  it("clears focus when the selected paper is not resident", async () => {
    const runReadOnlyQuery = jest
      .fn<Promise<QueryResult>, [string]>()
      .mockResolvedValueOnce({ rows: [{ particleIdx: 5, isFocus: true }] })
      .mockResolvedValueOnce({ rows: [] });
    const queries = buildQueries(runReadOnlyQuery);

    renderHook(() => {
      useOrbFocusResolver({
        enabled: true,
        paperSampleReady: true,
        particleCount: 16,
        queries,
      });
      useOrbHoverResolver({ enabled: true, particleCount: 16 });
    });

    act(() => {
      useGraphStore.getState().selectNode(buildPoint());
    });
    await flushRaf(3);
    expect(getParticleStateData()[gByte(5)]).toBe(255);

    act(() => {
      useGraphStore.getState().selectNode(
        buildPoint({ id: "missing-point", paperId: "missing-paper" }),
      );
    });
    await flushRaf(3);

    expect(getParticleStateData()[gByte(5)]).toBe(0);
  });
});
