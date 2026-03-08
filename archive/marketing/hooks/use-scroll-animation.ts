/**
 * Track visibility of page sections for scroll-based animations.
 *
 * This hook observes all elements with the `data-animate` attribute and
 * returns a set of element IDs that are currently visible in the viewport.
 * It is used to trigger entrance animations when sections scroll into view.
 *
 * @returns Set of ids for visible elements
 */
import * as React from "react";
import { SCROLL_ANIMATION_OPTIONS } from "@/lib/animation-utils";

export default function useScrollAnimation() {
  const [visibleElements, setVisibleElements] = React.useState<Set<string>>(new Set());

  React.useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          setVisibleElements((prev) => new Set(prev).add((entry.target as HTMLElement).id));
        }
      });
    }, SCROLL_ANIMATION_OPTIONS);

    const elements = document.querySelectorAll<HTMLElement>("[data-animate]");
    elements.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, []);

  return visibleElements;
}
