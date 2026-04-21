"use client";
/**
 * Dopamine D2 receptor binding — 4-state pharmacology schematic.
 *
 * Receptor path data adapted from BioIcons "simple_receptor_2.svg"
 * (contributor Helicase_11, CC-BY 4.0 — https://bioicons.com/).
 * The underlying GPCR silhouette is unchanged; fills are remapped to
 * SoleMD brand tokens and the scene composes dopamine, a Gαi/o trimer,
 * and the extracellular/intracellular membrane reference into a
 * state-machine that cycles through:
 *
 *   1. rest        — receptor quiescent, dopamine diffusing overhead
 *   2. approach    — dopamine slides into the orthosteric pocket
 *   3. bound       — docked ligand, receptor conformational shift
 *   4. signaling   — Gαi dissociates, βγ remains anchored, ↓ cAMP
 *
 * Auto-advances on viewport entry; each state holds ~1.6s. Reduced
 * motion shows the `bound` state statically with a caption.
 */
import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion, useInView, type Variants } from "framer-motion";
import { canvasReveal } from "@/lib/motion";

type State = "rest" | "approach" | "bound" | "signaling";

const STATES: { id: State; label: string; caption: string }[] = [
  { id: "rest",      label: "1 · Rest",      caption: "Dopamine diffuses in the synaptic cleft." },
  { id: "approach",  label: "2 · Approach",  caption: "Ligand enters the orthosteric pocket." },
  { id: "bound",     label: "3 · Bound",     caption: "Docked. Receptor adopts the active conformation." },
  { id: "signaling", label: "4 · Signaling", caption: "Gαᵢ dissociates. Adenylyl cyclase is inhibited." },
];

const STATE_ORDER: State[] = ["rest", "approach", "bound", "signaling"];

const dopamineVariants: Variants = {
  rest:      { cx: 74,  cy: 24, scale: 1,    opacity: 1 },
  approach:  { cx: 100, cy: 42, scale: 1,    opacity: 1 },
  bound:     { cx: 100, cy: 56, scale: 1.12, opacity: 1 },
  signaling: { cx: 100, cy: 56, scale: 1.12, opacity: 1 },
};

const receptorVariants: Variants = {
  rest:      { fill: "var(--color-soft-blue)" },
  approach:  { fill: "var(--color-soft-blue)" },
  bound:     { fill: "color-mix(in srgb, var(--color-soft-blue) 72%, var(--color-fresh-green) 28%)" },
  signaling: { fill: "color-mix(in srgb, var(--color-soft-blue) 55%, var(--color-fresh-green) 45%)" },
};

const gAlphaVariants: Variants = {
  rest:      { x: 0,  y: 0, opacity: 1, fill: "var(--color-soft-lavender)" },
  approach:  { x: 0,  y: 0, opacity: 1, fill: "var(--color-soft-lavender)" },
  bound:     { x: 0,  y: 0, opacity: 1, fill: "var(--color-soft-lavender)" },
  signaling: { x: -28, y: 18, opacity: 1, fill: "var(--color-warm-coral)" },
};

const gBetaGammaVariants: Variants = {
  rest:      { x: 0, y: 0 },
  approach:  { x: 0, y: 0 },
  bound:     { x: 0, y: 0 },
  signaling: { x: 10, y: 6 },
};

const signalingBurstVariants: Variants = {
  rest:      { opacity: 0, scale: 0.8 },
  approach:  { opacity: 0, scale: 0.8 },
  bound:     { opacity: 0, scale: 0.8 },
  signaling: { opacity: 0.55, scale: 1 },
};

export default function DopamineD2Binding() {
  const reduced = useReducedMotion();
  const wrapRef = useRef<HTMLDivElement>(null);
  const inView = useInView(wrapRef, { once: false, amount: 0.4 });
  const [stateIndex, setStateIndex] = useState(0);
  const state = STATE_ORDER[stateIndex];

  useEffect(() => {
    if (reduced || !inView) return;
    const interval = setInterval(() => {
      setStateIndex((i) => (i + 1) % STATE_ORDER.length);
    }, 1800);
    return () => clearInterval(interval);
  }, [reduced, inView]);

  const activeState: State = reduced ? "bound" : state;
  const caption = STATES.find((s) => s.id === activeState)?.caption ?? "";

  return (
    <motion.div
      ref={wrapRef}
      {...canvasReveal}
      className="flex h-[340px] w-full flex-col gap-3 p-4"
    >
      <div className="flex items-center justify-between text-xs font-mono" style={{ color: "var(--text-secondary)" }}>
        <span>Dopamine D2 · Gαᵢ-coupled</span>
        <span>{STATES.find((s) => s.id === activeState)?.label}</span>
      </div>

      <div className="relative flex-1">
        <svg
          viewBox="0 0 200 220"
          className="absolute inset-0 h-full w-full"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <radialGradient id="d2-bind-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="var(--color-fresh-green)" stopOpacity={0.4} />
              <stop offset="100%" stopColor="var(--color-fresh-green)" stopOpacity={0} />
            </radialGradient>
            <linearGradient id="d2-membrane" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--color-soft-pink)" stopOpacity={0.18} />
              <stop offset="1" stopColor="var(--color-soft-pink)" stopOpacity={0.08} />
            </linearGradient>
          </defs>

          {/* Extracellular / cytoplasmic labels */}
          <text x="100" y="14" textAnchor="middle" fontSize="8" fontFamily="ui-monospace, SFMono-Regular, monospace" fill="var(--text-secondary)">
            extracellular
          </text>
          <text x="100" y="214" textAnchor="middle" fontSize="8" fontFamily="ui-monospace, SFMono-Regular, monospace" fill="var(--text-secondary)">
            cytoplasm
          </text>

          {/* Membrane band */}
          <rect x="0" y="80" width="200" height="42" fill="url(#d2-membrane)" />
          <line x1="0" y1="80" x2="200" y2="80" stroke="var(--border-subtle)" strokeDasharray="2 3" />
          <line x1="0" y1="122" x2="200" y2="122" stroke="var(--border-subtle)" strokeDasharray="2 3" />

          {/* Signaling glow — appears in signaling state */}
          <motion.circle
            cx="95"
            cy="165"
            r="40"
            fill="url(#d2-bind-glow)"
            variants={signalingBurstVariants}
            animate={activeState}
            transition={{ duration: 0.5, ease: "easeOut" }}
          />

          {/* Gβγ subunits — small disc anchored to the membrane TM6 side */}
          <motion.g
            variants={gBetaGammaVariants}
            animate={activeState}
            transition={{ type: "spring", stiffness: 110, damping: 18 }}
          >
            <ellipse cx="118" cy="138" rx="10" ry="5.5" fill="var(--color-golden-yellow)" stroke="var(--text-primary)" strokeOpacity={0.15} strokeWidth={0.8} />
            <text x="118" y="140" textAnchor="middle" fontSize="6" fontFamily="ui-monospace, SFMono-Regular, monospace" fill="var(--text-primary)" fillOpacity={0.75}>βγ</text>
          </motion.g>

          {/* Gαi — ellipse that detaches in signaling state */}
          <motion.g
            variants={gAlphaVariants}
            animate={activeState}
            transition={{ type: "spring", stiffness: 90, damping: 22 }}
          >
            <ellipse
              cx="100"
              cy="148"
              rx="12"
              ry="7"
              stroke="var(--text-primary)"
              strokeOpacity={0.18}
              strokeWidth={0.8}
            />
            <text x="100" y="151" textAnchor="middle" fontSize="6" fontFamily="ui-monospace, SFMono-Regular, monospace" fill="var(--text-primary)" fillOpacity={0.8}>Gαᵢ</text>
          </motion.g>

          {/*
            Receptor body — adapted from BioIcons simple_receptor_2.svg
            (Helicase_11, CC-BY 4.0). The original path was authored at
            ~33mm × 64mm with 2mm margins; here it's re-positioned into
            the membrane band via a group transform. Geometry unchanged;
            only the fill is brand-remapped and animated via variants.
          */}
          <g transform="translate(32, 28) scale(2.1)">
            <motion.rect
              x="52.5"
              y="45"
              width="5"
              height="42"
              rx="2"
              fill="var(--color-muted-indigo)"
              opacity={0.75}
            />
            <motion.path
              d="m 42.226562,23.029401 c -2.165481,0.09423 -3.883593,1.77579 -3.668027,3.471068 0.01797,5.311345 -0.04656,13.329253 0.04498,20.021015 0.250234,2.101318 2.364458,3.671582 4.447656,3.408858 8.306944,-8.55e-4 16.615615,0.04332 24.921484,-0.02214 2.073075,-0.233435 3.693253,-2.286379 3.457799,-4.359374 0.0031,-6.686994 0.04192,-14.500531 -0.02417,-19.805326 -0.227783,-1.849649 -2.853191,-3.194035 -5.070908,-2.57037 -1.879754,0.43598 -3.012621,2.050694 -2.776788,3.557336 -0.02062,3.798287 0.04123,9.586216 -0.0309,14.364639 -0.311539,1.042479 -1.563161,1.033514 -2.44684,0.963486 -4.557022,-0.02061 -9.127099,0.04121 -13.675967,-0.0309 -1.042671,-0.311539 -1.033118,-1.563161 -0.963812,-2.446839 -0.03282,-4.757531 0.07277,-10.208557 -0.06464,-13.980635 -0.290794,-1.524499 -2.220714,-2.703512 -4.149874,-2.570823 z"
              variants={receptorVariants}
              animate={activeState}
              stroke="var(--text-primary)"
              strokeOpacity={0.22}
              strokeWidth={0.6}
              transition={{ duration: 0.6, ease: [0.2, 0.8, 0.2, 1] }}
            />
          </g>

          {/* Dopamine ligand */}
          <motion.circle
            cx={74}
            cy={24}
            r="6.5"
            fill="var(--color-soft-pink)"
            stroke="var(--text-primary)"
            strokeOpacity={0.3}
            strokeWidth={0.8}
            variants={dopamineVariants}
            animate={activeState}
            transition={{ type: "spring", stiffness: 120, damping: 24 }}
          />
        </svg>
      </div>

      <div className="min-h-[32px] text-xs" style={{ color: "var(--text-secondary)" }}>
        {caption}
      </div>
    </motion.div>
  );
}
