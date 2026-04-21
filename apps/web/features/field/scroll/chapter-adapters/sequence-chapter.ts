"use client";

import { gsap } from "gsap";
import type { ChapterAdapter } from "./types";
import { ensureGsapScrollTriggerRegistered } from "../../controller/FieldController";

function prepareCheckmarkPaths(element: HTMLElement) {
  return Array.from(
    element.querySelectorAll<SVGPathElement>("[data-sequence-checkmark-path]"),
  ).map((path) => {
    const length = path.getTotalLength();
    path.style.strokeDasharray = `${length}`;
    path.style.strokeDashoffset = `${length}`;
    return { length, path };
  });
}

export const sequenceChapterAdapter: ChapterAdapter = (element, options) => {
  const main = element.querySelector<HTMLElement>("[data-sequence-main]");
  const items = Array.from(
    element.querySelectorAll<HTMLElement>("[data-sequence-item]"),
  );
  const checkmarkPaths = prepareCheckmarkPaths(element);

  if (!main || items.length === 0) return { dispose() {} };

  if (options.reducedMotion) {
    main.style.opacity = "1";
    main.style.transform = "none";
    items.forEach((item) => {
      item.classList.add("is-animated");
      item
        .querySelectorAll<HTMLElement>(
          "[data-sequence-number], [data-sequence-text]",
        )
        .forEach((node) => {
          node.style.opacity = "1";
          node.style.transform = "none";
        });
    });
    checkmarkPaths.forEach(({ path }) => {
      path.style.strokeDashoffset = "0";
    });
    return {
      dispose() {
        items.forEach((item) => item.classList.remove("is-animated"));
      },
    };
  }

  ensureGsapScrollTriggerRegistered();

  const master = gsap.timeline({
    scrollTrigger: {
      trigger: element,
      start: "top bottom",
      end: "bottom top",
      toggleActions: "play pause resume reset",
      invalidateOnRefresh: true,
    },
  });

  master.from(main, {
    opacity: 0,
    scale: 0.96,
    yPercent: 24,
    duration: 0.5,
    ease: "power2.out",
  });

  items.forEach((item, index) => {
    const number = item.querySelector<HTMLElement>("[data-sequence-number]");
    const text = item.querySelector<HTMLElement>("[data-sequence-text]");
    const path = item.querySelector<SVGPathElement>(
      "[data-sequence-checkmark-path]",
    );
    const pathMeta = checkmarkPaths.find((candidate) => candidate.path === path);

    const nested = gsap.timeline({
      defaults: { duration: 0.35, ease: "power2.out" },
      onComplete: () => {
        item.classList.add("is-animated");
      },
    });

    if (number) {
      nested.from(number, { opacity: 0, scale: 0.8 }, 0);
    }
    if (text) {
      nested.from(text, { opacity: 0, x: 18 }, 0);
    }
    if (path && pathMeta) {
      nested.to(
        path,
        {
          strokeDashoffset: 0,
          duration: 0.42,
          ease: "power2.out",
        },
        0.05,
      );
    }

    master.add(nested, index === 0 ? "-=0.1" : "-=0.35");
  });

  return {
    dispose() {
      master.scrollTrigger?.kill();
      master.kill();
      items.forEach((item) => item.classList.remove("is-animated"));
      checkmarkPaths.forEach(({ length, path }) => {
        path.style.strokeDasharray = `${length}`;
        path.style.strokeDashoffset = `${length}`;
      });
    },
  };
};
