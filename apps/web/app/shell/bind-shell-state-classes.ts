"use client";

const DEFAULT_VP_FRACTIONS = [0.25, 0.5, 0.75] as const;
const RESIZE_DEBOUNCE_MS = 250;

interface BindShellStateClassesOptions {
  headerHeight?: number;
  vpFractions?: readonly number[];
}

function toggleClass(target: HTMLElement, className: string, active: boolean) {
  target.classList.toggle(className, active);
}

export function bindShellStateClasses({
  headerHeight = 0,
  vpFractions = DEFAULT_VP_FRACTIONS,
}: BindShellStateClassesOptions = {}) {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return () => {};
  }

  const target = document.body;
  if (!target) return () => {};

  let lastScrollY = window.scrollY;
  let resizeTimer: ReturnType<typeof setTimeout> | null = null;

  const markLoaded = () => {
    toggleClass(target, "is-loaded", true);
  };

  const syncScrollState = () => {
    const nextScrollY = window.scrollY;
    const viewportHeight = Math.max(window.innerHeight, 1);
    toggleClass(target, "is-scrolled", nextScrollY > 0);
    toggleClass(target, "is-scrolling-down", nextScrollY > lastScrollY);
    toggleClass(target, "is-scrolled-header-height", nextScrollY >= headerHeight);

    for (const fraction of vpFractions) {
      const suffix = Math.round(fraction * 100);
      toggleClass(
        target,
        `is-scrolled-vh-${suffix}`,
        nextScrollY >= viewportHeight * fraction,
      );
    }

    lastScrollY = nextScrollY;
  };

  const handleResize = () => {
    toggleClass(target, "is-resizing", true);
    syncScrollState();
    if (resizeTimer != null) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      toggleClass(target, "is-resizing", false);
      resizeTimer = null;
    }, RESIZE_DEBOUNCE_MS);
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", markLoaded, { once: true });
  } else {
    markLoaded();
  }

  syncScrollState();
  window.addEventListener("scroll", syncScrollState, { passive: true });
  window.addEventListener("resize", handleResize);

  return () => {
    document.removeEventListener("DOMContentLoaded", markLoaded);
    window.removeEventListener("scroll", syncScrollState);
    window.removeEventListener("resize", handleResize);
    if (resizeTimer != null) {
      clearTimeout(resizeTimer);
    }
  };
}
