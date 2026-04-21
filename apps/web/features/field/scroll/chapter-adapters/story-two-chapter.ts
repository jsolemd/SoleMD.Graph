"use client";

import { gsap } from "gsap";
import type { ChapterAdapter } from "./types";
import { ensureGsapScrollTriggerRegistered } from "../../controller/FieldController";

export const storyTwoChapterAdapter: ChapterAdapter = (element, options) => {
  if (options.reducedMotion) {
    element
      .querySelectorAll<HTMLElement>("[data-story-two-target]")
      .forEach((node) => {
        node.style.opacity = "1";
        node.style.transform = "none";
      });
    return { dispose() {} };
  }

  ensureGsapScrollTriggerRegistered();

  const targets = Array.from(
    element.querySelectorAll<HTMLElement>("[data-story-two-target]"),
  );
  if (targets.length === 0) return { dispose() {} };

  const timeline = gsap.timeline({
    scrollTrigger: {
      trigger: element,
      start: "top bottom",
      end: "bottom center",
      toggleActions: "play pause resume reset",
      invalidateOnRefresh: true,
    },
  });

  timeline.fromTo(
    targets,
    {
      opacity: 0,
      y: 18,
      scale: 0.96,
    },
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

  return {
    dispose() {
      timeline.scrollTrigger?.kill();
      timeline.kill();
    },
  };
};
