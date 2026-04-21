"use client";
/**
 * Pinned scroll mechanism template — GSAP ScrollTrigger with a
 * pinned section and scrubbed timeline driving a multi-step scene.
 *
 * Signature pattern §2 (scroll-scrubbed mechanism) from the
 * creative-patterns reference. The user's scroll position drives a
 * multi-stage explanation of a mechanism — molecule docking into
 * receptor, action potential phasing, ion channel state transitions,
 * etc. Every state along the timeline must be legible if scroll
 * stops there.
 *
 * Reduced motion: honored via `gsap.matchMedia` — the entire
 * pinned behavior is skipped and steps lay out vertically.
 */
import { useEffect, useRef } from "react";
import { useReducedMotion } from "framer-motion";

const STEPS = [
  { label: "Step 1", note: "TODO: initial state" },
  { label: "Step 2", note: "TODO: transition" },
  { label: "Step 3", note: "TODO: binding / contact" },
  { label: "Step 4", note: "TODO: state change" },
];

export function MechanismScrollTemplate() {
  const reduced = useReducedMotion();
  const sectionRef = useRef<HTMLDivElement>(null);
  const actorRef = useRef<SVGCircleElement>(null);

  useEffect(() => {
    if (reduced) return;
    const section = sectionRef.current;
    const actor = actorRef.current;
    if (!section || !actor) return;

    let cleanup = () => {};
    (async () => {
      const gsap = (await import("@/lib/gsap")).getGsap();
      const { ScrollTrigger } = await import("gsap/ScrollTrigger");
      gsap.registerPlugin(ScrollTrigger);

      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const tl = gsap.timeline({
          scrollTrigger: {
            trigger: section,
            start: "top top",
            end: "+=1800",
            scrub: 1,
            pin: true,
          },
        });
        // TODO: add your choreography here
        tl.to(actor, { cx: 200, duration: 1, ease: "none" });
      });

      cleanup = () => mm.revert();
    })();

    return () => cleanup();
  }, [reduced]);

  if (reduced) {
    return (
      <div className="flex flex-col gap-6 p-6">
        {STEPS.map((s) => (
          <div key={s.label}>
            <div className="text-sm font-medium">{s.label}</div>
            <div className="text-xs opacity-70">{s.note}</div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div ref={sectionRef} className="relative h-[520px] w-full overflow-hidden">
      <svg viewBox="0 0 400 280" className="absolute inset-0 h-full w-full">
        <circle ref={actorRef} cx="60" cy="140" r="10" fill="var(--color-soft-pink)" />
      </svg>
    </div>
  );
}
