/**
 * @jest-environment jsdom
 */
import { act, renderHook } from "@testing-library/react";
import { useRef } from "react";
import { useChatThread } from "../useChatThread";

// Force deterministic non-reduced-motion branch so `advance()` increments
// synchronously via the typing-delay path; and a reduced-motion variant
// for the outside-root assertion where we need a single-tick increment.
jest.mock("@/features/wiki/module-runtime/motion", () => ({
  usePrefersReducedMotion: () => true,
}));

describe("useChatThread keyboard scoping", () => {
  it("does NOT advance when Space is pressed outside the chat-thread root", () => {
    const outside = document.createElement("div");
    document.body.appendChild(outside);

    const rootEl = document.createElement("div");
    // Make the root focusable so it can receive a keydown; but the event is
    // dispatched from outside — it must not bubble into the scoped listener.
    document.body.appendChild(rootEl);

    const { result } = renderHook(() => {
      const ref = useRef<HTMLDivElement | null>(rootEl);
      return useChatThread({ messageCount: 3, rootRef: ref });
    });

    expect(result.current.visibleCount).toBe(1);

    const event = new KeyboardEvent("keydown", {
      key: " ",
      bubbles: true,
      cancelable: true,
    });

    act(() => {
      outside.dispatchEvent(event);
    });

    // Key was not captured: default NOT prevented and visibleCount unchanged.
    expect(event.defaultPrevented).toBe(false);
    expect(result.current.visibleCount).toBe(1);

    document.body.removeChild(outside);
    document.body.removeChild(rootEl);
  });

  it("DOES advance when Space is pressed inside the chat-thread root", () => {
    const rootEl = document.createElement("div");
    const inner = document.createElement("p");
    rootEl.appendChild(inner);
    document.body.appendChild(rootEl);

    const { result } = renderHook(() => {
      const ref = useRef<HTMLDivElement | null>(rootEl);
      return useChatThread({ messageCount: 3, rootRef: ref });
    });

    expect(result.current.visibleCount).toBe(1);

    const event = new KeyboardEvent("keydown", {
      key: " ",
      bubbles: true,
      cancelable: true,
    });

    act(() => {
      inner.dispatchEvent(event);
    });

    expect(event.defaultPrevented).toBe(true);
    expect(result.current.visibleCount).toBe(2);

    document.body.removeChild(rootEl);
  });

  it("ignores keydown from native interactive elements inside the root", () => {
    const rootEl = document.createElement("div");
    const button = document.createElement("button");
    rootEl.appendChild(button);
    document.body.appendChild(rootEl);

    const { result } = renderHook(() => {
      const ref = useRef<HTMLDivElement | null>(rootEl);
      return useChatThread({ messageCount: 3, rootRef: ref });
    });

    const event = new KeyboardEvent("keydown", {
      key: " ",
      bubbles: true,
      cancelable: true,
    });

    act(() => {
      button.dispatchEvent(event);
    });

    expect(event.defaultPrevented).toBe(false);
    expect(result.current.visibleCount).toBe(1);

    document.body.removeChild(rootEl);
  });

  it("installs NO listener when rootRef is omitted (no site-wide hijack)", () => {
    // No ref supplied → hook must not attach to window. A keydown dispatched
    // on window (or any element) must not prevent default, must not advance.
    const { result } = renderHook(() => useChatThread({ messageCount: 3 }));

    const event = new KeyboardEvent("keydown", {
      key: " ",
      bubbles: true,
      cancelable: true,
    });

    act(() => {
      window.dispatchEvent(event);
    });

    expect(event.defaultPrevented).toBe(false);
    expect(result.current.visibleCount).toBe(1);
  });

  it("cleans up the listener on unmount", () => {
    const rootEl = document.createElement("div");
    document.body.appendChild(rootEl);

    const { result, unmount } = renderHook(() => {
      const ref = useRef<HTMLDivElement | null>(rootEl);
      return useChatThread({ messageCount: 3, rootRef: ref });
    });

    const initial = result.current.visibleCount;
    unmount();

    const event = new KeyboardEvent("keydown", {
      key: " ",
      bubbles: true,
      cancelable: true,
    });
    act(() => {
      rootEl.dispatchEvent(event);
    });

    // After unmount, listener is gone; default NOT prevented.
    expect(event.defaultPrevented).toBe(false);
    expect(initial).toBe(1);

    document.body.removeChild(rootEl);
  });
});
