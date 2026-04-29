import {
  selectOrbFocusVisualActive,
  useOrbFocusVisualStore,
} from "../focus-visual-store";

describe("focus-visual-store pending lane", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    useOrbFocusVisualStore.getState().reset();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    useOrbFocusVisualStore.getState().reset();
  });

  it("setPendingParticleIndices normalizes indices, bumps pendingRevision/revision, records dispatch revision", () => {
    const before = useOrbFocusVisualStore.getState();
    expect(before.pendingParticleIndices).toEqual([]);
    expect(before.pendingRevision).toBe(0);
    expect(before.pendingDispatchRevision).toBe(0);

    useOrbFocusVisualStore.getState().setPendingParticleIndices([5, 1, 1, 3], 7);

    const after = useOrbFocusVisualStore.getState();
    expect(after.pendingParticleIndices).toEqual([1, 3, 5]);
    expect(after.pendingRevision).toBe(before.pendingRevision + 1);
    expect(after.revision).toBe(before.revision + 1);
    expect(after.pendingDispatchRevision).toBe(7);
  });

  it("setPendingParticleIndices with same indices but newer dispatch updates barrier without bumping pendingRevision", () => {
    useOrbFocusVisualStore.getState().setPendingParticleIndices([2, 4], 3);
    const afterFirst = useOrbFocusVisualStore.getState();
    expect(afterFirst.pendingDispatchRevision).toBe(3);

    useOrbFocusVisualStore.getState().setPendingParticleIndices([2, 4], 9);
    const afterSecond = useOrbFocusVisualStore.getState();
    expect(afterSecond.pendingParticleIndices).toEqual([2, 4]);
    expect(afterSecond.pendingDispatchRevision).toBe(9);
    // pending lane unchanged so the shader-relevant revisions stay flat
    expect(afterSecond.pendingRevision).toBe(afterFirst.pendingRevision);
    expect(afterSecond.revision).toBe(afterFirst.revision);
  });

  it("clearPending empties pending and bumps revisions, but leaves pendingDispatchRevision alone", () => {
    useOrbFocusVisualStore.getState().setPendingParticleIndices([1, 2, 3], 11);
    const armed = useOrbFocusVisualStore.getState();
    expect(armed.pendingParticleIndices).toEqual([1, 2, 3]);
    expect(armed.pendingDispatchRevision).toBe(11);

    useOrbFocusVisualStore.getState().clearPending();
    const cleared = useOrbFocusVisualStore.getState();
    expect(cleared.pendingParticleIndices).toEqual([]);
    expect(cleared.pendingRevision).toBe(armed.pendingRevision + 1);
    expect(cleared.revision).toBe(armed.revision + 1);
    expect(cleared.pendingDispatchRevision).toBe(11);
  });

  it("selectOrbFocusVisualActive returns true with only pending set", () => {
    expect(selectOrbFocusVisualActive(useOrbFocusVisualStore.getState())).toBe(
      false,
    );

    useOrbFocusVisualStore.getState().setPendingParticleIndices([42], 1);

    expect(selectOrbFocusVisualActive(useOrbFocusVisualStore.getState())).toBe(
      true,
    );
  });

  it("reset clears pending fields", () => {
    useOrbFocusVisualStore.getState().setPendingParticleIndices([7, 8], 5);
    expect(
      useOrbFocusVisualStore.getState().pendingParticleIndices.length,
    ).toBeGreaterThan(0);

    useOrbFocusVisualStore.getState().reset();

    const state = useOrbFocusVisualStore.getState();
    expect(state.pendingParticleIndices).toEqual([]);
    expect(state.pendingRevision).toBe(0);
    expect(state.pendingDispatchRevision).toBe(0);
  });

  it("hard-timeout fallback clears pending after 400ms when revision unchanged", () => {
    useOrbFocusVisualStore.getState().setPendingParticleIndices([10, 11], 4);
    expect(useOrbFocusVisualStore.getState().pendingParticleIndices).toEqual([
      10, 11,
    ]);

    jest.advanceTimersByTime(399);
    expect(useOrbFocusVisualStore.getState().pendingParticleIndices).toEqual([
      10, 11,
    ]);

    jest.advanceTimersByTime(1);
    expect(useOrbFocusVisualStore.getState().pendingParticleIndices).toEqual(
      [],
    );
  });

  it("hard-timeout fallback skips clear if a newer pending replaced the revision", () => {
    useOrbFocusVisualStore.getState().setPendingParticleIndices([1], 1);
    const firstRevision = useOrbFocusVisualStore.getState().pendingRevision;

    // Advance partway, then write a newer pending so the second timeout
    // is staggered relative to the first.
    jest.advanceTimersByTime(100);
    useOrbFocusVisualStore.getState().setPendingParticleIndices([2, 3], 2);
    expect(useOrbFocusVisualStore.getState().pendingRevision).toBeGreaterThan(
      firstRevision,
    );

    // Fires the first timeout (scheduled at t=0, fires at t=400). Captured
    // revision no longer matches the live one; it must not clear.
    jest.advanceTimersByTime(300);
    expect(useOrbFocusVisualStore.getState().pendingParticleIndices).toEqual([
      2, 3,
    ]);

    // Second timeout (scheduled at t=100, fires at t=500) now fires with
    // its captured revision matching, and clears the lane.
    jest.advanceTimersByTime(100);
    expect(useOrbFocusVisualStore.getState().pendingParticleIndices).toEqual(
      [],
    );
  });
});
