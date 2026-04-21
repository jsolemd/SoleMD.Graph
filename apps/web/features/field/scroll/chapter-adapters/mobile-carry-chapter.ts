"use client";

import { gsap } from "gsap";
import type { ChapterAdapter } from "./types";
import { ensureGsapScrollTriggerRegistered } from "../../controller/FieldController";

export const mobileCarryChapterAdapter: ChapterAdapter = (element, options) => {
  const viewport = element.querySelector<HTMLElement>(
    "[data-mobile-carry-viewport]",
  );
  const track = element.querySelector<HTMLElement>("[data-mobile-carry-track]");
  if (!viewport || !track) return { dispose() {} };

  if (options.reducedMotion) {
    track.style.transform = "translate3d(0, 0, 0)";
    return { dispose() {} };
  }

  ensureGsapScrollTriggerRegistered();

  const mm = gsap.matchMedia();
  let clone: HTMLElement | null = null;

  mm.add("(max-width: 1023px)", () => {
    clone = track.cloneNode(true) as HTMLElement;
    clone.setAttribute("aria-hidden", "true");
    viewport.appendChild(clone);
    gsap.set([track, clone], { xPercent: 0 });

    const tween = gsap.to([track, clone], {
      xPercent: -50,
      duration: 10,
      ease: "none",
      repeat: -1,
      scrollTrigger: {
        trigger: element,
        start: "top bottom",
        end: "bottom top",
        toggleActions: "play pause resume reset",
        invalidateOnRefresh: true,
        onRefresh: () => {
          gsap.set([track, clone], { xPercent: 0 });
        },
      },
    });

    return () => {
      tween.scrollTrigger?.kill();
      tween.kill();
      if (clone?.parentNode === viewport) {
        viewport.removeChild(clone);
      }
      clone = null;
      gsap.set(track, { clearProps: "transform" });
    };
  });

  return {
    dispose() {
      mm.revert();
      if (clone?.parentNode === viewport) {
        viewport.removeChild(clone);
      }
      clone = null;
    },
  };
};
