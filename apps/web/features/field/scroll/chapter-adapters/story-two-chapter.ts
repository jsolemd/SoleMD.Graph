"use client";

import { gsap } from "gsap";
import { NOOP_CHAPTER_HANDLE, type ChapterAdapter } from "./types";

export const storyTwoChapterAdapter: ChapterAdapter = (ctx) => {
  const { element, reducedMotion, subscribe, getState } = ctx;

  const targets = Array.from(
    element.querySelectorAll<HTMLElement>("[data-story-two-target]"),
  );
  if (targets.length === 0) return NOOP_CHAPTER_HANDLE;

  const restoreTargets = () => {
    targets.forEach((node) => {
      node.style.opacity = "";
      node.style.transform = "";
    });
  };

  if (reducedMotion) {
    targets.forEach((node) => {
      node.style.opacity = "1";
      node.style.transform = "none";
    });
    return {
      dispose() {
        restoreTargets();
      },
    };
  }

  const master = gsap.timeline({ paused: true });
  master.fromTo(
    targets,
    { opacity: 0, y: 18, scale: 0.96 },
    {
      opacity: 1,
      y: 0,
      scale: 1,
      duration: 0.6,
      ease: "power2.out",
      stagger: 0.12,
    },
    0,
  );

  const render = () => {
    const { progress } = getState();
    master.progress(progress).pause();
  };
  render();
  const unsubscribe = subscribe(render);

  return {
    dispose() {
      unsubscribe();
      master.kill();
      restoreTargets();
    },
  };
};
