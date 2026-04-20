"use client";

function applyViewportClasses(target: HTMLElement) {
  const rect = target.getBoundingClientRect();
  const viewportHeight = window.innerHeight;
  const isAbove = rect.bottom <= 0;
  const isBelow = rect.top >= viewportHeight;
  const isInView = !isAbove && !isBelow;

  target.classList.toggle("is-above", isAbove);
  target.classList.toggle("is-below", isBelow);
  target.classList.toggle("is-in-view", isInView);
}

export function bindDomStateObservers() {
  if (
    typeof window === "undefined" ||
    typeof document === "undefined" ||
    typeof IntersectionObserver === "undefined"
  ) {
    return () => {};
  }

  const observed = Array.from(
    document.querySelectorAll<HTMLElement>("[data-observe]"),
  );
  if (observed.length === 0) return () => {};

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        applyViewportClasses(entry.target as HTMLElement);
      }
    },
    {
      root: null,
      threshold: [0, 0.01, 0.5, 0.99, 1],
    },
  );

  for (const node of observed) {
    applyViewportClasses(node);
    observer.observe(node);
  }

  const handleScroll = () => {
    for (const node of observed) {
      applyViewportClasses(node);
    }
  };

  window.addEventListener("scroll", handleScroll, { passive: true });
  window.addEventListener("resize", handleScroll);

  return () => {
    observer.disconnect();
    window.removeEventListener("scroll", handleScroll);
    window.removeEventListener("resize", handleScroll);
  };
}
