/**
 * @jest-environment jsdom
 */

import type CameraControlsImpl from "camera-controls";
import { Vector3 } from "three";

import {
  DOLLY_KEY_RATE,
  PAN_KEY_RATE,
  ROTATE_KEY_RAD,
  createOrbKeyboardHandler,
} from "../orb-keyboard-shortcuts";

interface ControlsCalls {
  setFocalOffset: Array<[number, number, number, boolean]>;
  dolly: Array<[number, boolean]>;
}

function makeControls(
  distance: number,
  initialOffset: [number, number, number] = [0, 0, 0],
): {
  controls: CameraControlsImpl;
  calls: ControlsCalls;
} {
  const calls: ControlsCalls = { setFocalOffset: [], dolly: [] };
  const offset = new Vector3(...initialOffset);
  const stub = {
    distance,
    getFocalOffset: (out: Vector3) => out.copy(offset),
    setFocalOffset: (x: number, y: number, z: number, transition: boolean) => {
      calls.setFocalOffset.push([x, y, z, transition]);
      offset.set(x, y, z);
      return Promise.resolve();
    },
    dolly: (distance: number, transition: boolean) => {
      calls.dolly.push([distance, transition]);
      return Promise.resolve();
    },
  };
  return { controls: stub as unknown as CameraControlsImpl, calls };
}

function makeBlob(): {
  blob: {
    applyTwist: (delta: number) => void;
    addTwistImpulse: (delta: number) => void;
  };
  twists: number[];
  impulses: number[];
} {
  const twists: number[] = [];
  const impulses: number[] = [];
  return {
    blob: {
      applyTwist: (delta: number) => {
        twists.push(delta);
      },
      addTwistImpulse: (delta: number) => {
        impulses.push(delta);
      },
    },
    twists,
    impulses,
  };
}

function makeShell(initial = false) {
  const state = {
    pauseMotion: initial,
    setPauseMotion: (value: boolean) => {
      state.pauseMotion = value;
    },
  };
  return state;
}

function fireKey(
  handler: (e: KeyboardEvent) => void,
  init: KeyboardEventInit,
) {
  const event = new KeyboardEvent("keydown", { cancelable: true, ...init });
  // jsdom doesn't honor `cancelable`-via-init for synthetic events
  // dispatched off-element; spy on preventDefault instead.
  const preventDefault = jest.fn();
  Object.defineProperty(event, "preventDefault", { value: preventDefault });
  handler(event);
  return { event, preventDefault };
}

describe("createOrbKeyboardHandler", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("Space toggles pauseMotion", () => {
    const shell = makeShell(false);
    const { controls } = makeControls(100);
    const handler = createOrbKeyboardHandler({
      getControls: () => controls,
      getBlob: () => null,
      getShellState: () => shell,
    });

    const r1 = fireKey(handler, { key: " " });
    expect(shell.pauseMotion).toBe(true);
    expect(r1.preventDefault).toHaveBeenCalled();

    fireKey(handler, { key: " " });
    expect(shell.pauseMotion).toBe(false);
  });

  it("Escape is not handled by the camera keyboard lane", () => {
    const button = document.createElement("button");
    document.body.appendChild(button);
    button.focus();

    const handler = createOrbKeyboardHandler({
      getControls: () => null,
      getBlob: () => null,
      getShellState: () => makeShell(false),
    });

    const r = fireKey(handler, { key: "Escape" });

    expect(r.preventDefault).not.toHaveBeenCalled();
  });

  it("ArrowLeft/Right pans focal offset along x by distance × PAN_KEY_RATE", () => {
    const shell = makeShell();
    const { controls, calls } = makeControls(200);
    const handler = createOrbKeyboardHandler({
      getControls: () => controls,
      getBlob: () => null,
      getShellState: () => shell,
    });

    fireKey(handler, { key: "ArrowRight" });
    fireKey(handler, { key: "ArrowLeft" });

    const step = 200 * PAN_KEY_RATE;
    expect(calls.setFocalOffset).toEqual([
      [step, 0, 0, true],
      [step - step, 0, 0, true],
    ]);
  });

  it("WASD aliases arrow keys (a/d on x, w/s on y)", () => {
    const shell = makeShell();
    const { controls, calls } = makeControls(100);
    const handler = createOrbKeyboardHandler({
      getControls: () => controls,
      getBlob: () => null,
      getShellState: () => shell,
    });

    fireKey(handler, { key: "d" });
    fireKey(handler, { key: "a" });
    fireKey(handler, { key: "w" });
    fireKey(handler, { key: "s" });

    const step = 100 * PAN_KEY_RATE;
    expect(calls.setFocalOffset).toEqual([
      [step, 0, 0, true],
      [step - step, 0, 0, true],
      [0, -step, 0, true],
      [0, 0, 0, true],
    ]);
  });

  it("ArrowUp/Down pans focal offset along y (up = negative Y)", () => {
    const shell = makeShell();
    const { controls, calls } = makeControls(100);
    const handler = createOrbKeyboardHandler({
      getControls: () => controls,
      getBlob: () => null,
      getShellState: () => shell,
    });

    fireKey(handler, { key: "ArrowUp" });
    fireKey(handler, { key: "ArrowDown" });

    const step = 100 * PAN_KEY_RATE;
    expect(calls.setFocalOffset).toEqual([
      [0, -step, 0, true],
      [0, 0, 0, true],
    ]);
  });

  it("Q / E alias < / > on the smoothed-twist lane", () => {
    const shell = makeShell();
    const { controls } = makeControls(100);
    const { blob, impulses } = makeBlob();
    const handler = createOrbKeyboardHandler({
      getControls: () => controls,
      getBlob: () =>
        blob as unknown as import("@/features/field/controller/BlobController").BlobController,
      getShellState: () => shell,
    });

    fireKey(handler, { key: "q" });
    fireKey(handler, { key: "e" });

    expect(impulses).toEqual([-ROTATE_KEY_RAD, ROTATE_KEY_RAD]);
  });

  it("< / > queue smoothed twist impulses (NOT instant applyTwist or camera rotate)", () => {
    // < / > queue a smoothed wrapper twist via addTwistImpulse so a
    // single 5° keypress drains over ~10 frames in BlobController.tick
    // instead of snapping between browser key-repeats. The controller
    // also owns the explicit visual-burst envelope; wrapper/camera
    // transforms do not alter shader-local `vNoise` by themselves.
    const shell = makeShell();
    const { controls } = makeControls(100);
    const { blob, twists, impulses } = makeBlob();
    const handler = createOrbKeyboardHandler({
      getControls: () => controls,
      getBlob: () =>
        blob as unknown as import("@/features/field/controller/BlobController").BlobController,
      getShellState: () => shell,
    });

    fireKey(handler, { key: "," });
    fireKey(handler, { key: "<" });
    fireKey(handler, { key: "." });
    fireKey(handler, { key: ">" });

    expect(impulses).toEqual([
      -ROTATE_KEY_RAD,
      -ROTATE_KEY_RAD,
      ROTATE_KEY_RAD,
      ROTATE_KEY_RAD,
    ]);
    // Instant applyTwist is reserved for gesture lanes — not the
    // keyboard. If this assertion fires, the keyboard handler
    // regressed to the snap-y direct add.
    expect(twists).toEqual([]);
  });

  it("+/= dolly inward, -/_ dolly outward by distance × DOLLY_KEY_RATE", () => {
    const shell = makeShell();
    const { controls, calls } = makeControls(200);
    const handler = createOrbKeyboardHandler({
      getControls: () => controls,
      getBlob: () => null,
      getShellState: () => shell,
    });

    fireKey(handler, { key: "+" });
    fireKey(handler, { key: "=" });
    fireKey(handler, { key: "-" });
    fireKey(handler, { key: "_" });

    const step = 200 * DOLLY_KEY_RATE;
    expect(calls.dolly).toEqual([
      [step, true],
      [step, true],
      [-step, true],
      [-step, true],
    ]);
  });

  it("ignores keys when an INPUT is focused", () => {
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();

    const shell = makeShell(false);
    const { controls, calls } = makeControls(100);
    const handler = createOrbKeyboardHandler({
      getControls: () => controls,
      getBlob: () => null,
      getShellState: () => shell,
    });

    const r = fireKey(handler, { key: " " });
    expect(shell.pauseMotion).toBe(false);
    expect(calls.dolly).toEqual([]);
    expect(calls.setFocalOffset).toEqual([]);
    expect(r.preventDefault).not.toHaveBeenCalled();
  });

  it("ignores keys when a contenteditable element is focused", () => {
    const div = document.createElement("div");
    div.setAttribute("contenteditable", "true");
    div.tabIndex = 0;
    document.body.appendChild(div);
    div.focus();

    const shell = makeShell(false);
    const { controls } = makeControls(100);
    const handler = createOrbKeyboardHandler({
      getControls: () => controls,
      getBlob: () => null,
      getShellState: () => shell,
    });

    fireKey(handler, { key: " " });
    expect(shell.pauseMotion).toBe(false);
  });

  it("ignores arrow / rotate keys with modifier (Ctrl/Meta/Alt)", () => {
    const shell = makeShell();
    const { controls, calls } = makeControls(100);
    const handler = createOrbKeyboardHandler({
      getControls: () => controls,
      getBlob: () => null,
      getShellState: () => shell,
    });

    fireKey(handler, { key: "ArrowLeft", metaKey: true });
    fireKey(handler, { key: "ArrowRight", ctrlKey: true });
    fireKey(handler, { key: " ", altKey: true });

    expect(calls.setFocalOffset).toEqual([]);
    expect(shell.pauseMotion).toBe(false);
  });

  it("no-op for arrow / rotate / zoom keys when neither controls nor blob mounted", () => {
    const shell = makeShell();
    const handler = createOrbKeyboardHandler({
      getControls: () => null,
      getBlob: () => null,
      getShellState: () => shell,
    });

    const r1 = fireKey(handler, { key: "ArrowLeft" });
    const r2 = fireKey(handler, { key: ">" });
    const r3 = fireKey(handler, { key: "+" });
    expect(r1.preventDefault).not.toHaveBeenCalled();
    expect(r2.preventDefault).not.toHaveBeenCalled();
    expect(r3.preventDefault).not.toHaveBeenCalled();
  });

  it("Space still works when controls aren't mounted (shell-only path)", () => {
    const shell = makeShell(false);
    const handler = createOrbKeyboardHandler({
      getControls: () => null,
      getBlob: () => null,
      getShellState: () => shell,
    });

    fireKey(handler, { key: " " });
    expect(shell.pauseMotion).toBe(true);
  });
});
