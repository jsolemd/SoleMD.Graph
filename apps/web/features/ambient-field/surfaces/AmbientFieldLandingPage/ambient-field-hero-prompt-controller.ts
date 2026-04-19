"use client";

import type { AmbientFieldScrollOverlayController } from "../../scroll/ambient-field-scroll-driver";

interface CreateAmbientFieldHeroPromptControllerOptions {
  heroPrompt: HTMLDivElement;
  topPrompt?: HTMLDivElement | null;
}

function smoothstep(min: number, max: number, value: number): number {
  if (max <= min) return value >= max ? 1 : 0;
  const t = Math.max(0, Math.min(1, (value - min) / (max - min)));
  return t * t * (3 - 2 * t);
}

function lerp(from: number, to: number, mix: number): number {
  return from + (to - from) * mix;
}

export function createAmbientFieldHeroPromptController({
  heroPrompt,
  topPrompt,
}: CreateAmbientFieldHeroPromptControllerOptions): AmbientFieldScrollOverlayController {
  return {
    syncFrame({ heroProgress, reducedMotion }) {
      const heroExit = reducedMotion
        ? 0
        : topPrompt
          ? smoothstep(0.14, 0.9, heroProgress)
          : smoothstep(0.08, 0.46, heroProgress);
      const heroLift = reducedMotion ? 0 : lerp(0, topPrompt ? 52 : 92, heroExit);
      const heroScale = reducedMotion
        ? 1
        : lerp(1, topPrompt ? 0.965 : 0.95, heroExit);
      const heroOpacity = reducedMotion ? 1 : 1 - heroExit;

      heroPrompt.style.opacity = `${heroOpacity}`;
      heroPrompt.style.transform = `translate3d(0, ${-heroLift}px, 0) scale(${heroScale})`;

      if (!topPrompt) {
        return;
      }

      if (reducedMotion) {
        topPrompt.style.opacity = "0";
        topPrompt.style.transform = "translate(-50%, -12px)";
        return;
      }

      const topPromptProgress = smoothstep(0.22, 0.72, heroProgress);
      topPrompt.style.opacity = `${topPromptProgress}`;
      topPrompt.style.transform = `translate(-50%, ${lerp(-18, 0, topPromptProgress)}px)`;
    },
  };
}
