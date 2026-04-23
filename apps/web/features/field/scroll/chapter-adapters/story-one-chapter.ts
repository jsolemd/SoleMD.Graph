"use client";

import { gsap } from "gsap";
import { NOOP_CHAPTER_HANDLE, type ChapterAdapter } from "./types";

export const storyOneChapterAdapter: ChapterAdapter = (ctx) => {
  const { element, reducedMotion, subscribe, getState } = ctx;

  const beats = Array.from(
    element.querySelectorAll<HTMLElement>("[data-story-beat]"),
  );
  if (beats.length === 0) return NOOP_CHAPTER_HANDLE;

  const restoreBeats = () => {
    beats.forEach((node) => {
      node.style.opacity = "";
      node.style.transform = "";
    });
  };

  if (reducedMotion) {
    beats.forEach((node) => {
      node.style.opacity = "1";
      node.style.transform = "none";
    });
    return {
      dispose() {
        restoreBeats();
      },
    };
  }

  const master = gsap.timeline({ paused: true });
  beats.forEach((beat, index) => {
    master.fromTo(
      beat,
      { opacity: 0, y: 18 },
      {
        opacity: 1,
        y: 0,
        duration: 0.5,
        ease: "power2.out",
      },
      index * 0.2,
    );
  });

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
      restoreBeats();
    },
  };
};
