import { createFieldSceneState } from "../../scene/visual-presets";
import { createFieldSceneStore } from "../field-scene-store";

describe("field-scene-store", () => {
  it("notifies all subscribed listeners", () => {
    const store = createFieldSceneStore();
    const a = jest.fn();
    const b = jest.fn();
    const unsubA = store.subscribe(a);
    const unsubB = store.subscribe(b);

    store.notify();
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);

    unsubA();
    store.notify();
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(2);

    unsubB();
  });

  it("stores and clears the current scene state", () => {
    const state = createFieldSceneState();
    const store = createFieldSceneStore();

    expect(store.getCurrentState()).toBeNull();
    store.setCurrentState(state);
    expect(store.getCurrentState()).toBe(state);
    store.setCurrentState(null);
    expect(store.getCurrentState()).toBeNull();
  });
});
