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

  const observed = new Set<HTMLElement>();

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

  const register = (node: HTMLElement) => {
    if (observed.has(node)) return;
    observed.add(node);
    applyViewportClasses(node);
    observer.observe(node);
  };

  const deregister = (node: HTMLElement) => {
    if (!observed.has(node)) return;
    observed.delete(node);
    observer.unobserve(node);
  };

  // Initial sweep — first-paint nodes.
  for (const node of document.querySelectorAll<HTMLElement>("[data-observe]")) {
    register(node);
  }

  const handleScroll = () => {
    for (const node of observed) {
      applyViewportClasses(node);
    }
  };

  window.addEventListener("scroll", handleScroll, { passive: true });
  window.addEventListener("resize", handleScroll);

  // MutationObserver: track post-mount additions/removals and data-observe attr flips.
  const collectDescendants = (root: Node, into: Set<HTMLElement>) => {
    if (!(root instanceof HTMLElement)) return;
    if (root.hasAttribute("data-observe")) into.add(root);
    const nested = root.querySelectorAll<HTMLElement>("[data-observe]");
    for (const el of nested) into.add(el);
  };

  const mutationObserver = new MutationObserver((mutations) => {
    const toAdd = new Set<HTMLElement>();
    const toRemove = new Set<HTMLElement>();

    for (const m of mutations) {
      if (m.type === "childList") {
        for (const added of m.addedNodes) collectDescendants(added, toAdd);
        for (const removed of m.removedNodes) collectDescendants(removed, toRemove);
      } else if (m.type === "attributes" && m.target instanceof HTMLElement) {
        if (m.target.hasAttribute("data-observe")) {
          toAdd.add(m.target);
        } else {
          toRemove.add(m.target);
        }
      }
    }

    for (const node of toRemove) deregister(node);
    for (const node of toAdd) register(node);
  });

  mutationObserver.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["data-observe"],
  });

  return () => {
    mutationObserver.disconnect();
    observer.disconnect();
    observed.clear();
    window.removeEventListener("scroll", handleScroll);
    window.removeEventListener("resize", handleScroll);
  };
}
