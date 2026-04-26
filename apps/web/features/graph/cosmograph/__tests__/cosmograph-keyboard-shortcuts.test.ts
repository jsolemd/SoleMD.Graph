/**
 * @jest-environment jsdom
 */

import type { CosmographRef } from "@cosmograph/react";

import {
  PAN_KEY_PIXELS,
  createGraphKeyboardHandler,
} from "../cosmograph-keyboard-shortcuts";

interface FakeTransform {
  k: number;
  x: number;
  y: number;
}

class TransformCtor implements FakeTransform {
  constructor(
    public k: number,
    public x: number,
    public y: number,
  ) {}
}

interface ApplyCall {
  k: number;
  x: number;
  y: number;
}

function makeCosmograph(initial: FakeTransform = { k: 1, x: 0, y: 0 }): {
  cosmograph: CosmographRef;
  applies: ApplyCall[];
} {
  const applies: ApplyCall[] = [];
  const eventTransform = new TransformCtor(initial.k, initial.x, initial.y);
  const selection = {} as object;
  const internal = {
    _cosmos: {
      canvasD3Selection: selection,
      zoomInstance: {
        eventTransform,
        behavior: {
          transform: (
            _selection: unknown,
            transform: { k: number; x: number; y: number },
          ) => {
            applies.push({ k: transform.k, x: transform.x, y: transform.y });
            // Mirror the new transform into eventTransform so
            // subsequent reads see the latest state.
            eventTransform.k = transform.k;
            eventTransform.x = transform.x;
            eventTransform.y = transform.y;
          },
        },
      },
    },
  };
  return { cosmograph: internal as unknown as CosmographRef, applies };
}

function fireKey(
  handler: (e: KeyboardEvent) => void,
  init: KeyboardEventInit,
) {
  const event = new KeyboardEvent("keydown", { cancelable: true, ...init });
  const preventDefault = jest.fn();
  Object.defineProperty(event, "preventDefault", { value: preventDefault });
  handler(event);
  return { event, preventDefault };
}

describe("createGraphKeyboardHandler", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("ArrowLeft / ArrowRight pan x by ±PAN_KEY_PIXELS", () => {
    const { cosmograph, applies } = makeCosmograph({ k: 1.5, x: 100, y: 200 });
    const handler = createGraphKeyboardHandler({
      getCosmograph: () => cosmograph,
    });

    fireKey(handler, { key: "ArrowRight" });
    fireKey(handler, { key: "ArrowLeft" });

    expect(applies).toEqual([
      { k: 1.5, x: 100 + PAN_KEY_PIXELS, y: 200 },
      { k: 1.5, x: 100, y: 200 },
    ]);
  });

  it("ArrowUp / ArrowDown pan y (up = negative y)", () => {
    const { cosmograph, applies } = makeCosmograph({ k: 1, x: 0, y: 0 });
    const handler = createGraphKeyboardHandler({
      getCosmograph: () => cosmograph,
    });

    fireKey(handler, { key: "ArrowUp" });
    fireKey(handler, { key: "ArrowDown" });

    expect(applies).toEqual([
      { k: 1, x: 0, y: -PAN_KEY_PIXELS },
      { k: 1, x: 0, y: 0 },
    ]);
  });

  it("WASD aliases the arrow keys (a/d on x, w/s on y)", () => {
    const { cosmograph, applies } = makeCosmograph({ k: 1, x: 0, y: 0 });
    const handler = createGraphKeyboardHandler({
      getCosmograph: () => cosmograph,
    });

    fireKey(handler, { key: "d" });
    fireKey(handler, { key: "a" });
    fireKey(handler, { key: "w" });
    fireKey(handler, { key: "s" });

    expect(applies).toEqual([
      { k: 1, x: PAN_KEY_PIXELS, y: 0 },
      { k: 1, x: 0, y: 0 },
      { k: 1, x: 0, y: -PAN_KEY_PIXELS },
      { k: 1, x: 0, y: 0 },
    ]);
  });

  it("preserves zoom level across pans", () => {
    const { cosmograph, applies } = makeCosmograph({ k: 4.2, x: 50, y: 50 });
    const handler = createGraphKeyboardHandler({
      getCosmograph: () => cosmograph,
    });
    fireKey(handler, { key: "d" });
    expect(applies[0]?.k).toBe(4.2);
  });

  it("ignores keys when an INPUT is focused", () => {
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    const { cosmograph, applies } = makeCosmograph();
    const handler = createGraphKeyboardHandler({
      getCosmograph: () => cosmograph,
    });

    const r = fireKey(handler, { key: "ArrowLeft" });
    expect(applies).toEqual([]);
    expect(r.preventDefault).not.toHaveBeenCalled();
  });

  it("ignores arrow / WASD keys with modifier (Ctrl/Meta/Alt)", () => {
    const { cosmograph, applies } = makeCosmograph();
    const handler = createGraphKeyboardHandler({
      getCosmograph: () => cosmograph,
    });

    fireKey(handler, { key: "ArrowRight", metaKey: true });
    fireKey(handler, { key: "d", ctrlKey: true });
    fireKey(handler, { key: "w", altKey: true });

    expect(applies).toEqual([]);
  });

  it("no-op when Cosmograph isn't mounted yet", () => {
    const handler = createGraphKeyboardHandler({
      getCosmograph: () => null,
    });
    const r = fireKey(handler, { key: "ArrowLeft" });
    expect(r.preventDefault).not.toHaveBeenCalled();
  });

  it("no-op for unrelated keys (Space, +, < / >)", () => {
    const { cosmograph, applies } = makeCosmograph();
    const handler = createGraphKeyboardHandler({
      getCosmograph: () => cosmograph,
    });

    fireKey(handler, { key: " " });
    fireKey(handler, { key: "+" });
    fireKey(handler, { key: "<" });
    fireKey(handler, { key: ">" });

    expect(applies).toEqual([]);
  });
});
