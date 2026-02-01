"use client";

import React, { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { gsap } from "gsap";
import IntegratedVisualization from "./IntegratedVisualization";
import type { Section2State } from "./types";

const INITIAL_STATE: Section2State = {
  scrollProgress: 0,
  phase: "wake",
  remBlendFactor: 0,
  cortexWaveFrequency: 10,
  cortexWaveAmplitude: 0.35,
  hypnogramStage: "wake",
  hypnogramProgress: 0,
  trnSpindleActive: false,
  trnSpindleIntensity: 0,
  memoryFlowRate: 0.2,
  memoryFlowPattern: "transfer",
  brainstemPosition: "nrem",
  atoniaEngaged: false,
  atoniaPathwayGlow: 0,
  eogAmplitude: 0.15,
  eogBurstRate: 0,
  eogBurstPattern: "minimal",
  emgAmplitude: 0.9,
  emgPattern: "irregular",
  respirationRate: 16,
  respirationAmplitude: 0.5,
  respirationPattern: "regular",
  heartRate: 72,
  heartRateVariability: 0.08,
  colorTheme: "blue",
  spectralPower: {
    frontal: { delta: 0.15, theta: 0.25 },
    parietal: { delta: 0.12, theta: 0.22 },
    limbic: { delta: 0.18, theta: 0.28 },
  },
};

gsap.registerPlugin(ScrollTrigger);

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function easeInOut(t: number) {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

// Smooth cubic easing for more natural transitions
function easeCubicInOut(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// Sine easing for wave-like transitions
function easeSineInOut(t: number) {
  return -(Math.cos(Math.PI * t) - 1) / 2;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function interpolateState(progress: number, reduceMotion: boolean): Section2State {
  const p = clamp(progress, 0, 1);

  // Human 90-min cycle physiology: ~5 min relaxed wake, 15 min N1, ~18 min N2, ~25 min N3, ~10 min N2 bridge, ~12 min REM, ~5 min N2 return
  const wakeEnd = 5 / 90;                // ≈0.0556 ─ relaxed wake eyes closed
  const n1End = 20 / 90;                 // ≈0.222 ─ extended N1 stage (15 min)
  const onsetEnd = 38 / 90;              // ≈0.422 ─ N2 consolidation concludes (shortened to 18 min)
  const deepEnd = 63 / 90;               // ≈0.7 ─ exit from slow-wave N3
  const remEntry = 73 / 90;              // ≈0.811 ─ N2 bridge into REM
  const remExit = 85 / 90;               // ≈0.944 ─ REM winds down (12 min REM episode)
  const cycleEnd = 90 / 90;              // 1.0 ─ return to N2, cycle complete

  const phase: Section2State["phase"] = p < wakeEnd
    ? "wake"
    : p < onsetEnd
    ? "nrem-onset"
    : p < deepEnd
    ? "nrem-deep"
    : p < remEntry
    ? "transition"
    : p < remExit
    ? "rem"
    : "transition";

  const phaseProgress = (() => {
    if (phase === "wake") {
      return wakeEnd === 0 ? 0 : p / wakeEnd;
    }
    if (phase === "nrem-onset") {
      return (p - wakeEnd) / (onsetEnd - wakeEnd);
    }
    if (phase === "nrem-deep") {
      return (p - onsetEnd) / (deepEnd - onsetEnd);
    }
    if (phase === "rem") {
      return (p - remEntry) / (remExit - remEntry);
    }

    // Transition phase: either into REM (deepEnd→remEntry) or out of REM (remExit→cycleEnd)
    const transitionBounds = p < remEntry ? [deepEnd, remEntry] : [remExit, cycleEnd];
    const span = transitionBounds[1] - transitionBounds[0];
    return span === 0 ? 0 : (p - transitionBounds[0]) / span;
  })();

  const eased = easeInOut(clamp(phaseProgress, 0, 1));
  const transitionDirection = phase === "transition"
    ? p >= remExit
      ? "from-rem"
      : "to-rem"
    : null;

  const approachingRem = transitionDirection === "to-rem";
  const leavingRem = transitionDirection === "from-rem";

  // Calculate smooth REM blend factor (0 = pure NREM, 1 = pure REM)
  // Start blending earlier and extend longer for smoother waveform transitions
  const remBlendFactor = (() => {
    if (p < deepEnd - 0.08) {
      // Pure NREM until approaching transition
      return 0;
    }
    if (p < remEntry) {
      // Gradual transition to REM (starts ~8% before transition phase)
      const blendProgress = (p - (deepEnd - 0.08)) / (remEntry - (deepEnd - 0.08));
      return easeSineInOut(clamp(blendProgress, 0, 1));
    }
    if (p < remExit) {
      // Pure REM during REM phase
      return 1;
    }
    // REM winds down: blend back to NREM from remExit to cycleEnd
    const windDownProgress = (p - remExit) / (cycleEnd - remExit);
    return 1 - easeSineInOut(clamp(windDownProgress, 0, 1));
  })();

  const state: Section2State = {
    scrollProgress: p,
    phase,
    remBlendFactor,
    cortexWaveFrequency: (() => {
      if (phase === "wake") return 10;
      if (phase === "nrem-onset") return lerp(5, 0.8, eased);
      if (phase === "nrem-deep") return lerp(0.8, 0.4, eased);
      if (phase === "transition") {
        if (leavingRem) {
          return lerp(6.4, 1.6, eased);
        }
        return lerp(0.6, 6.4, eased);
      }
      return 6.6;
    })(),
    cortexWaveAmplitude: (() => {
      if (phase === "wake") return 0.35;
      if (phase === "nrem-onset") return lerp(0.4, 0.75, eased);
      if (phase === "nrem-deep") return lerp(0.75, 0.98, eased);
      if (phase === "transition") {
        if (leavingRem) {
          return lerp(0.55, 0.78, eased);
        }
        return lerp(0.95, 0.55, eased);
      }
      return 0.55;
    })(),
    hypnogramStage: (() => {
      if (phase === "wake") return "wake";
      if (phase === "nrem-onset") return p < n1End ? "n1" : "n2";
      if (phase === "nrem-deep") return "n3";
      if (phase === "rem") return "rem";
      if (phase === "transition") {
        if (approachingRem) {
          return eased < 0.7 ? "n2" : "rem";
        }
        // Leaving REM: transition back to N2
        return eased > 0.3 ? "n2" : "rem";
      }
      return "n2";
    })(),
    hypnogramProgress: p,
    trnSpindleActive: phase !== "rem" || leavingRem,
    trnSpindleIntensity: (() => {
      // Spindles mark N2; they are absent in wake/N1 and sparse in consolidated N3
      if (phase === "wake") return 0;
      if (phase === "nrem-onset") {
        const isN1 = p < n1End;
        if (isN1) return 0;
        // Once in N2, ramp spindle strength to its peak
        const n2Start = n1End;
        const n2Progress = (p - n2Start) / (onsetEnd - n2Start);
        return lerp(0.3, 0.7, n2Progress);
      }
      if (phase === "nrem-deep") {
        // Stage N3 retains only low-density spindles riding on delta
        return lerp(0.18, 0.06, eased);
      }
      if (phase === "transition") {
        if (leavingRem) {
          // Re-entering N2: rebuild spindles from a quiet baseline
          return lerp(0.08, 0.6, eased);
        }
        // Approaching REM: spindles taper before the switch flips
        return lerp(0.45, 0.08, eased);
      }
      return 0.02;
    })(),
    memoryFlowRate: (() => {
      if (phase === "nrem-onset") return lerp(0.32, 0.62, eased);
      if (phase === "nrem-deep") return lerp(0.62, 0.95, eased);
      if (phase === "transition") {
        if (leavingRem) {
          return lerp(0.78, 0.55, eased);
        }
        return lerp(0.95, 0.82, eased);
      }
      return 0.86;
    })(),
    memoryFlowPattern: phase === "rem" ? "sync" : "transfer",
    brainstemPosition: (() => {
      if (phase === "rem") return "rem";
      if (phase === "transition") {
        if (approachingRem) return eased > 0.5 ? "rem" : "nrem";
        // Leaving REM: switch back to NREM
        return eased > 0.5 ? "nrem" : "rem";
      }
      return "nrem";
    })(),
    atoniaEngaged: (() => {
      if (phase === "rem") return true;
      if (phase === "transition") {
        if (approachingRem) {
          return eased > 0.55;
        }
        // Leaving REM: disengage atonia (EMG tone returns)
        return eased < 0.45;
      }
      return false;
    })(),
    atoniaPathwayGlow: (() => {
      if (phase === "transition") {
        if (leavingRem) {
          return lerp(1, 0.1, eased);
        }
        return lerp(0.1, 1, eased);
      }
      if (phase === "rem") return 1;
      return 0.1;
    })(),
    eogAmplitude: (() => {
      if (phase === "transition") {
        if (leavingRem) {
          return lerp(0.7, 0.25, eased);
        }
        return lerp(0.25, 0.7, eased);
      }
      if (phase === "rem") return lerp(0.7, 0.85, eased);
      return 0.22;
    })(),
    eogBurstRate: (() => {
      if (phase === "transition") {
        if (leavingRem) {
          return lerp(0.65, 0.12, eased);
        }
        return lerp(0.12, 0.65, eased);
      }
      if (phase === "rem") return lerp(0.65, 0.95, eased);
      return 0.08;
    })(),
    eogBurstPattern: (() => {
      if (phase === "transition") return leavingRem ? "minimal" : "emerging";
      if (phase === "rem") return "rem-saccades";
      return "minimal";
    })(),
    emgAmplitude: (() => {
      if (phase === "transition") {
        if (leavingRem) {
          return lerp(0.12, 0.55, eased);
        }
        return lerp(0.62, 0.12, eased);
      }
      if (phase === "rem") return lerp(0.12, 0.08, eased);
      if (phase === "nrem-deep") return 0.68;
      return 0.62;
    })(),
    emgPattern: (() => {
      if (phase === "transition") return leavingRem ? "irregular" : "flattening";
      if (phase === "rem") return "flatline";
      return "irregular";
    })(),
    respirationRate: (() => {
      if (phase === "transition") {
        if (leavingRem) {
          return lerp(15.5, 13.2, eased);
        }
        return lerp(13.2, 15.4, eased);
      }
      if (phase === "rem") return lerp(15.4, 16.2, eased);
      return phase === "nrem-deep" ? 12.8 : 13.8;
    })(),
    respirationAmplitude: (() => {
      if (phase === "transition") {
        if (leavingRem) {
          return lerp(0.48, 0.62, eased);
        }
        return lerp(0.66, 0.48, eased);
      }
      if (phase === "rem") return lerp(0.48, 0.42, eased);
      return phase === "nrem-deep" ? 0.66 : 0.6;
    })(),
    respirationPattern: (() => {
      if (phase === "rem") return "irregular";
      if (phase === "transition") {
        return approachingRem && eased > 0.55 ? "irregular" : "regular";
      }
      return "regular";
    })(),
    heartRate: (() => {
      if (phase === "transition") {
        if (leavingRem) {
          return lerp(70, 62, eased);
        }
        return lerp(63, 70, eased);
      }
      if (phase === "rem") return lerp(70, 74, eased);
      return phase === "nrem-deep" ? 60 : 63;
    })(),
    heartRateVariability: (() => {
      if (phase === "transition") {
        if (leavingRem) {
          return lerp(0.12, 0.05, eased);
        }
        return lerp(0.05, 0.12, eased);
      }
      if (phase === "rem") return lerp(0.12, 0.22, eased);
      return phase === "nrem-deep" ? 0.04 : 0.05;
    })(),
    colorTheme: (() => {
      if (phase === "rem") return "purple";
      if (phase === "transition") {
        if (approachingRem) return "transition";
        // Leaving REM: transition back to blue (N2)
        return eased > 0.5 ? "blue" : "transition";
      }
      return "blue";
    })(),
    spectralPower: (() => {
      const deltaBase = (() => {
        if (phase === "wake") return 0.15;
        if (phase === "nrem-onset") return lerp(0.25, 0.65, eased);
        if (phase === "nrem-deep") return 1;
        if (phase === "transition") {
          if (leavingRem) {
            return lerp(0.35, 0.75, eased);
          }
          return lerp(0.9, 0.35, eased);
        }
        if (phase === "rem") return 0.3;
        return 0.65;
      })();
      const thetaBase = (() => {
        if (phase === "wake") return 0.25;
        if (phase === "nrem-onset") return lerp(0.35, 0.25, eased);
        if (phase === "rem") return 0.95;
        if (phase === "transition") {
          if (leavingRem) {
            return lerp(0.85, 0.35, eased);
          }
          return lerp(0.3, 0.85, eased);
        }
        return 0.25;
      })();
      return {
        frontal: { delta: deltaBase, theta: thetaBase * 0.6 },
        parietal: { delta: deltaBase * 0.85, theta: thetaBase * 0.8 },
        limbic: { delta: deltaBase * 0.7, theta: thetaBase },
      };
    })(),
  };

  if (!reduceMotion) {
    return state;
  }

  const amplitudeScale = 0.6;
  const reducedState: Section2State = {
    ...state,
    cortexWaveAmplitude: state.cortexWaveAmplitude * amplitudeScale,
    eogAmplitude: state.eogAmplitude * amplitudeScale,
    emgAmplitude: state.emgAmplitude * amplitudeScale,
    respirationAmplitude: state.respirationAmplitude * amplitudeScale,
    heartRateVariability: state.heartRateVariability * amplitudeScale,
    memoryFlowRate: state.memoryFlowRate * 0.7,
    trnSpindleIntensity: state.trnSpindleIntensity * amplitudeScale,
    atoniaPathwayGlow: state.atoniaPathwayGlow * 0.7,
  };

  return reducedState;
}

export default function Section2Orchestrator() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [state, setState] = useState<Section2State>(INITIAL_STATE);
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    if (typeof window === "undefined" || !containerRef.current) {
      return;
    }

    const trigger = ScrollTrigger.create({
      trigger: containerRef.current,
      start: "top top",
      end: "+=200%",
      pin: true,
      scrub: 1.5,
      onUpdate: (self) => {
        setState(interpolateState(self.progress, prefersReducedMotion));
      },
    });

    return () => {
      trigger.kill();
    };
  }, [prefersReducedMotion]);

  useEffect(() => {
    setState((prev) => interpolateState(prev.scrollProgress, prefersReducedMotion));
  }, [prefersReducedMotion]);

  return (
    <section
      ref={containerRef}
      id="section2-nrem-rem"
      className="relative flex flex-col justify-center items-stretch section-bg-standard"
      style={{ minHeight: "100vh" }}
    >
      <div className="relative z-10 w-full max-w-6xl mx-auto px-6 py-24">
        <div className="section-card-primary p-10">
          <header className="text-center mb-12">
            <h2 className="text-section-title mb-6" style={{ color: "var(--color-soft-blue)" }}>
              The NREM → REM Circuit
            </h2>
            <p
              className="text-body-large max-w-3xl mx-auto text-opacity-secondary"
              style={{ color: "var(--foreground)" }}
            >
              Scroll to drive the brain&apos;s flip from NREM workshop mode to REM rehearsal mode. Watch the paradox unfold: brain on, body off.
            </p>
          </header>

          <div>
            <IntegratedVisualization state={state} />
          </div>
        </div>
      </div>
    </section>
  );
}
