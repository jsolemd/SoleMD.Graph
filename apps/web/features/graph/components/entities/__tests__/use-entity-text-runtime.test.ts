/**
 * @jest-environment jsdom
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import {
  fetchGraphEntityMatches,
} from "@/features/graph/lib/entity-service";
import { useEntityTextRuntime } from "../use-entity-text-runtime";

jest.mock("@/features/graph/lib/entity-service", () => ({
  fetchGraphEntityMatches: jest.fn(),
}));

const mockedFetchGraphEntityMatches =
  fetchGraphEntityMatches as jest.MockedFunction<typeof fetchGraphEntityMatches>;

const SCHIZOPHRENIA_MATCH = {
  matchId: "disease:MESH:D012559:38:52",
  entityType: "disease",
  conceptNamespace: "mesh",
  conceptId: "D012559",
  sourceIdentifier: "MESH:D012559",
  canonicalName: "Schizophrenia",
  matchedText: "schizophrenia",
  aliasText: "schizophrenia",
  aliasSource: "canonical_name",
  isCanonical: true,
  paperCount: 1200,
  startOffset: 38,
  endOffset: 52,
  score: 1,
};

describe("useEntityTextRuntime", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockedFetchGraphEntityMatches.mockReset();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it("matches canonical entities for a text scope", async () => {
    mockedFetchGraphEntityMatches.mockResolvedValue({
      matches: [SCHIZOPHRENIA_MATCH],
    });

    const { result } = renderHook(() =>
      useEntityTextRuntime({
        enabled: true,
      }),
    );

    act(() => {
      result.current.handleTextScopeChange({
        text: "Dopamine dysfunction is implicated in schizophrenia.",
        textFrom: 5,
        cursorOffset: 52,
      });
    });

    await act(async () => {
      jest.advanceTimersByTime(350);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(result.current.entityMatches).toHaveLength(1);
    });

    expect(result.current.entityMatches[0]).toEqual(
      expect.objectContaining({
        matchedText: "schizophrenia",
        startOffset: 38,
        endOffset: 52,
        sourceIdentifier: "MESH:D012559",
      }),
    );
  });

  it("does not re-fetch when only cursorOffset changes within the same paragraph", async () => {
    mockedFetchGraphEntityMatches.mockResolvedValue({
      matches: [SCHIZOPHRENIA_MATCH],
    });

    const { result } = renderHook(() =>
      useEntityTextRuntime({ enabled: true }),
    );

    act(() => {
      result.current.handleTextScopeChange({
        text: "Dopamine dysfunction is implicated in schizophrenia.",
        textFrom: 5,
        cursorOffset: 3,
      });
    });

    await act(async () => {
      jest.advanceTimersByTime(350);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(result.current.entityMatches).toHaveLength(1);
    });

    expect(mockedFetchGraphEntityMatches).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.handleTextScopeChange({
        text: "Dopamine dysfunction is implicated in schizophrenia.",
        textFrom: 5,
        cursorOffset: 38,
      });
    });

    await act(async () => {
      jest.advanceTimersByTime(350);
      await Promise.resolve();
    });

    expect(mockedFetchGraphEntityMatches).toHaveBeenCalledTimes(1);
  });

  it("debounces fetch to stable window and passes AbortSignal", async () => {
    // Only one fetch should fire (scope B); scope A's timer is cancelled.
    mockedFetchGraphEntityMatches
      .mockResolvedValueOnce({ matches: [SCHIZOPHRENIA_MATCH] });

    const { result } = renderHook(() =>
      useEntityTextRuntime({ enabled: true }),
    );

    // Set first scope — fetch should NOT fire before debounce window
    act(() => {
      result.current.handleTextScopeChange({
        text: "First sentence about dopamine.",
        textFrom: 1,
        cursorOffset: 10,
      });
    });

    await act(async () => {
      jest.advanceTimersByTime(100);
      await Promise.resolve();
    });

    expect(mockedFetchGraphEntityMatches).toHaveBeenCalledTimes(0);

    // Change text before debounce fires — first timer is cancelled, no fetch
    act(() => {
      result.current.handleTextScopeChange({
        text: "Second sentence about schizophrenia.",
        textFrom: 1,
        cursorOffset: 10,
      });
    });

    // Advance past debounce for second scope — only second fetch fires
    await act(async () => {
      jest.advanceTimersByTime(350);
    });

    // First scope never fetched because its timer was cancelled.
    // Only the second scope fetched after its debounce window.
    expect(mockedFetchGraphEntityMatches).toHaveBeenCalledTimes(1);
    const callOptions = mockedFetchGraphEntityMatches.mock.calls[0][1];
    expect(callOptions).toBeDefined();
    expect(callOptions!.signal).toBeInstanceOf(AbortSignal);

    // Flush the resolved fetch promise chain (.then chains) so matches commit
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.entityMatches[0]).toEqual(
      expect.objectContaining({ sourceIdentifier: "MESH:D012559" }),
    );
  });

  it("aborts in-flight request when text changes after debounce fires", async () => {
    let resolveFirst: (value: { matches: typeof SCHIZOPHRENIA_MATCH[] }) => void;
    const firstPromise = new Promise<{ matches: typeof SCHIZOPHRENIA_MATCH[] }>(
      (resolve) => { resolveFirst = resolve; },
    );
    mockedFetchGraphEntityMatches
      .mockImplementationOnce(() => firstPromise)
      .mockResolvedValueOnce({ matches: [SCHIZOPHRENIA_MATCH] });

    const { result } = renderHook(() =>
      useEntityTextRuntime({ enabled: true }),
    );

    // Set scope A and let debounce fire — fetch A starts
    act(() => {
      result.current.handleTextScopeChange({
        text: "First sentence about dopamine.",
        textFrom: 1,
        cursorOffset: 10,
      });
    });

    await act(async () => {
      jest.advanceTimersByTime(350);
      await Promise.resolve();
    });

    expect(mockedFetchGraphEntityMatches).toHaveBeenCalledTimes(1);
    const firstSignal = mockedFetchGraphEntityMatches.mock.calls[0][1]!.signal!;

    // Change text while fetch A is still in-flight — A is aborted
    act(() => {
      result.current.handleTextScopeChange({
        text: "Second sentence about schizophrenia.",
        textFrom: 1,
        cursorOffset: 10,
      });
    });

    // The effect cleanup aborts A immediately
    expect(firstSignal.aborted).toBe(true);

    // Let scope B debounce and fetch
    await act(async () => {
      jest.advanceTimersByTime(350);
      await Promise.resolve();
    });

    expect(mockedFetchGraphEntityMatches).toHaveBeenCalledTimes(2);

    resolveFirst!({ matches: [] });

    await waitFor(() => {
      expect(result.current.entityMatches).toHaveLength(1);
    });

    expect(result.current.entityMatches[0]).toEqual(
      expect.objectContaining({ sourceIdentifier: "MESH:D012559" }),
    );
  });
});
