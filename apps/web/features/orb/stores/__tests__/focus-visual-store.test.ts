import {
  selectOrbFocusVisualActive,
  useOrbFocusVisualStore,
} from "../focus-visual-store";

describe("focus-visual-store", () => {
  beforeEach(() => {
    useOrbFocusVisualStore.getState().reset();
  });

  afterEach(() => {
    useOrbFocusVisualStore.getState().reset();
  });

  it("activates shader dimming for a focused particle", () => {
    expect(selectOrbFocusVisualActive(useOrbFocusVisualStore.getState())).toBe(
      false,
    );

    useOrbFocusVisualStore.getState().setFocusIndex(7);

    expect(selectOrbFocusVisualActive(useOrbFocusVisualStore.getState())).toBe(
      true,
    );
  });

  it("activates shader dimming for an explicit selected set", () => {
    expect(selectOrbFocusVisualActive(useOrbFocusVisualStore.getState())).toBe(
      false,
    );

    useOrbFocusVisualStore.getState().setSelectionIndices([9, 3, 3]);

    expect(useOrbFocusVisualStore.getState().selectionIndices).toEqual([3, 9]);
    expect(selectOrbFocusVisualActive(useOrbFocusVisualStore.getState())).toBe(
      true,
    );
  });

  it("activates shader dimming for the current filter scope", () => {
    expect(selectOrbFocusVisualActive(useOrbFocusVisualStore.getState())).toBe(
      false,
    );

    useOrbFocusVisualStore.getState().setScopeIndices([12, 4, 4]);

    expect(useOrbFocusVisualStore.getState().scopeIndices).toEqual([4, 12]);
    expect(selectOrbFocusVisualActive(useOrbFocusVisualStore.getState())).toBe(
      true,
    );
  });

  it("activates shader dimming for highlighted neighbors", () => {
    expect(selectOrbFocusVisualActive(useOrbFocusVisualStore.getState())).toBe(
      false,
    );

    useOrbFocusVisualStore.getState().setNeighborIndices([8, 4, 4]);

    expect(useOrbFocusVisualStore.getState().neighborIndices).toEqual([4, 8]);
    expect(selectOrbFocusVisualActive(useOrbFocusVisualStore.getState())).toBe(
      true,
    );
  });

  it("deactivates shader dimming after focus and selected set clear", () => {
    const store = useOrbFocusVisualStore.getState();
    store.setFocusIndex(2);
    store.setSelectionIndices([5]);
    store.setScopeIndices([4]);
    store.setNeighborIndices([6]);

    expect(selectOrbFocusVisualActive(useOrbFocusVisualStore.getState())).toBe(
      true,
    );

    useOrbFocusVisualStore.getState().reset();

    expect(selectOrbFocusVisualActive(useOrbFocusVisualStore.getState())).toBe(
      false,
    );
  });
});
