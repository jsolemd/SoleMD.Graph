import {
  useOrbGeometryMutationStore,
  type PaperChunk,
} from "../geometry-mutation-store";

function buildChunk(offset: number): PaperChunk {
  const attributes = new Map();
  attributes.set(offset, {
    paperId: `paper-${offset}`,
    clusterId: 0,
    refCount: offset,
    entityCount: 1,
    relationCount: 0,
    year: null,
  });
  return {
    attributes,
    maxima: { refCount: offset, entityCount: 1 },
  };
}

describe("useOrbGeometryMutationStore", () => {
  beforeEach(() => {
    useOrbGeometryMutationStore.getState().reset();
  });

  it("accumulates chunks in FIFO order", () => {
    const { addChunk } = useOrbGeometryMutationStore.getState();
    addChunk(buildChunk(0));
    addChunk(buildChunk(1));
    const { chunks } = useOrbGeometryMutationStore.getState();
    expect(chunks).toHaveLength(2);
    expect(chunks[0]!.attributes.get(0)!.paperId).toBe("paper-0");
    expect(chunks[1]!.attributes.get(1)!.paperId).toBe("paper-1");
  });

  it("notifies subscribers with new chunk state when added", () => {
    const seen: number[] = [];
    const unsub = useOrbGeometryMutationStore.subscribe((state) => {
      seen.push(state.chunks.length);
    });
    useOrbGeometryMutationStore.getState().addChunk(buildChunk(0));
    useOrbGeometryMutationStore.getState().addChunk(buildChunk(1));
    unsub();
    expect(seen).toEqual([1, 2]);
  });

  it("reset clears accumulated chunks", () => {
    const { addChunk, reset } = useOrbGeometryMutationStore.getState();
    addChunk(buildChunk(0));
    expect(useOrbGeometryMutationStore.getState().chunks).toHaveLength(1);
    reset();
    expect(useOrbGeometryMutationStore.getState().chunks).toHaveLength(0);
  });
});
