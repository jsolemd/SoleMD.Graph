// @ts-nocheck
"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import GlymphticVisualization from "./GlymphticVisualization";
import type { Section3State, NarrativePhase } from "./types";

const CYCLE_PERIOD = 50; // seconds - NE oscillation period
const TOTAL_TIME = 150; // seconds - 3 full cycles
const PLAYBACK_SPEED = 3; // Multiplier to accelerate autonomous timeline

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function interpolateState(progress: number, reduceMotion: boolean, cycleIndex = 0): Section3State {
  const p = clamp(progress, 0, 1);
  const isInitialCycle = cycleIndex === 0;

  // Determine narrative phase
  const phase: NarrativePhase = isInitialCycle
    ? p < 0.2
      ? "intro"
      : p < 0.4
        ? "oscillation"
        : p < 0.6
          ? "vasomotion"
          : p < 0.8
            ? "volume-exchange"
            : "flow-clearance"
    : p < 0.25
      ? "oscillation"
      : p < 0.5
        ? "vasomotion"
        : p < 0.75
          ? "volume-exchange"
          : "flow-clearance";

  // Time within visualization (0-150 seconds)
  const time = p * TOTAL_TIME;

  // NE oscillation: sinusoidal wave around baseline
  // Level oscillates between 0.3 and 0.7 (baseline 0.5 ± 0.2)
  const neBaseLevel = 0.5;
  const neAmplitude = 0.2;
  const neLevel = neBaseLevel + neAmplitude * Math.sin((2 * Math.PI * time) / CYCLE_PERIOD);

  // Vessel diameter follows NE with slight damping and phase lag
  // Diameter ranges from 0.8 to 1.2 (20% variation)
  const vesselDiameterTarget = lerp(0.8, 1.2, (neLevel - 0.3) / 0.4);
  const phaseLag = 0.15; // 15% phase lag
  const laggedTime = time - (CYCLE_PERIOD * phaseLag);
  const laggedNE = neBaseLevel + neAmplitude * Math.sin((2 * Math.PI * laggedTime) / CYCLE_PERIOD);
  const vesselDiameter = lerp(0.8, 1.2, (laggedNE - 0.3) / 0.4);

  // Blood and CSF volumes move in opposite phase
  // Blood volume follows NE directly
  // CSF volume is inverse (when blood high, CSF low)
  const bloodVolume = neLevel;
  const csfVolume = 1 - bloodVolume;

  // Flow rate increases in later stages
  const flowRate =
    phase === "intro" || phase === "oscillation"
      ? 0.48
      : phase === "vasomotion"
        ? 0.58
        : phase === "volume-exchange"
          ? 0.62
          : 0.8 + 0.2 * (1 - neLevel); // Peaks during arterial constriction

  // Waste concentration decreases with flow
  const wasteConcentration =
    phase === "intro" || phase === "oscillation"
      ? 0.85
      : phase === "vasomotion"
        ? 0.7
        : phase === "volume-exchange"
          ? 0.52
          : lerp(0.52, 0.2, (p - 0.8) / 0.2);

  const state: Section3State = {
    scrollProgress: p,
    phase,
    time,
    neLevel,
    vesselDiameter,
    csfVolume,
    bloodVolume,
    flowRate,
    wasteConcentration,
    colorTheme: "blue-orange",
    cycleIndex,
  };

  // Reduced motion adjustments
  if (reduceMotion) {
    return {
      ...state,
      flowRate: state.flowRate * 0.5,
      neLevel: 0.5, // Flat NE in reduced motion
      vesselDiameter: 1.0, // Static vessel
    };
  }

  return state;
}

const INITIAL_STATE: Section3State = interpolateState(0, false, 0);

export default function Section3Orchestrator() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const lastTimestampRef = useRef<number | null>(null);
  const accumulatedTimeRef = useRef<number>(0);
  const [state, setState] = useState<Section3State>(INITIAL_STATE);
  const [isActive, setIsActive] = useState(false);
  const prefersReducedMotion = useReducedMotion();
  const [resetKey, setResetKey] = useState(0);

  useEffect(() => {
    const element = containerRef.current;

    if (!element) {
      return undefined;
    }

    if (typeof IntersectionObserver === "undefined") {
      setIsActive(true);
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.target === element) {
            setIsActive(entry.isIntersecting);
          }
        });
      },
      { threshold: 0.35 }
    );

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    const stopAnimation = () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      lastTimestampRef.current = null;
    };

    if (prefersReducedMotion) {
      stopAnimation();
      setState((prev) => interpolateState(prev.scrollProgress, true, prev.cycleIndex));
      return undefined;
    }

    if (!isActive) {
      stopAnimation();
      return undefined;
    }

    const animate = (timestamp: number) => {
      if (lastTimestampRef.current === null) {
        lastTimestampRef.current = timestamp;
      }

      const deltaSeconds = ((timestamp - lastTimestampRef.current) / 1000) * PLAYBACK_SPEED;
      lastTimestampRef.current = timestamp;

      accumulatedTimeRef.current += deltaSeconds;

      const elapsedSeconds = accumulatedTimeRef.current;
      const cycleIndex = Math.floor(elapsedSeconds / TOTAL_TIME);
      const normalizedTime = elapsedSeconds % TOTAL_TIME;
      const progress = normalizedTime / TOTAL_TIME;

      setState(interpolateState(progress, false, cycleIndex));
      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      stopAnimation();
    };
  }, [isActive, prefersReducedMotion, resetKey]);

  const handleReset = useCallback(() => {
    accumulatedTimeRef.current = 0;
    lastTimestampRef.current = null;
    setState(interpolateState(0, prefersReducedMotion, 0));
    setResetKey((value) => value + 1);
  }, [prefersReducedMotion]);

  return (
    <section
      ref={containerRef}
      id="section3-glymphatic"
      className="relative flex flex-col justify-center items-stretch section-bg-standard"
      style={{ minHeight: "100vh" }}
    >
      <div className="relative z-10 w-full max-w-6xl mx-auto px-6 py-24">
        <div className="section-card-primary relative p-10">
          <button
            type="button"
            onClick={handleReset}
            className="absolute top-8 right-8 inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-medium shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
            style={{
              color: "var(--foreground)",
              backgroundColor: "hsl(var(--foreground) / 0.08)",
              border: "1px solid hsl(var(--foreground) / 0.18)",
              backdropFilter: "blur(6px)",
              boxShadow: "0 4px 12px hsl(var(--foreground) / 0.08)",
            }}
            aria-label="Restart glymphatic cycle"
          >
            Reset Cycle
          </button>
          <header className="text-center mb-12">
            <h2 className="text-section-title mb-6" style={{ color: "var(--foreground)" }}>
              The Night Crew&apos;s{" "}
              <span style={{ color: "var(--color-warm-coral)" }}>Plumbing</span>
            </h2>
            <p
              className="text-body-large max-w-3xl mx-auto text-opacity-secondary"
              style={{ color: "var(--foreground)" }}
            >
              NE oscillations drive vasomotion—a slow pump that moves CSF through perivascular spaces, clearing waste during NREM.
            </p>
          </header>

          <div>
            <GlymphticVisualization state={state} />
          </div>
        </div>
      </div>
    </section>
  );
}
