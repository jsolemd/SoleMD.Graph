"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useViewportSize } from "@mantine/hooks";
import { MotionConfig, useReducedMotion } from "framer-motion";
import { useFieldRuntime } from "../renderer/field-runtime-context";
import { useFieldSceneStore } from "../scroll/field-scene-store";
import { FIELD_NON_DESKTOP_BREAKPOINT } from "../field-breakpoints";
import {
  FixedStageManagerProvider,
  useFixedStageManager,
} from "../stage/FixedStageManager";
import type { FieldStageItemId } from "../scene/visual-presets";
import type { FieldSectionManifestEntry } from "./FieldLandingPage/field-landing-content";
import "./field-delirium-page.css";

// The delirium foundations lecture. The blob (the landing orb) is the only
// formation on stage: it morphs into the brain via `uMorph` and the clinical
// beats drive its uniforms (see scroll/chapters/delirium-field-chapter). Every
// section maps to `blob`, so the same 16384 particles carry the whole deck —
// orb → brain → decline → siege → disconnection → recovery. The hero id must be
// "section-hero" (FixedStageManager hardcodes it).
//
// Each section carries an accent from the shared palette tokens; the accent
// drives a per-section background mood wash and the progress rail so the page
// shifts palette as it teaches (the "spotlight" feel), not just scrolls.

interface SectionMeta {
  id: string;
  accent: string;
}

const SECTIONS: readonly SectionMeta[] = [
  { id: "section-hero", accent: "var(--color-soft-blue)" },
  { id: "section-brain", accent: "var(--color-warm-coral)" },
  { id: "section-burden", accent: "var(--color-warm-coral)" },
  { id: "section-ratchet", accent: "var(--color-golden-yellow)" },
  { id: "section-siege", accent: "var(--color-warm-coral)" },
  { id: "section-disconnect", accent: "var(--color-soft-blue)" },
  { id: "section-signature", accent: "var(--color-muted-indigo)" },
  { id: "section-acetylcholine", accent: "var(--color-soft-lavender)" },
  { id: "section-lever", accent: "var(--color-fresh-green)" },
  { id: "section-evidence", accent: "var(--color-soft-blue)" },
];

// Single source of truth for a section's accent — the mood wash, the progress
// rail, and every panel's `--dl-accent` all resolve through here, so a section
// can never wear two different colors.
const accentOf = (id: string): string =>
  SECTIONS.find((section) => section.id === id)?.accent ?? SECTIONS[0]!.accent;

const accentStyle = (id: string): CSSProperties =>
  ({ "--dl-accent": accentOf(id) }) as CSSProperties;

// No endSectionId: each section owns a LOCAL scroll chapter (progress 0..1 as
// that one section passes through the viewport). Local chapters land each beat
// inside its own section; contiguous sections overlap enough that the blob
// stays continuously visible.
const DELIRIUM_MANIFEST: readonly FieldSectionManifestEntry[] = SECTIONS.map(
  (section) => ({
    sectionId: section.id,
    stageItemId: "blob" as FieldStageItemId,
    presetId: "blob",
  }),
);

const shellStyle: CSSProperties = { color: "var(--graph-panel-text)" };

// Per-section background wash. One fixed radial layer per accent; the active
// section's layer fades in and the rest fade out, so the palette cross-dissolves
// as you scroll. Sits above the field canvas (z-0) and below the text (z-10).
function MoodWash({ activeIndex }: { activeIndex: number }) {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[1]">
      {SECTIONS.map((section, index) => (
        <div
          key={section.id}
          className="absolute inset-0 transition-opacity duration-1000 ease-out"
          style={{
            opacity: index === activeIndex ? 0.16 : 0,
            background: `radial-gradient(120% 85% at 50% 32%, ${section.accent} 0%, transparent 62%)`,
          }}
        />
      ))}
    </div>
  );
}

function useLectureScroll(): { activeIndex: number; progress: number } {
  const [activeIndex, setActiveIndex] = useState(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const ratios = new Map<string, number>();
    const observed = SECTIONS.map((s) => document.getElementById(s.id)).filter(
      (el): el is HTMLElement => !!el,
    );

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          ratios.set(entry.target.id, entry.intersectionRatio);
        }
        // Pick the section with the largest visible fraction as active.
        let bestIndex = 0;
        let bestRatio = -1;
        SECTIONS.forEach((section, index) => {
          const ratio = ratios.get(section.id) ?? 0;
          if (ratio > bestRatio) {
            bestRatio = ratio;
            bestIndex = index;
          }
        });
        setActiveIndex(bestIndex);
      },
      { threshold: [0, 0.15, 0.3, 0.5, 0.7, 0.9, 1] },
    );
    for (const el of observed) observer.observe(el);

    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  return { activeIndex, progress };
}

// Reveal panels on first entry (respects reduced motion via the caller).
function useRevealOnEnter(enabled: boolean) {
  const rootRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const targets = Array.from(
      root.querySelectorAll<HTMLElement>("[data-reveal]"),
    );
    if (!enabled) {
      for (const el of targets) el.classList.add("is-in");
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-in");
            observer.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.28 },
    );
    for (const el of targets) observer.observe(el);
    return () => observer.disconnect();
  }, [enabled]);
  return rootRef;
}

function Eyebrow({ num, children }: { num?: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      {num ? (
        <span className="font-mono text-[11px] tracking-[0.24em] text-white/35">
          {num}
        </span>
      ) : null}
      <span
        className="font-mono text-[11px] uppercase tracking-[0.2em]"
        style={{ color: "var(--dl-accent)" }}
      >
        {children}
      </span>
    </div>
  );
}

function Lead({ children }: { children: ReactNode }) {
  return (
    <p className="mt-4 max-w-[38ch] text-base font-light leading-relaxed text-white/75">
      {children}
    </p>
  );
}

function Cite({ children }: { children: ReactNode }) {
  return (
    <p className="mt-5 border-l-2 border-white/15 pl-3 font-mono text-[10.5px] leading-relaxed text-white/40">
      {children}
    </p>
  );
}

// A clinical beat: a tall scroll section with a sticky glass panel. Height gives
// the field room to run the beat while the panel is read; alignment alternates.
// Accent resolves from the section id, so it always matches the mood wash.
function Beat({
  id,
  align,
  children,
}: {
  id: string;
  align: "left" | "right";
  children: ReactNode;
}) {
  const justify = align === "right" ? "md:justify-end" : "md:justify-start";
  return (
    <section id={id} className="relative min-h-[200vh]" style={accentStyle(id)}>
      <div
        className={`sticky top-0 flex min-h-screen items-center justify-center ${justify} px-6 md:px-[6vw]`}
      >
        <div data-reveal className="dl-panel max-w-[440px]">
          {children}
        </div>
      </div>
    </section>
  );
}

// A stat with a large value and a small label — the burden numbers, shown big.
function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div
        className="font-mono text-2xl font-semibold leading-none"
        style={{ color: "var(--dl-accent)" }}
      >
        {value}
      </div>
      <div className="mt-1.5 text-[12px] leading-snug text-white/60">
        {label}
      </div>
    </div>
  );
}

function DeliriumContent() {
  const { controllersRef, controllerEpoch, setStageReady } = useFieldRuntime();
  const { ready: stageReady, registerController } = useFixedStageManager();
  const reducedMotion = useReducedMotion();
  const { activeIndex, progress } = useLectureScroll();
  const rootRef = useRevealOnEnter(!reducedMotion);

  useEffect(() => {
    const registry = controllersRef.current;
    for (const [id, controller] of Object.entries(registry)) {
      if (!controller) continue;
      registerController(id as FieldStageItemId, controller);
    }
  }, [controllerEpoch, controllersRef, registerController]);

  useEffect(() => {
    setStageReady(stageReady);
    return () => setStageReady(false);
  }, [setStageReady, stageReady]);

  const activeAccent = SECTIONS[activeIndex]?.accent ?? SECTIONS[0]!.accent;

  return (
    <>
      <MoodWash activeIndex={activeIndex} />

      {/* Progress rail */}
      <div
        aria-hidden
        className="fixed left-0 top-0 z-20 h-[2px] transition-[width] duration-150 ease-linear"
        style={{
          width: `${progress * 100}%`,
          background: activeAccent,
          boxShadow: `0 0 10px ${activeAccent}`,
        }}
      />
      {/* Brand pill */}
      <div className="fixed left-5 top-4 z-20 flex items-center gap-2.5 font-mono text-[11px] uppercase tracking-[0.16em] text-white/45">
        <span
          className="h-2 w-2 rounded-full transition-colors duration-700"
          style={{ background: activeAccent, boxShadow: `0 0 10px ${activeAccent}` }}
        />
        SoleMD · The Clinical Connectome
      </div>

      <main
        id="main-content"
        ref={rootRef}
        className="dl-lecture relative z-10"
        style={shellStyle}
      >
        {/* Hero — the orb */}
        <section
          id="section-hero"
          className="flex min-h-screen flex-col items-center justify-center px-6 text-center"
          style={accentStyle("section-hero")}
        >
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-soft-blue)]">
            Delirium · Foundations
          </p>
          <h1 className="mt-4 max-w-[16ch] text-balance text-5xl font-light leading-[1.05] tracking-tight sm:text-6xl md:text-7xl">
            The brain is a <b className="font-semibold">network.</b>
          </h1>
          <p className="mt-5 max-w-[46ch] text-base font-light text-white/70 sm:text-lg">
            Scroll from the living connectome into the organ it describes, and
            watch acute brain failure unfold. The biology, shown.
          </p>
          <p className="mt-9 font-mono text-[11px] uppercase tracking-[0.18em] text-white/40">
            Begin ↓
          </p>
        </section>

        {/* Brain — the morph */}
        <section
          id="section-brain"
          className="relative min-h-[260vh]"
          style={accentStyle("section-brain")}
        >
          <div className="sticky top-0 flex min-h-screen items-center px-6 md:px-[6vw]">
            <div data-reveal className="dl-panel max-w-[440px]">
              <Eyebrow>Acute brain failure</Eyebrow>
              <h2 className="mt-3 text-3xl font-light tracking-tight text-white sm:text-4xl">
                Delirium is the brain, disconnected.
              </h2>
              <Lead>
                The same particles that were the connectome resolve into the
                brain itself: an acute, fluctuating failure of attention and
                awareness, and the substrate whose network failure is delirium.
              </Lead>
            </div>
          </div>
        </section>

        {/* Burden — why it matters, the numbers shown big */}
        <Beat id="section-burden" align="left">
          <Eyebrow num="01">Why it matters</Eyebrow>
          <h2 className="mt-3 text-3xl font-light tracking-tight text-white sm:text-4xl">
            A dose-dependent driver of death and dementia.
          </h2>
          <Lead>
            Delirium is not a nuisance. Every day of it compounds the harm, and
            the damage outlasts the hospital stay.
          </Lead>
          <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-5">
            <Stat value="+10%" label="mortality per day of delirium (HR 1.1/day)" />
            <Stat value="12.5×" label="risk of dementia (meta-analysis, n>5,000)" />
            <Stat value="40%" label="lasting cognitive impairment at 3–5 years" />
            <Stat value="$164B" label="annual US burden" />
          </div>
          <Cite>
            Pisani 2009 · Witlox 2010 · Pandharipande 2013 (BRAIN-ICU) · Leslie
            2008
          </Cite>
        </Beat>

        {/* Ratchet — who is vulnerable */}
        <Beat id="section-ratchet" align="right">
          <Eyebrow num="02">Who is vulnerable</Eyebrow>
          <h2 className="mt-3 text-3xl font-light tracking-tight text-white sm:text-4xl">
            Risk is a gradient, and each episode lowers the floor.
          </h2>
          <Lead>
            What the patient brings and what the hospital adds stack into the
            same risk. Then delirium itself ratchets the cognitive baseline
            down, and it never fully returns.
          </Lead>
          <div className="mt-5 space-y-2.5 font-mono text-[12px] text-white/70">
            <div className="flex justify-between gap-4">
              <span className="text-white/50">Predisposing</span>
              <span>dementia OR 5.2 · prior episode OR 8.6 · recurrent 13.9</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-white/50">Precipitating</span>
              <span>restraints RR 4.4 · anticholinergics OR 3.1</span>
            </div>
            <div className="flex justify-between gap-4 border-t border-white/10 pt-2.5">
              <span className="text-white/50">Stacked risk</span>
              <span>0 factors 9% → 3–4 factors 83%</span>
            </div>
          </div>
          <Cite>Inouye 1993 · Inouye 1996 · Fong 2009 · Richardson 2021 (DECIDE)</Cite>
        </Beat>

        {/* Siege — insult to siege */}
        <Beat id="section-siege" align="left">
          <Eyebrow num="03">From insult to siege</Eyebrow>
          <h2 className="mt-3 text-3xl font-light tracking-tight text-white sm:text-4xl">
            A whole-body insult crosses into the brain.
          </h2>
          <Lead>
            A fracture, sepsis, surgery, a drug. Damage signals and cytokines
            (IL-1, IL-6, TNF-α) breach a leaking blood-brain barrier; microglia
            activate and strip synapses. One continuous path from a broken hip
            to a broken brain.
          </Lead>
          <Cite>Maldonado 2018 · Cunningham 2009 · Taylor 2022</Cite>
        </Beat>

        {/* Disconnect — networks disconnect */}
        <Beat id="section-disconnect" align="right">
          <Eyebrow num="04">Networks disconnect</Eyebrow>
          <h2 className="mt-3 text-3xl font-light tracking-tight text-white sm:text-4xl">
            Long-range connections fail first.
          </h2>
          <Lead>
            The hardware is intact; the signal is lost. Frontoparietal tracts
            drop before local circuits, the thalamocortical relay locks into
            oscillatory mode, and the EEG slows from alpha (8–12 Hz) to
            theta-delta (3–5 Hz). Inattention is the cardinal sign.
          </Lead>
          <Cite>van Dellen 2014 · Choi 2012 · Numan 2017</Cite>
        </Beat>

        {/* Signature — the neurochemical signature */}
        <Beat id="section-signature" align="left">
          <Eyebrow num="05">The neurochemical signature</Eyebrow>
          <h2 className="mt-3 text-3xl font-light tracking-tight text-white sm:text-4xl">
            Three flood. Two drought. GABA cuts both ways.
          </h2>
          <Lead>
            Every transmitter maps to a behavior, a circuit, and one treatment
            lever. Read the direction as the signature.
          </Lead>
          <div className="mt-5 space-y-2 font-mono text-[12px]">
            <div className="flex items-center gap-3">
              <b className="text-base text-[var(--color-warm-coral)]">▲</b>
              <span className="text-white/70">
                Flood: dopamine, norepinephrine, glutamate
              </span>
            </div>
            <div className="flex items-center gap-3">
              <b className="text-base text-[var(--color-soft-blue)]">▼</b>
              <span className="text-white/70">
                Drought: acetylcholine, melatonin
              </span>
            </div>
            <div className="flex items-center gap-3">
              <b className="text-base text-white/60">▲▼</b>
              <span className="text-white/70">
                GABA: bidirectional (withdrawal vs iatrogenic)
              </span>
            </div>
          </div>
          <Cite>Maldonado 2018</Cite>
        </Beat>

        {/* Acetylcholine — the core deficit */}
        <Beat id="section-acetylcholine" align="right">
          <Eyebrow num="06">The core deficit</Eyebrow>
          <h2 className="mt-3 text-3xl font-light tracking-tight text-white sm:text-4xl">
            Acetylcholine goes dark.
          </h2>
          <Lead>
            ACh is the one transmitter that is down, the final common pathway
            nearly every etiology converges on. Basal forebrain projections to
            cortex and thalamus fail, signal-to-noise collapses, and attention
            with it. The lever is subtractive: stop anticholinergics, restore
            substrate. Cholinesterase inhibitors are not recommended.
          </Lead>
          <Cite>Hshieh 2008 · Trzepacz 2000 · Maldonado 2018</Cite>
        </Beat>

        {/* Lever — subtract, restore, reconnect */}
        <Beat id="section-lever" align="left">
          <Eyebrow num="07">The lever</Eyebrow>
          <h2 className="mt-3 text-3xl font-light tracking-tight text-white sm:text-4xl">
            Subtract, restore, reconnect.
          </h2>
          <Lead>
            Delirium is not one lesion but a network state, and network states
            recover. Remove the offenders, restore the substrate, protect sleep
            and circadian cues, and the connectome re-coheres. Prevention is
            cognitive preservation.
          </Lead>
          <Cite>Saper 2005 · Hatta 2014 · Eckstein 2019 (HELP, NNT 14.3)</Cite>
        </Beat>

        {/* Evidence — the closing drawer */}
        <section
          id="section-evidence"
          className="relative min-h-screen"
          style={accentStyle("section-evidence")}
        >
          <div className="flex min-h-screen items-center justify-center px-6 py-[12vh]">
            <div data-reveal className="dl-panel max-w-[560px]">
              <Eyebrow>The evidence</Eyebrow>
              <h2 className="mt-3 text-3xl font-light tracking-tight text-white sm:text-4xl">
                Grounded in the literature.
              </h2>
              <p className="mt-4 text-base font-light leading-relaxed text-white/70">
                This is Part 1 of a four-part framework: the WHY. The bedside
                recognition, the delirium bundle, and phenotype-driven
                prescribing build on this biology.
              </p>
              <dl className="mt-6 space-y-3 text-[13px] leading-relaxed">
                {[
                  ["Maldonado 2018", "Delirium pathophysiology: acute brain failure, the unifying hypothesis"],
                  ["Pandharipande 2013", "BRAIN-ICU: long-term cognitive impairment after critical illness"],
                  ["Witlox 2010", "Delirium and the risk of dementia, institutionalization, mortality"],
                  ["van Dellen 2014", "Decreased connectivity and disturbed directionality on EEG"],
                  ["Hshieh 2008", "The cholinergic deficiency hypothesis in delirium"],
                  ["Saper 2005", "Hypothalamic regulation of the sleep-wake switch"],
                ].map(([cite, desc]) => (
                  <div key={cite} className="flex gap-3">
                    <dt className="w-[128px] shrink-0 font-mono text-[11px] text-[var(--dl-accent)]">
                      {cite}
                    </dt>
                    <dd className="text-white/65">{desc}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-6 font-mono text-[10.5px] uppercase tracking-[0.18em] text-white/35">
                Jon Sole, MD · CL Psychiatry · SCVMC
              </p>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}

export function FieldDeliriumPage() {
  const reducedMotion = useReducedMotion();
  const { width: viewportWidth } = useViewportSize();
  const { sceneStateRef } = useFieldRuntime();
  const sceneStore = useFieldSceneStore();
  const isMobile =
    viewportWidth > 0 ? viewportWidth < FIELD_NON_DESKTOP_BREAKPOINT : false;

  useEffect(() => {
    sceneStateRef.current.motionEnabled = !reducedMotion;
  }, [reducedMotion, sceneStateRef]);

  // Put the shared field runtime into lecture mode: BlobController drives the
  // blob from the delirium timeline (morph + clinical beats). Restore on
  // unmount so a client-side nav back to the landing field is untouched.
  useEffect(() => {
    const sceneState = sceneStateRef.current;
    sceneState.lectureActive = true;
    return () => {
      sceneState.lectureActive = false;
    };
  }, [sceneStateRef]);

  return (
    <MotionConfig reducedMotion="user">
      <FixedStageManagerProvider
        isMobile={isMobile}
        manifest={DELIRIUM_MANIFEST}
        reducedMotion={!!reducedMotion}
        sceneStore={sceneStore}
        sceneStateRef={sceneStateRef}
      >
        <DeliriumContent />
      </FixedStageManagerProvider>
    </MotionConfig>
  );
}
