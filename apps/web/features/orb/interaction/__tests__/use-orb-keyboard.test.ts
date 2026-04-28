/**
 * @jest-environment jsdom
 */
import { act, renderHook } from "@testing-library/react";

import type { OrbWebGpuControlHandle } from "../../webgpu/orb-webgpu-runtime-store";
import {
  ORB_PAN_KEY_NDC,
  ORB_ZOOM_KEY_FACTOR,
  useOrbKeyboard,
} from "../use-orb-keyboard";

interface KeyboardOptions {
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
}

function pressKey(key: string, options: KeyboardOptions = {}): KeyboardEvent {
  const event = new KeyboardEvent("keydown", {
    bubbles: true,
    cancelable: true,
    key,
    ctrlKey: options.ctrlKey ?? false,
    metaKey: options.metaKey ?? false,
    altKey: options.altKey ?? false,
  });
  window.dispatchEvent(event);
  return event;
}

function buildHandle(): jest.Mocked<OrbWebGpuControlHandle> {
  return {
    applyTwist: jest.fn(),
    applyZoom: jest.fn(),
    applyPan: jest.fn(),
    resetView: jest.fn(),
  };
}

describe("useOrbKeyboard", () => {
  it("routes camera keys to the runtime handle", () => {
    const handle = buildHandle();
    renderHook(() =>
      useOrbKeyboard({ getHandle: () => handle }),
    );

    act(() => {
      pressKey("+");
      pressKey("-");
      pressKey("ArrowLeft");
      pressKey("ArrowRight");
      pressKey("ArrowUp");
      pressKey("ArrowDown");
      pressKey(",");
      pressKey(".");
      pressKey("0");
    });

    expect(handle.applyZoom).toHaveBeenCalledWith(ORB_ZOOM_KEY_FACTOR);
    expect(handle.applyZoom).toHaveBeenCalledWith(1 / ORB_ZOOM_KEY_FACTOR);
    // Camera convention: ArrowLeft = positive pan (world shifts right).
    expect(handle.applyPan).toHaveBeenCalledWith(ORB_PAN_KEY_NDC, 0);
    expect(handle.applyPan).toHaveBeenCalledWith(-ORB_PAN_KEY_NDC, 0);
    expect(handle.applyPan).toHaveBeenCalledWith(0, -ORB_PAN_KEY_NDC);
    expect(handle.applyPan).toHaveBeenCalledWith(0, ORB_PAN_KEY_NDC);
    expect(handle.applyTwist).toHaveBeenCalledTimes(2);
    expect(handle.resetView).toHaveBeenCalledTimes(1);
  });

  it("ignores keys with Ctrl, Meta, or Alt modifiers", () => {
    const handle = buildHandle();
    renderHook(() => useOrbKeyboard({ getHandle: () => handle }));

    act(() => {
      pressKey("+", { ctrlKey: true });
      pressKey("=", { metaKey: true });
      pressKey("ArrowLeft", { altKey: true });
    });

    expect(handle.applyZoom).not.toHaveBeenCalled();
    expect(handle.applyPan).not.toHaveBeenCalled();
  });

  it("skips when an editable element has focus", () => {
    const handle = buildHandle();
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    renderHook(() => useOrbKeyboard({ getHandle: () => handle }));

    act(() => {
      pressKey("+");
      pressKey("ArrowLeft");
    });

    expect(handle.applyZoom).not.toHaveBeenCalled();
    expect(handle.applyPan).not.toHaveBeenCalled();
    document.body.removeChild(input);
  });

  it("invokes togglePauseMotion on Space and does not require the handle", () => {
    const togglePauseMotion = jest.fn();
    renderHook(() =>
      useOrbKeyboard({
        getHandle: () => null,
        togglePauseMotion,
      }),
    );

    act(() => {
      pressKey(" ");
    });

    expect(togglePauseMotion).toHaveBeenCalledTimes(1);
  });

  it("detaches the listener when disabled", () => {
    const handle = buildHandle();
    const { rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) =>
        useOrbKeyboard({ getHandle: () => handle, enabled }),
      { initialProps: { enabled: true } },
    );

    rerender({ enabled: false });
    act(() => {
      pressKey("+");
    });

    expect(handle.applyZoom).not.toHaveBeenCalled();
  });
});
