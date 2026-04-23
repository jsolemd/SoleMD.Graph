"use client";

import { gsap } from "gsap";
import { NOOP_CHAPTER_HANDLE, type ChapterAdapter } from "./types";

export const surfaceRailChapterAdapter: ChapterAdapter = (ctx) => {
  const { element, reducedMotion, subscribe, getState } = ctx;

  const items = Array.from(
    element.querySelectorAll<HTMLElement>("[data-surface-rail-item]"),
  );
  const prefersCenteredStagger = element.hasAttribute("data-center");

  if (items.length === 0) return NOOP_CHAPTER_HANDLE;

  const restoreItems = () => {
    items.forEach((node) => {
      node.style.opacity = "";
      node.style.transform = "";
    });
  };

  if (reducedMotion) {
    items.forEach((node) => {
      node.style.opacity = "1";
      node.style.transform = "none";
    });
    return {
      dispose() {
        restoreItems();
      },
    };
  }

  const mm = gsap.matchMedia();

  const buildVariant = (staggerAmount: number) => {
    const master = gsap.timeline({ paused: true });
    master.fromTo(
      items,
      { opacity: 0, scale: 0.8 },
      {
        opacity: 1,
        scale: 1,
        duration: 0.5,
        ease: "slow.out",
        stagger: {
          amount: staggerAmount,
          from: prefersCenteredStagger ? "center" : "edges",
        },
      },
    );

    const render = () => {
      const { progress } = getState();
      master.progress(progress).pause();
    };
    render();
    const unsubscribe = subscribe(render);

    return () => {
      unsubscribe();
      master.kill();
    };
  };

  mm.add("(min-width: 1024px)", () =>
    buildVariant(prefersCenteredStagger ? 0.5 : 1),
  );
  mm.add("(max-width: 1023px)", () => buildVariant(0));

  return {
    dispose() {
      mm.revert();
      restoreItems();
    },
  };
};
