"use client";

const DEFAULT_VP_FRACTIONS = [0.25, 0.5, 0.75] as const;
const RESIZE_DEBOUNCE_MS = 250;
const CHROME_PILL_THRESHOLD_PX = 24;

interface BindShellStateClassesOptions {
  headerHeight?: number;
  vpFractions?: readonly number[];
}

function toggleClass(target: HTMLElement, className: string, active: boolean) {
  target.classList.toggle(className, active);
}

function supportsScrollTimeline(): boolean {
  return (
    typeof CSS !== "undefined"
    && typeof CSS.supports === "function"
    && CSS.supports("animation-timeline: scroll()")
  );
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
  const usesDeclarativeChromePill = supportsScrollTimeline();

  let lastScrollY = window.scrollY;
  let resizeTimer: ReturnType<typeof setTimeout> | null = null;
  let chromePillRafId: number | null = null;
  let scrollStateRafId: number | null = null;

  const markLoaded = () => {
    toggleClass(target, "is-loaded", true);
  };

  const runSyncScrollState = () => {
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

  const syncScrollState = () => {
    if (scrollStateRafId !== null) return;
    scrollStateRafId = requestAnimationFrame(() => {
      scrollStateRafId = null;
      runSyncScrollState();
    });
  };

  const syncChromePill = () => {
    if (chromePillRafId !== null) return;
    chromePillRafId = requestAnimationFrame(() => {
      chromePillRafId = null;
      toggleClass(
        target,
        "is-chrome-pill",
        window.scrollY > CHROME_PILL_THRESHOLD_PX,
      );
    });
  };

  const handleResize = () => {
    toggleClass(target, "is-resizing", true);
    runSyncScrollState();
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

  const onScroll = () => {
    syncScrollState();
    if (!usesDeclarativeChromePill) {
      syncChromePill();
    }
  };

  runSyncScrollState();
  toggleClass(
    target,
    "is-chrome-pill",
    !usesDeclarativeChromePill && window.scrollY > CHROME_PILL_THRESHOLD_PX,
  );
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", handleResize, { passive: true });

  return () => {
    document.removeEventListener("DOMContentLoaded", markLoaded);
    window.removeEventListener("scroll", onScroll);
    window.removeEventListener("resize", handleResize);
    if (resizeTimer != null) {
      clearTimeout(resizeTimer);
    }
    if (chromePillRafId != null) {
      cancelAnimationFrame(chromePillRafId);
      chromePillRafId = null;
    }
    if (scrollStateRafId != null) {
      cancelAnimationFrame(scrollStateRafId);
      scrollStateRafId = null;
    }
  };
}
