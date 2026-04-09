/**
 * @jest-environment jsdom
 */
import { renderHook } from "@testing-library/react";
import { useTypewriter } from "../use-typewriter";

describe("useTypewriter", () => {
  const texts = ["Prompt placeholder"];

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("does not schedule animation timers while disabled", () => {
    const setTimeoutSpy = jest.spyOn(globalThis, "setTimeout");

    renderHook(() =>
      useTypewriter(texts, {
        enabled: false,
        initialDelay: 10,
        speed: 10,
        waitTime: 10,
        deleteSpeed: 10,
      }),
    );

    expect(setTimeoutSpy).not.toHaveBeenCalled();
  });

  it("schedules animation timers while enabled", () => {
    const setTimeoutSpy = jest.spyOn(globalThis, "setTimeout");

    renderHook(() =>
      useTypewriter(texts, {
        enabled: true,
        initialDelay: 10,
        speed: 10,
        waitTime: 10,
        deleteSpeed: 10,
      }),
    );

    expect(setTimeoutSpy).toHaveBeenCalled();
  });
});
