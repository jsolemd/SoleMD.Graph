/**
 * @jest-environment jsdom
 */
import { act, cleanup, renderHook } from "@testing-library/react";

import {
  ORB_ESCAPE_DOUBLE_TAP_MS,
  useOrbSelectionEscape,
} from "../use-orb-selection-escape";

function fireEscape(
  timeStamp: number,
  init: KeyboardEventInit = {},
): KeyboardEvent {
  const event = new KeyboardEvent("keydown", {
    key: "Escape",
    cancelable: true,
    bubbles: true,
    ...init,
  });
  Object.defineProperty(event, "timeStamp", { value: timeStamp });
  act(() => {
    window.dispatchEvent(event);
  });
  return event;
}

describe("useOrbSelectionEscape", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  afterEach(() => {
    cleanup();
  });

  it("single Escape clears the active orb selection", () => {
    const onClearSelection = jest.fn();
    const onClearAllSelection = jest.fn();
    renderHook(() =>
      useOrbSelectionEscape({ onClearSelection, onClearAllSelection }),
    );

    const event = fireEscape(1_000);

    expect(event.defaultPrevented).toBe(true);
    expect(onClearSelection).toHaveBeenCalledTimes(1);
    expect(onClearAllSelection).not.toHaveBeenCalled();
  });

  it("second Escape inside the double-tap window clears all selection context", () => {
    const onClearSelection = jest.fn();
    const onClearAllSelection = jest.fn();
    renderHook(() =>
      useOrbSelectionEscape({ onClearSelection, onClearAllSelection }),
    );

    fireEscape(1_000);
    fireEscape(1_000 + ORB_ESCAPE_DOUBLE_TAP_MS - 1);

    expect(onClearSelection).toHaveBeenCalledTimes(1);
    expect(onClearAllSelection).toHaveBeenCalledTimes(1);
  });

  it("Escape after the window is another selection clear, not clear-all", () => {
    const onClearSelection = jest.fn();
    const onClearAllSelection = jest.fn();
    renderHook(() =>
      useOrbSelectionEscape({ onClearSelection, onClearAllSelection }),
    );

    fireEscape(1_000);
    fireEscape(1_000 + ORB_ESCAPE_DOUBLE_TAP_MS + 1);

    expect(onClearSelection).toHaveBeenCalledTimes(2);
    expect(onClearAllSelection).not.toHaveBeenCalled();
  });

  it("ignores key repeat so holding Escape cannot trigger clear-all", () => {
    const onClearSelection = jest.fn();
    const onClearAllSelection = jest.fn();
    renderHook(() =>
      useOrbSelectionEscape({ onClearSelection, onClearAllSelection }),
    );

    fireEscape(1_000);
    fireEscape(1_050, { repeat: true });

    expect(onClearSelection).toHaveBeenCalledTimes(1);
    expect(onClearAllSelection).not.toHaveBeenCalled();
  });

  it("does not steal Escape from editable targets", () => {
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    const onClearSelection = jest.fn();
    const onClearAllSelection = jest.fn();
    renderHook(() =>
      useOrbSelectionEscape({ onClearSelection, onClearAllSelection }),
    );

    const event = fireEscape(1_000);

    expect(event.defaultPrevented).toBe(false);
    expect(onClearSelection).not.toHaveBeenCalled();
    expect(onClearAllSelection).not.toHaveBeenCalled();
  });

  it("does not listen when disabled", () => {
    const onClearSelection = jest.fn();
    const onClearAllSelection = jest.fn();
    renderHook(() =>
      useOrbSelectionEscape({
        enabled: false,
        onClearSelection,
        onClearAllSelection,
      }),
    );

    fireEscape(1_000);

    expect(onClearSelection).not.toHaveBeenCalled();
    expect(onClearAllSelection).not.toHaveBeenCalled();
  });
});
