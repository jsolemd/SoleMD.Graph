/**
 * @jest-environment jsdom
 */
import { act, cleanup, renderHook } from "@testing-library/react";

import {
  getParticleStateData,
  PARTICLE_STATE_LANES,
  resetParticleStateTexture,
} from "@/features/field/renderer/field-particle-state-texture";
import { useOrbFocusVisualStore } from "../../stores/focus-visual-store";
import { useOrbScopeMutationStore } from "../../stores/scope-mutation-store";
import { useOrbHoverResolver } from "../use-orb-hover-resolver";

function gByte(index: number): number {
  return index * PARTICLE_STATE_LANES + 1;
}

async function flushRaf(): Promise<void> {
  await act(async () => {
    jest.advanceTimersByTime(20);
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("useOrbHoverResolver", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    resetParticleStateTexture();
    useOrbFocusVisualStore.getState().reset();
    useOrbScopeMutationStore.getState().reset();
  });

  afterEach(() => {
    cleanup();
    jest.useRealTimers();
    resetParticleStateTexture();
    useOrbFocusVisualStore.getState().reset();
    useOrbScopeMutationStore.getState().reset();
  });

  it("writes hover intensity and clears the previous hover index", async () => {
    renderHook(() => useOrbHoverResolver({ enabled: true, particleCount: 16 }));

    act(() => {
      useOrbFocusVisualStore.getState().setHoverIndex(2);
    });
    await flushRaf();
    expect(getParticleStateData()[gByte(2)]).toBe(128);

    act(() => {
      useOrbFocusVisualStore.getState().setHoverIndex(4);
    });
    await flushRaf();

    expect(getParticleStateData()[gByte(2)]).toBe(0);
    expect(getParticleStateData()[gByte(4)]).toBe(128);
  });

  it("lets focus override hover at the same index", async () => {
    renderHook(() => useOrbHoverResolver({ enabled: true, particleCount: 16 }));

    act(() => {
      const store = useOrbFocusVisualStore.getState();
      store.setHoverIndex(3);
      store.setFocusIndex(3);
    });
    await flushRaf();

    expect(getParticleStateData()[gByte(3)]).toBe(255);

    act(() => {
      useOrbFocusVisualStore.getState().setHoverIndex(null);
    });
    await flushRaf();

    expect(getParticleStateData()[gByte(3)]).toBe(255);

    act(() => {
      useOrbFocusVisualStore.getState().setFocusIndex(null);
    });
    await flushRaf();

    expect(getParticleStateData()[gByte(3)]).toBe(0);
  });
});
