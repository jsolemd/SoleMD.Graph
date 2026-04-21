"use client";

import { gsap } from "gsap";
import type { ChapterAdapter } from "./types";

interface MobileMarqueeRegistration {
  tween: gsap.core.Tween | null;
  userPaused: boolean;
  syncPlayback: () => void;
}

const registrations = new WeakMap<HTMLElement, MobileMarqueeRegistration>();

export function setMobileMarqueePaused(
  element: HTMLElement | null,
  paused: boolean,
): void {
  if (!element) return;
  const registration = registrations.get(element);
  if (!registration) return;
  registration.userPaused = paused;
  registration.syncPlayback();
}

export function isMobileMarqueeRegistered(
  element: HTMLElement | null,
): boolean {
  if (!element) return false;
  const registration = registrations.get(element);
  return registration?.tween != null;
}

export const mobileCarryChapterAdapter: ChapterAdapter = (ctx) => {
  const { element, reducedMotion, subscribe, getState } = ctx;

  const viewport = element.querySelector<HTMLElement>(
    "[data-mobile-carry-viewport]",
  );
  const track = element.querySelector<HTMLElement>("[data-mobile-carry-track]");
  if (!viewport || !track) return { dispose() {} };

  if (reducedMotion) {
    track.style.transform = "translate3d(0, 0, 0)";
    return {
      dispose() {
        track.style.transform = "";
      },
    };
  }

  const registration: MobileMarqueeRegistration = {
    tween: null,
    userPaused: false,
    syncPlayback: () => {},
  };
  registrations.set(element, registration);

  const mm = gsap.matchMedia();

  mm.add("(max-width: 1023px)", () => {
    const clone = track.cloneNode(true) as HTMLElement;
    clone.setAttribute("aria-hidden", "true");
    viewport.appendChild(clone);
    gsap.set([track, clone], { xPercent: 0 });

    const tween = gsap.to([track, clone], {
      xPercent: -50,
      duration: 10,
      ease: "none",
      repeat: -1,
      paused: true,
    });
    registration.tween = tween;

    const syncPlayback = () => {
      const { active } = getState();
      const shouldPlay = active && !registration.userPaused;
      if (shouldPlay) {
        if (tween.paused()) tween.play();
      } else {
        if (!tween.paused()) tween.pause();
      }
    };
    registration.syncPlayback = syncPlayback;
    syncPlayback();
    const unsubscribe = subscribe(syncPlayback);

    return () => {
      unsubscribe();
      tween.kill();
      registration.tween = null;
      registration.syncPlayback = () => {};
      if (clone.parentNode === viewport) {
        viewport.removeChild(clone);
      }
      gsap.set(track, { clearProps: "transform" });
    };
  });

  return {
    dispose() {
      mm.revert();
      registrations.delete(element);
    },
  };
};
