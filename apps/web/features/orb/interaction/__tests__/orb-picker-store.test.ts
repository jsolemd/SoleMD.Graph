import {
  useOrbPickerStore,
  type OrbPickerHandle,
} from "../orb-picker-store";

// Baseline reset so tests don't leak state into each other.
const initial = useOrbPickerStore.getState();

describe("orb-picker-store", () => {
  beforeEach(() => {
    useOrbPickerStore.setState({ ...initial, handle: null });
  });

  it("setHandle publishes and replaces the live handle", () => {
    const a: OrbPickerHandle = { pickSync: () => 1 };
    const b: OrbPickerHandle = { pickSync: () => 2 };

    useOrbPickerStore.getState().setHandle(a);
    expect(useOrbPickerStore.getState().handle).toBe(a);

    useOrbPickerStore.getState().setHandle(b);
    expect(useOrbPickerStore.getState().handle).toBe(b);

    useOrbPickerStore.getState().setHandle(null);
    expect(useOrbPickerStore.getState().handle).toBeNull();
  });

  // React 19 + StrictMode can sequence effects as mount A → mount B →
  // cleanup A. A naive `setHandle(null)` cleanup would clear handle B.
  // clearHandleIfMatches only clears when the live handle is the one
  // being retracted, so the stale cleanup becomes a no-op.
  it("clearHandleIfMatches clears only when identity matches", () => {
    const a: OrbPickerHandle = { pickSync: () => 1 };
    const b: OrbPickerHandle = { pickSync: () => 2 };

    useOrbPickerStore.getState().setHandle(a);
    useOrbPickerStore.getState().setHandle(b);

    // Simulate out-of-order StrictMode cleanup for A after B mounted.
    useOrbPickerStore.getState().clearHandleIfMatches(a);
    expect(useOrbPickerStore.getState().handle).toBe(b);

    // Cleanup for the currently-live handle does clear.
    useOrbPickerStore.getState().clearHandleIfMatches(b);
    expect(useOrbPickerStore.getState().handle).toBeNull();
  });

  it("clearHandleIfMatches is a no-op when no handle is set", () => {
    const a: OrbPickerHandle = { pickSync: () => 1 };
    expect(useOrbPickerStore.getState().handle).toBeNull();
    useOrbPickerStore.getState().clearHandleIfMatches(a);
    expect(useOrbPickerStore.getState().handle).toBeNull();
  });
});
