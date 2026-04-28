/**
 * @jest-environment jsdom
 */
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { AsyncDuckDBConnection } from "@duckdb/duckdb-wasm";

import { useOrbFocusVisualStore } from "@/features/orb/stores/focus-visual-store";
import { useActiveLinks } from "../use-active-links";

interface MockTableRow {
  srcPaperId: string;
  dstPaperId: string;
  weight?: number | null;
  kind?: string | null;
  sourceBitmap?: number;
}

function makeTable(rows: MockTableRow[]) {
  return {
    toArray: () => rows,
  };
}

function makeConnection(
  query: jest.Mock,
): { connection: AsyncDuckDBConnection; query: jest.Mock } {
  return {
    connection: { query } as unknown as AsyncDuckDBConnection,
    query,
  };
}

describe("useActiveLinks", () => {
  afterEach(() => {
    cleanup();
    useOrbFocusVisualStore.getState().reset();
  });

  it("returns an empty buffer when the active links view is absent", async () => {
    const { connection } = makeConnection(
      jest
        .fn()
        .mockRejectedValue(
          new Error("Catalog Error: Table with name active_links_web does not exist"),
        ),
    );

    const { result } = renderHook(() =>
      useActiveLinks({
        connection,
        activeLayer: "corpus",
        currentPointScopeSql: null,
        residentPaperIds: ["paper-1", "paper-2"],
      }),
    );

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.error).toBeNull();
    expect(result.current.edges).toEqual([]);
  });

  it("threads currentPointScopeSql into the shared active-links query", async () => {
    const { connection, query } = makeConnection(
      jest.fn().mockResolvedValue(
        makeTable([
          {
            srcPaperId: "paper-1",
            dstPaperId: "paper-2",
            weight: 0.8,
            kind: "citation",
            sourceBitmap: 1,
          },
        ]),
      ),
    );

    const { result } = renderHook(() =>
      useActiveLinks({
        connection,
        activeLayer: "corpus",
        currentPointScopeSql: "year >= 2020",
        residentPaperIds: ["paper-1", "paper-2"],
      }),
    );

    await waitFor(() => expect(result.current.status).toBe("ready"));

    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]?.[0]).toContain("FROM active_links_web");
    expect(query.mock.calls[0]?.[0]).toContain("FROM orb_entity_edges_current");
    expect(query.mock.calls[0]?.[0]).toContain("resident_papers");
    expect(query.mock.calls[0]?.[0]).toContain("WHERE year >= 2020");
    expect(result.current.edges).toEqual([
      {
        srcPaperId: "paper-1",
        dstPaperId: "paper-2",
        weight: 0.8,
        kind: "citation",
        sourceBitmap: 1,
      },
    ]);
  });

  it("does not refetch when orb hover state changes", async () => {
    const { connection, query } = makeConnection(
      jest.fn().mockResolvedValue(
        makeTable([
          {
            srcPaperId: "paper-1",
            dstPaperId: "paper-2",
          },
        ]),
      ),
    );

    const { result } = renderHook(() =>
      useActiveLinks({
        connection,
        activeLayer: "corpus",
        currentPointScopeSql: null,
        residentPaperIds: ["paper-1", "paper-2"],
      }),
    );

    await waitFor(() => expect(result.current.status).toBe("ready"));

    act(() => {
      useOrbFocusVisualStore.getState().setHoverIndex(4);
    });

    expect(query).toHaveBeenCalledTimes(1);
    expect(result.current.edges).toHaveLength(1);
  });

  it("does not query until a resident paper set is available", async () => {
    const { connection, query } = makeConnection(
      jest.fn().mockResolvedValue(makeTable([])),
    );

    const { result } = renderHook(() =>
      useActiveLinks({
        connection,
        activeLayer: "corpus",
        currentPointScopeSql: null,
        residentPaperIds: [],
      }),
    );

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(query).not.toHaveBeenCalled();
    expect(result.current.edges).toEqual([]);
  });

  it("drops edges whose endpoints are outside the resident paper set", async () => {
    const { connection } = makeConnection(
      jest.fn().mockResolvedValue(
        makeTable([
          {
            srcPaperId: "paper-1",
            dstPaperId: "paper-2",
            weight: 1,
          },
          {
            srcPaperId: "paper-1",
            dstPaperId: "paper-3",
            weight: 1,
          },
        ]),
      ),
    );

    const { result } = renderHook(() =>
      useActiveLinks({
        connection,
        activeLayer: "corpus",
        currentPointScopeSql: null,
        residentPaperIds: ["paper-1", "paper-2"],
      }),
    );

    await waitFor(() => expect(result.current.status).toBe("ready"));

    expect(result.current.edges.map((edge) => [edge.srcPaperId, edge.dstPaperId])).toEqual([
      ["paper-1", "paper-2"],
    ]);
  });
});
