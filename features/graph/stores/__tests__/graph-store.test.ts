/**
 * @jest-environment jsdom
 */
import { act } from "@testing-library/react";
import { useGraphStore } from "../graph-store";

describe("graph-store", () => {
  beforeEach(() => {
    useGraphStore.setState(useGraphStore.getInitialState());
  });

  it("does not emit when setting the same mode", () => {
    const listener = jest.fn();
    const unsubscribe = useGraphStore.subscribe(listener);

    act(() => {
      useGraphStore.getState().setMode("ask");
    });

    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });
});
