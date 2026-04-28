import { gsap } from "gsap";
import { Color, type ShaderMaterial } from "three";
import {
  LANDING_RAINBOW_RGB,
  LANDING_RAINBOW_STOP_SECONDS,
} from "../shared/landing-feel-constants";

// GSAP rainbow color cycle: tween `uColorNoise` through the palette one
// stop at a time, `ease: "none"`, `repeat: -1`. ~2s per stop -> full
// wheel in ~16s. Tunable.
export const BLOB_COLOR_CYCLE_PER_STOP_SECONDS = LANDING_RAINBOW_STOP_SECONDS;

export interface BlobColorCycleState {
  lastTimeScale: number;
  timeline: gsap.core.Timeline | null;
}

export function createBlobColorCycleState(): BlobColorCycleState {
  return {
    lastTimeScale: 1,
    timeline: null,
  };
}

export function syncBlobColorCycle({
  material,
  motionEnabled,
  seed,
  state,
  timeScale = 1,
}: {
  material: ShaderMaterial | null;
  motionEnabled: boolean;
  seed: readonly [number, number, number];
  state: BlobColorCycleState;
  timeScale?: number;
}): void {
  if (!motionEnabled) {
    stopBlobColorCycle(material, seed, state);
    return;
  }

  if (!state.timeline) {
    state.timeline = startBlobColorCycle(material);
  }
  if (state.timeline && timeScale !== state.lastTimeScale) {
    state.timeline.timeScale(timeScale);
    state.lastTimeScale = timeScale;
  }
}

export function destroyBlobColorCycle(state: BlobColorCycleState): void {
  state.timeline?.kill();
  state.timeline = null;
}

function startBlobColorCycle(
  material: ShaderMaterial | null,
): gsap.core.Timeline | null {
  const colorUniform = material?.uniforms.uColorNoise?.value;
  if (!(colorUniform instanceof Color)) return null;

  const timeline = gsap.timeline({ repeat: -1, ease: "none" });
  for (const [r, g, b] of LANDING_RAINBOW_RGB) {
    timeline.to(colorUniform, {
      r: r / 255,
      g: g / 255,
      b: b / 255,
      duration: LANDING_RAINBOW_STOP_SECONDS,
      ease: "none",
    });
  }
  return timeline;
}

function stopBlobColorCycle(
  material: ShaderMaterial | null,
  seed: readonly [number, number, number],
  state: BlobColorCycleState,
): void {
  if (!state.timeline) return;
  destroyBlobColorCycle(state);
  state.lastTimeScale = 1;

  const colorUniform = material?.uniforms.uColorNoise?.value;
  if (!(colorUniform instanceof Color)) return;
  colorUniform.setRGB(seed[0] / 255, seed[1] / 255, seed[2] / 255);
}
