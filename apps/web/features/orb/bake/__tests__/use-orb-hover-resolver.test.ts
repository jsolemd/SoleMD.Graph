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

  it("keeps explicit selection excitation visible under hover changes", async () => {
    renderHook(() => useOrbHoverResolver({ enabled: true, particleCount: 16 }));

    act(() => {
      useOrbFocusVisualStore.getState().setSelectionIndices([4, 2, 4]);
    });
    await flushRaf();

    expect(getParticleStateData()[gByte(2)]).toBe(192);
    expect(getParticleStateData()[gByte(4)]).toBe(192);

    act(() => {
      useOrbFocusVisualStore.getState().setHoverIndex(2);
    });
    await flushRaf();

    // Selection is stronger than hover, so a hovered selected particle
    // stays at selection intensity.
    expect(getParticleStateData()[gByte(2)]).toBe(192);

    act(() => {
      useOrbFocusVisualStore.getState().setHoverIndex(6);
    });
    await flushRaf();

    expect(getParticleStateData()[gByte(2)]).toBe(192);
    expect(getParticleStateData()[gByte(6)]).toBe(128);
  });

  it("keeps filter-scope excitation visible under hover changes", async () => {
    renderHook(() => useOrbHoverResolver({ enabled: true, particleCount: 16 }));

    act(() => {
      useOrbFocusVisualStore.getState().setScopeIndices([5, 3, 5]);
    });
    await flushRaf();

    expect(getParticleStateData()[gByte(3)]).toBe(192);
    expect(getParticleStateData()[gByte(5)]).toBe(192);

    act(() => {
      useOrbFocusVisualStore.getState().setHoverIndex(3);
    });
    await flushRaf();

    // Scoped particles keep the same visual weight as explicit
    // selection; hover cannot weaken them.
    expect(getParticleStateData()[gByte(3)]).toBe(192);

    act(() => {
      useOrbFocusVisualStore.getState().setScopeIndices([]);
    });
    await flushRaf();

    expect(getParticleStateData()[gByte(5)]).toBe(0);
    expect(getParticleStateData()[gByte(3)]).toBe(128);
  });

  it("keeps neighbor highlights weaker than hover and explicit selection", async () => {
    renderHook(() => useOrbHoverResolver({ enabled: true, particleCount: 16 }));

    act(() => {
      useOrbFocusVisualStore.getState().setNeighborIndices([5, 7]);
    });
    await flushRaf();

    expect(getParticleStateData()[gByte(5)]).toBe(96);
    expect(getParticleStateData()[gByte(7)]).toBe(96);

    act(() => {
      useOrbFocusVisualStore.getState().setHoverIndex(5);
      useOrbFocusVisualStore.getState().setSelectionIndices([7]);
    });
    await flushRaf();

    expect(getParticleStateData()[gByte(5)]).toBe(128);
    expect(getParticleStateData()[gByte(7)]).toBe(192);

    act(() => {
      useOrbFocusVisualStore.getState().setNeighborIndices([]);
    });
    await flushRaf();

    expect(getParticleStateData()[gByte(5)]).toBe(128);
    expect(getParticleStateData()[gByte(7)]).toBe(192);
  });
});
