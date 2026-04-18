"use client";
import { useEffect, useRef } from "react";
import { useReducedMotionConfig as useReducedMotion } from "framer-motion";

const STEPS = [
  { label: "Rest",          note: "Receptor closed. No ligand bound." },
  { label: "Approach",      note: "Dopamine diffuses into the synaptic cleft." },
  { label: "Binding",       note: "Ligand docks into the orthosteric pocket." },
  { label: "State change",  note: "G-protein engages. Intracellular cascade begins." },
];

export default function ScrollMechanism() {
  const reduced = useReducedMotion();
  const sectionRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<HTMLDivElement>(null);
  const ligandRef = useRef<SVGCircleElement>(null);
  const receptorRef = useRef<SVGPathElement>(null);
  const stepRefs = useRef<Array<HTMLDivElement | null>>([]);

  useEffect(() => {
    if (reduced) return;
    const section = sectionRef.current;
    const ligand = ligandRef.current;
    const receptor = receptorRef.current;
    if (!section || !ligand || !receptor) return;

    let cleanup = () => {};
    (async () => {
      const gsap = (await import("@/lib/gsap")).getGsap();
      const { ScrollTrigger } = await import("gsap/ScrollTrigger");
      gsap.registerPlugin(ScrollTrigger);

      // Scroll-scrubbed without pinning. The card scrolls through the
      // viewport normally; the timeline progress follows its position.
      // Range spans "card enters from bottom" → "card exits the top"
      // so the full animation plays across one screenful of scroll.
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: section,
          start: "top bottom",
          end: "bottom top",
          scrub: 0.6,
        },
      });

      tl.fromTo(ligand, { attr: { cx: 60, cy: 80 } }, { attr: { cx: 200, cy: 80 }, duration: 1, ease: "none" })
        .to(ligand, { attr: { cx: 180, cy: 140 }, duration: 0.4, ease: "none" }, ">")
        .to(receptor, { fill: "var(--color-fresh-green)", duration: 0.6, ease: "none" }, ">")
        .to(ligand, { scale: 1.08, duration: 0.3, ease: "none", transformOrigin: "center" }, "<");

      const validSteps = stepRefs.current.filter((el): el is HTMLDivElement => !!el);
      if (validSteps.length) {
        tl.fromTo(
          validSteps,
          { opacity: 0, y: 12 },
          { opacity: 1, y: 0, duration: 0.8, stagger: 0.25, ease: "none" },
          0,
        );
      }

      cleanup = () => {
        ScrollTrigger.getAll().forEach((st) => {
          if (st.vars.trigger === section) st.kill();
        });
      };
    })();

    return () => cleanup();
  }, [reduced]);

  if (reduced) {
    return (
      <div
        ref={sectionRef}
        className="flex w-full flex-col gap-6 rounded-[1rem] bg-[var(--surface)] p-6"
      >
        <h3 className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
          Scroll mechanism (reduced motion fallback)
        </h3>
        {STEPS.map((s) => (
          <div key={s.label} className="flex items-start gap-3">
            <div
              className="mt-1 h-2 w-2 shrink-0 rounded-full"
              style={{ background: "var(--color-soft-pink)" }}
            />
            <div>
              <div className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                {s.label}
              </div>
              <div className="text-xs" style={{ color: "var(--text-secondary)" }}>
                {s.note}
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div ref={sectionRef} className="relative h-[520px] w-full overflow-hidden">
      <div ref={sceneRef} className="relative h-full w-full">
        <svg viewBox="0 0 400 280" className="absolute inset-0 h-full w-full">
          <defs>
            <radialGradient id="mechanism-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="var(--color-soft-pink)" stopOpacity={0.18} />
              <stop offset="100%" stopColor="var(--color-soft-pink)" stopOpacity={0} />
            </radialGradient>
          </defs>

          <rect x="0" y="180" width="400" height="12" fill="var(--border-subtle)" opacity={0.3} />
          <text x="200" y="218" textAnchor="middle" fontSize="10" fill="var(--text-secondary)" fontFamily="ui-monospace, SFMono-Regular, monospace">
            membrane
          </text>

          <path
            ref={receptorRef}
            d="M 156,180 L 156,150 Q 156,132 180,132 L 216,132 Q 240,132 240,150 L 240,180 Z M 180,150 Q 180,144 186,144 L 210,144 Q 216,144 216,150 L 216,166 Q 216,172 210,172 L 186,172 Q 180,172 180,166 Z"
            fill="var(--color-soft-blue)"
            fillRule="evenodd"
            stroke="var(--text-primary)"
            strokeOpacity={0.15}
            strokeWidth={1}
          />

          <circle cx="200" cy="200" r="48" fill="url(#mechanism-glow)" />

          <circle
            ref={ligandRef}
            cx="60"
            cy="80"
            r="9"
            fill="var(--color-soft-pink)"
            stroke="var(--text-primary)"
            strokeOpacity={0.2}
            strokeWidth={1}
          />
        </svg>

        <div className="absolute bottom-6 left-0 w-full px-6">
          <div className="flex flex-col gap-3">
            {STEPS.map((s, i) => (
              <div
                key={s.label}
                ref={(el) => {
                  stepRefs.current[i] = el;
                }}
                className="flex items-center gap-3 text-left"
              >
                <span
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-mono"
                  style={{
                    background: "var(--surface-alt)",
                    color: "var(--text-primary)",
                  }}
                >
                  {i + 1}
                </span>
                <div>
                  <div className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                    {s.label}
                  </div>
                  <div className="text-xs" style={{ color: "var(--text-secondary)" }}>
                    {s.note}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
