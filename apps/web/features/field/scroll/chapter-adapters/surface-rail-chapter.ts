"use client";

import { gsap } from "gsap";
import type { ChapterAdapter } from "./types";
import { ensureGsapScrollTriggerRegistered } from "../../controller/FieldController";

export const surfaceRailChapterAdapter: ChapterAdapter = (element, options) => {
  const items = Array.from(
    element.querySelectorAll<HTMLElement>("[data-surface-rail-item]"),
  );
  const prefersCenteredStagger = element.hasAttribute("data-center");

  if (items.length === 0) return { dispose() {} };

  if (options.reducedMotion) {
    items.forEach((node) => {
      node.style.opacity = "1";
      node.style.transform = "none";
    });
    return { dispose() {} };
  }

  ensureGsapScrollTriggerRegistered();

  const timeline = gsap.timeline({
    scrollTrigger: {
      trigger: element,
      start: "top bottom",
      end: "bottom top",
      toggleActions: "play pause resume reset",
      invalidateOnRefresh: true,
    },
  });

  timeline.from(items, {
    opacity: 0,
    scale: 0.8,
    duration: 0.5,
    ease: "slow.out",
    stagger: {
      amount:
        typeof window !== "undefined" && window.innerWidth >= 1024
          ? prefersCenteredStagger
            ? 0.5
            : 1
          : 0,
      from: prefersCenteredStagger ? "center" : "edges",
    },
  });

  return {
    dispose() {
      timeline.scrollTrigger?.kill();
      timeline.kill();
    },
  };
};
