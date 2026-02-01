"use client";

import React, { useMemo } from "react";
import { Group } from "@visx/group";
import { LinearGradient } from "@visx/gradient";
import { LinePath } from "@visx/shape";
import { AxisBottom, AxisLeft } from "@visx/axis";
import { scaleBand, scaleLinear } from "@visx/scale";
import { ParentSize } from "@visx/responsive";
import type { Section2State } from "./types";
import EnhancedHypnogram from "./EnhancedHypnogram";
import PSGTraces from "./PSGTraces";
import { generateRegionalWaveform, REGIONAL_SIGNAL_DOMAINS } from "./brainRegionSignals";

interface IntegratedVisualizationProps {
  state: Section2State;
}

interface WavePoint {
  x: number;
  y: number;
}

interface HypnogramSegment {
  stage: "wake" | "n1" | "n2" | "n3" | "rem";
  start: number;
  end: number;
}

interface SpectralEntry {
  key: string;
  label: string;
  delta: number;
  theta: number;
}

const EEG_COLOR_DELTA = "#7BA5DD";
const EEG_COLOR_THETA = "#14b8a6";
const EOG_COLOR = "#C6B4F4";
const RESP_COLOR = "#8AD4A0";
const HR_COLOR = "#F4D35E";
const EMG_COLOR = "#E07A7A";

const STAGE_COLORS: Record<HypnogramSegment["stage"], string> = {
  wake: "rgba(248, 211, 121, 0.4)",
  n1: "rgba(127, 156, 220, 0.3)",
  n2: "rgba(98, 133, 204, 0.36)",
  n3: "rgba(51, 86, 148, 0.5)",
  rem: "rgba(20, 184, 166, 0.42)",
};

const STAGE_DEPTH: Record<HypnogramSegment["stage"], number> = {
  wake: 0.12,
  n1: 0.32,
  n2: 0.54,
  n3: 0.88,
  rem: 0.36,
};

const STAGE_LABELS: Record<HypnogramSegment["stage"], string> = {
  wake: "Wake",
  n1: "N1",
  n2: "N2",
  n3: "N3",
  rem: "REM",
};

const PHASE_DETAILS: Record<Section2State["phase"], { title: string; summary: string; cue: string }> = {
  wake: {
    title: "Relaxed Wake",
    summary: "Alpha rhythm dominates in occipital cortex; arousal systems maintain alertness and muscle tone.",
    cue: "Eyes closed, relaxed wakefulness–alpha waves at 8-13 Hz with beta interspersed.",
  },
  "nrem-onset": {
    title: "NREM Onset",
    summary: "Spindles rise as the thalamic gate quiets sensory flow and the hippocampus cues replay packets.",
    cue: "TRN spindles shield cortex while hippocampal ripples start the workshop shift.",
  },
  "nrem-deep": {
    title: "Deep NREM",
    summary: "Slow waves saturate cortex; delta power drives metabolic cleanup and synaptic down-selection.",
    cue: "Delta peaks, memory transfer accelerates, cerebrospinal flow surges.",
  },
  transition: {
    title: "Transition",
    summary: "REM-on drive builds; theta leaks in as the flip-flop rebalances and muscle tone collapses.",
    cue: "Flip-flop circuit shifts from NREM to REM drive.",
  },
  rem: {
    title: "REM Rehearsal",
    summary: "Wake-like cortex runs rehearsal scripts while the spinal cord stays locked by REM-atonia.",
    cue: "Theta dominates, eyes dart, body remains offline.",
  },
};

const SPECTRAL_SUMMARIES: Record<Section2State["phase"], string> = {
  wake: "Alpha and beta keep cortex alert; delta idles while theta stays quiet.",
  "nrem-onset": "Spindles spike as delta builds in cortex; theta still muted across regions.",
  "nrem-deep": "High delta synchrony locks in maintenance while theta rests at baseline.",
  transition: "Delta loosens its grip as theta climbs, handing the network toward REM.",
  rem: "Theta surges limbic-first while delta recedes–REM rehearsal in motion.",
};
const HYPNOGRAM_PHASE_SUMMARIES: Record<Section2State["phase"], string> = {
  wake: "Stage trace hovers at wake while baseline checks finish before lights-out.",
  "nrem-onset": "The line glides through N1 into N2 as spindles begin to bloom and depth builds.",
  "nrem-deep": "Deep N3 pulls the ribbon to the floor; delta keeps it anchored for heavy maintenance.",
  transition: "Stage climbs back up through the N2 bridge as REM pressure mounts for the flip.",
  rem: "Ribbon snaps to the REM plateau where cortex runs hot while muscles stay offline.",
};

const getHypnogramRibbonSummary = (state: Section2State): string => {
  const stageLabel = STAGE_LABELS[state.hypnogramStage];
  switch (state.phase) {
    case "wake":
      return "Stage marker holds in Wake while calibration completes before descent.";
    case "nrem-onset":
      return `${stageLabel} anchors mid-ramp as spindles pull the trace downward and inputs quiet.`;
    case "nrem-deep":
      return `Trace beds down in ${stageLabel}; slow-wave troughs keep the ribbon near the floor.`;
    case "transition":
      return state.brainstemPosition === "rem"
        ? "Cycle climbs back through N2 as REM lets go, resetting for the next descent."
        : "Ribbon tilts upward toward REM, bridging through N2 while atonia builds.";
    case "rem":
      return "Marker rockets to the REM roofline; rehearsal runs while the body stays immobilized.";
    default:
      return `Stage ribbon flexes with the ${stageLabel} portion of the cycle.`;
  }
};

const getPolysomnographySummary = (state: Section2State): string => {
  const rate = Math.round(state.respirationRate);
  const respirationDescriptor = state.respirationPattern === "irregular" ? "turns irregular" : "stays steady";
  const stageLabel = state.hypnogramStage.toUpperCase();
  const eogBursting = state.eogBurstPattern === "rem-saccades";
  const emgFlat = state.emgPattern === "flatline";

  switch (state.phase) {
    case "wake":
      return "Baseline check: mixed alpha/beta with active chin tone and quiet eyes before lights go down.";
    case "nrem-onset":
      return `Spindles spark while chin EMG softens; respiration settles near ${rate}/min as ${stageLabel} takes hold.`;
    case "nrem-deep":
      return `Delta floods the leads, EMG nearly flat, and breathing slows to about ${rate}/min deep in N3.`;
    case "transition":
      if (state.brainstemPosition === "rem") {
        return "REM release: EMG tremor returns and eye bursts fade as the cycle climbs back toward N2.";
      }
      if (eogBursting) {
        return "EOG bursts ignite while chin tone collapses�the REM gateway is opening.";
      }
      return `Stage lifts toward REM; EMG keeps fading while breathing ${respirationDescriptor}.`;
    case "rem":
      if (eogBursting && emgFlat) {
        return `Rapid eye bursts ride atop a flat chin trace�classic REM while respiration quickens to ${rate}/min.`;
      }
      return `REM rehearsal keeps cortex active even as the body stays offline and breathing ${respirationDescriptor}.`;
    default:
      return `Signals pivot with the ${stageLabel} stage currently in view.`;
  }
};


function createWave({
  samples,
  amplitude,
  frequency,
  variance = 0,
  phase = 0,
}: {
  samples: number;
  amplitude: number;
  frequency: number;
  variance?: number;
  phase?: number;
}): WavePoint[] {
  const data: WavePoint[] = [];
  for (let i = 0; i < samples; i += 1) {
    const progress = i / (samples - 1);
    const theta = progress * Math.PI * 2 * frequency + phase;
    const jitter = variance ? Math.sin(i * 1.87) * variance : 0;
    data.push({ x: progress, y: Math.sin(theta) * amplitude + jitter });
  }
  return data;
}

function buildHypnogramSegments(state: Section2State): HypnogramSegment[] {
  const segments: HypnogramSegment[] = [
    { stage: "wake", start: 0, end: 5 / 90 },
    { stage: "n1", start: 5 / 90, end: 7 / 90 },
    { stage: "n2", start: 7 / 90, end: 37 / 90 },
    { stage: "n3", start: 37 / 90, end: 67 / 90 },
    { stage: "n2", start: 67 / 90, end: 77 / 90 },
    { stage: "rem", start: 77 / 90, end: 87 / 90 },
    { stage: "n2", start: 87 / 90, end: 1 },
  ];

  return segments;
}

function buildHypnogramData(segments: HypnogramSegment[]): WavePoint[] {
  const data: WavePoint[] = [];
  segments.forEach((segment) => {
    data.push({ x: segment.start, y: STAGE_DEPTH[segment.stage] });
    data.push({ x: segment.end, y: STAGE_DEPTH[segment.stage] });
  });
  return data;
}

function formatBpm(value: number) {
  return Math.round(value).toString() + " bpm";
}
export default function IntegratedVisualization({ state }: IntegratedVisualizationProps) {

  return (
    <div className="space-y-12">
      <EnhancedHypnogramSection state={state} />
      <BrainCircuitNetwork state={state} />
      <BottomPanels state={state} />
    </div>
  );
}

function BottomPanels({ state }: { state: Section2State }) {
  // Generate comprehensive spectral data for all brain regions and frequency bands with smooth interpolation
  const spectralEntries = useMemo(() => {
    // Smooth interpolation helper - creates fade between phases based on scroll progress
    // Parameters: wake, N1, N2, N3, transition, REM, N2_return
    const interpolateSpectral = (wake: number, n1: number, n2: number, n3: number, transition: number, rem: number, n2Return: number) => {
      const p = state.scrollProgress;
      // Wake: 0-5.5%
      if (p < 0.055) return wake;
      // Wake → N1 transition: 5.5-7.7%
      if (p < 0.077) return wake + (n1 - wake) * ((p - 0.055) / 0.022);
      // N1 → N2 transition: 7.7-12%
      if (p < 0.12) return n1 + (n2 - n1) * ((p - 0.077) / 0.043);
      // N2: 12-41%
      if (p < 0.41) return n2;
      // N2 → N3 transition: 41-50%
      if (p < 0.5) return n2 + (n3 - n2) * ((p - 0.41) / 0.09);
      // N3: 50-68%
      if (p < 0.68) return n3;
      // N3 → transition: 68-77%
      if (p < 0.77) return n3 + (transition - n3) * ((p - 0.68) / 0.09);
      // Transition → REM: 77-85.5%
      if (p < 0.855) return transition + (rem - transition) * ((p - 0.77) / 0.085);
      // REM: 85.5-94%
      if (p < 0.94) return rem;
      // REM wind-down → N2 return: 94-100%
      return rem + (n2Return - rem) * ((p - 0.94) / 0.06);
    };

    return [
      {
        region: "Prefrontal",
        delta: interpolateSpectral(0.15, 0.25, 0.65, 0.95, 0.65, 0.15, 0.6),
        theta: interpolateSpectral(0.25, 0.35, 0.25, 0.25, 0.4, 0.8, 0.3),
        alpha: interpolateSpectral(0.65, 0.45, 0.35, 0.3, 0.25, 0.2, 0.35),
        sigma: interpolateSpectral(0.1, 0.1, 0.85, 0.2, 0.7, 0.1, 0.75),
        beta: interpolateSpectral(0.35, 0.25, 0.2, 0.15, 0.3, 0.65, 0.25),
        gamma: interpolateSpectral(0.15, 0.12, 0.1, 0.08, 0.2, 0.55, 0.12)
      },
      {
        region: "Primary Motor",
        delta: interpolateSpectral(0.2, 0.3, 0.7, 0.9, 0.7, 0.2, 0.65),
        theta: interpolateSpectral(0.3, 0.4, 0.3, 0.3, 0.45, 0.7, 0.35),
        alpha: interpolateSpectral(0.6, 0.5, 0.4, 0.35, 0.35, 0.3, 0.4),
        sigma: interpolateSpectral(0.15, 0.15, 0.8, 0.25, 0.65, 0.15, 0.7),
        beta: interpolateSpectral(0.4, 0.3, 0.25, 0.2, 0.35, 0.6, 0.3),
        gamma: interpolateSpectral(0.2, 0.18, 0.15, 0.12, 0.25, 0.5, 0.18)
      },
      {
        region: "Posterior Parietal",
        delta: interpolateSpectral(0.12, 0.25, 0.6, 0.85, 0.6, 0.25, 0.55),
        theta: interpolateSpectral(0.22, 0.3, 0.28, 0.28, 0.5, 0.75, 0.32),
        alpha: interpolateSpectral(0.75, 0.55, 0.45, 0.35, 0.35, 0.25, 0.45),
        sigma: interpolateSpectral(0.2, 0.2, 0.9, 0.3, 0.8, 0.2, 0.8),
        beta: interpolateSpectral(0.35, 0.3, 0.25, 0.2, 0.35, 0.55, 0.3),
        gamma: interpolateSpectral(0.2, 0.18, 0.15, 0.12, 0.25, 0.45, 0.18)
      },
      {
        region: "Temporal Association",
        delta: interpolateSpectral(0.18, 0.28, 0.55, 0.8, 0.55, 0.3, 0.5),
        theta: interpolateSpectral(0.28, 0.35, 0.32, 0.3, 0.55, 0.85, 0.38),
        alpha: interpolateSpectral(0.65, 0.5, 0.4, 0.35, 0.35, 0.35, 0.4),
        sigma: interpolateSpectral(0.25, 0.25, 0.85, 0.3, 0.7, 0.25, 0.75),
        beta: interpolateSpectral(0.4, 0.35, 0.3, 0.25, 0.35, 0.5, 0.35),
        gamma: interpolateSpectral(0.3, 0.28, 0.25, 0.2, 0.3, 0.4, 0.28)
      },
      {
        region: "Occipital",
        delta: interpolateSpectral(0.1, 0.2, 0.5, 0.75, 0.5, 0.2, 0.45),
        theta: interpolateSpectral(0.2, 0.28, 0.25, 0.25, 0.45, 0.65, 0.3),
        alpha: interpolateSpectral(0.85, 0.6, 0.5, 0.4, 0.45, 0.4, 0.5),
        sigma: interpolateSpectral(0.15, 0.15, 0.75, 0.2, 0.6, 0.15, 0.65),
        beta: interpolateSpectral(0.3, 0.25, 0.2, 0.18, 0.3, 0.45, 0.25),
        gamma: interpolateSpectral(0.15, 0.15, 0.12, 0.1, 0.2, 0.35, 0.15)
      },
      {
        region: "Anterior Cingulate",
        delta: interpolateSpectral(0.15, 0.28, 0.65, 0.9, 0.65, 0.25, 0.6),
        theta: interpolateSpectral(0.3, 0.38, 0.32, 0.3, 0.5, 0.8, 0.38),
        alpha: interpolateSpectral(0.6, 0.48, 0.4, 0.35, 0.35, 0.3, 0.4),
        sigma: interpolateSpectral(0.2, 0.2, 0.85, 0.25, 0.75, 0.2, 0.75),
        beta: interpolateSpectral(0.4, 0.32, 0.25, 0.2, 0.35, 0.6, 0.3),
        gamma: interpolateSpectral(0.25, 0.22, 0.18, 0.15, 0.25, 0.5, 0.22)
      },
      {
        region: "Hippocampus",
        delta: interpolateSpectral(0.18, 0.25, 0.45, 0.7, 0.45, 0.15, 0.4),
        theta: interpolateSpectral(0.5, 0.55, 0.48, 0.45, 0.65, 0.95, 0.5),
        alpha: interpolateSpectral(0.55, 0.42, 0.35, 0.3, 0.32, 0.25, 0.35),
        sigma: interpolateSpectral(0.1, 0.1, 0.7, 0.15, 0.55, 0.1, 0.6),
        beta: interpolateSpectral(0.3, 0.25, 0.18, 0.15, 0.25, 0.4, 0.22),
        gamma: interpolateSpectral(0.2, 0.18, 0.15, 0.12, 0.25, 0.6, 0.18)
      },
      {
        region: "Amygdala",
        delta: interpolateSpectral(0.2, 0.3, 0.5, 0.65, 0.5, 0.3, 0.45),
        theta: interpolateSpectral(0.35, 0.42, 0.38, 0.35, 0.6, 0.85, 0.4),
        alpha: interpolateSpectral(0.55, 0.45, 0.38, 0.35, 0.35, 0.35, 0.38),
        sigma: interpolateSpectral(0.15, 0.15, 0.65, 0.2, 0.5, 0.15, 0.55),
        beta: interpolateSpectral(0.35, 0.28, 0.22, 0.18, 0.3, 0.5, 0.28),
        gamma: interpolateSpectral(0.25, 0.22, 0.18, 0.15, 0.25, 0.45, 0.22)
      },
      {
        region: "Thalamus Relay",
        delta: interpolateSpectral(0.12, 0.25, 0.6, 0.85, 0.6, 0.2, 0.55),
        theta: interpolateSpectral(0.25, 0.32, 0.28, 0.25, 0.45, 0.7, 0.32),
        alpha: interpolateSpectral(0.5, 0.38, 0.3, 0.25, 0.28, 0.2, 0.3),
        sigma: interpolateSpectral(0.15, 0.15, 0.95, 0.3, 0.9, 0.15, 0.85),
        beta: interpolateSpectral(0.35, 0.28, 0.22, 0.18, 0.3, 0.55, 0.28),
        gamma: interpolateSpectral(0.15, 0.12, 0.1, 0.08, 0.18, 0.4, 0.15)
      },
      {
        region: "Pons / Medulla",
        delta: interpolateSpectral(0.25, 0.35, 0.55, 0.7, 0.55, 0.35, 0.5),
        theta: interpolateSpectral(0.3, 0.38, 0.35, 0.32, 0.5, 0.75, 0.38),
        alpha: interpolateSpectral(0.5, 0.42, 0.35, 0.3, 0.32, 0.3, 0.35),
        sigma: interpolateSpectral(0.2, 0.2, 0.6, 0.25, 0.45, 0.2, 0.5),
        beta: interpolateSpectral(0.45, 0.38, 0.32, 0.28, 0.4, 0.65, 0.38),
        gamma: interpolateSpectral(0.3, 0.28, 0.25, 0.2, 0.32, 0.55, 0.3)
      },
    ];
  }, [state.scrollProgress]);

  const spectralSummary = SPECTRAL_SUMMARIES[state.phase] ?? SPECTRAL_SUMMARIES.transition;
  const averageDelta = spectralEntries.length ? spectralEntries.reduce((sum, entry) => sum + entry.delta, 0) / spectralEntries.length : 0;
  const averageTheta = spectralEntries.length ? spectralEntries.reduce((sum, entry) => sum + entry.theta, 0) / spectralEntries.length : 0;
  const deltaDisplay = `${Math.round(averageDelta * 100)}%`;
  const thetaDisplay = `${Math.round(averageTheta * 100)}%`;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Left: Polysomnography */}
      <PolysomnographyPanel state={state} />

      {/* Right: Spectral Balance Map */}
      <section
        className="rounded-3xl border px-4 py-6 sm:px-6 transition-all duration-1000"
        style={{
          backgroundColor: "var(--card)",
          borderColor: state.phase === 'rem' ? "rgba(20,184,166,0.35)" : "var(--border)",
          boxShadow: state.phase === 'rem'
            ? "0 24px 60px rgba(20, 184, 166, 0.12)"
            : "0 24px 60px rgba(9, 15, 28, 0.2)",
        }}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="text-lg sm:text-xl font-semibold" style={{ color: "var(--foreground)" }}>
              Spectral Balance Map
            </h3>
            <p className="mt-1 text-sm sm:text-base" style={{ color: "var(--foreground)", opacity: 0.68 }}>
              {spectralSummary}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <SignalChip label="Δ avg" value={deltaDisplay} color={EEG_COLOR_DELTA} />
            <SignalChip label="θ avg" value={thetaDisplay} color={EEG_COLOR_THETA} />
          </div>
        </div>
        <div className="mt-6 flex justify-center">
          <SpectralHeatmap entries={spectralEntries} />
        </div>
        <div className="mt-4 text-xs text-center" style={{ color: "rgba(229,233,255,0.55)", letterSpacing: "0.04em" }}>
          Network mean Δ ≈ {deltaDisplay} | θ ≈ {thetaDisplay}
        </div>
      </section>
    </div>
  );
}

function EnhancedHypnogramSection({ state }: { state: Section2State }) {
  const summary = HYPNOGRAM_PHASE_SUMMARIES[state.phase] ?? "Stage trace flexes with the current cycle.";
  return (
    <section
      className="rounded-3xl border px-4 py-4 sm:px-6 transition-all duration-1000"
      style={{
        backgroundColor: "var(--card)",
        borderColor: state.phase === 'rem' ? "rgba(20,184,166,0.4)" : "var(--border)",
        boxShadow: state.phase === 'rem'
          ? "0 24px 60px rgba(20, 184, 166, 0.15)"
          : "0 24px 60px rgba(9, 15, 28, 0.2)",
      }}
    >
      <div>
        <h3 className="text-lg sm:text-xl font-semibold" style={{ color: "var(--foreground)" }}>
          Hypnogram – 90-Minute Sleep Cycle
        </h3>
      </div>
      <div className="mt-4" style={{ height: "160px" }}>
        <EnhancedHypnogram state={state} />
      </div>
    </section>
  );
}

function HypnogramRibbon({ state }: { state: Section2State }) {
  const segments = useMemo(() => buildHypnogramSegments(state), [state]);
  const data = useMemo(() => buildHypnogramData(segments), [segments]);

  return (
    <section
      className="rounded-3xl border px-4 py-6 sm:px-6"
      style={{
        backgroundColor: "var(--card)",
        borderColor: "var(--border)",
        boxShadow: "0 24px 60px rgba(9, 15, 28, 0.2)",
      }}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 className="text-lg sm:text-xl font-semibold" style={{ color: "var(--foreground)" }}>
            Hypnogram — First 90 Minutes
          </h3>
          <p className="mt-1 text-sm sm:text-base" style={{ color: "var(--foreground)", opacity: 0.68 }}>
            {getHypnogramRibbonSummary(state)}
          </p>
        </div>
        <div className="text-xs uppercase tracking-[0.32em]" style={{ color: "var(--foreground)", opacity: 0.5 }}>
          {PHASE_DETAILS[state.phase].cue}
        </div>
      </div>
      <div className="mt-6" style={{ height: "160px" }}>
        <ParentSize debounceTime={0}>
          {({ width, height }) => (
            <HypnogramCanvas width={width} height={height} segments={segments} data={data} progress={state.scrollProgress} />
          )}
        </ParentSize>
      </div>
    </section>
  );
}

function HypnogramCanvas({
  width,
  height,
  segments,
  data,
  progress,
}: {
  width: number;
  height: number;
  segments: HypnogramSegment[];
  data: WavePoint[];
  progress: number;
}) {
  const margin = { top: 16, right: 40, bottom: 32, left: 80 };
  const innerWidth = Math.max(width - margin.left - margin.right, 200);
  const innerHeight = Math.max(height - margin.top - margin.bottom, 80);

  const xScale = useMemo(
    () => scaleLinear<number>({ domain: [0, 1], range: [margin.left, margin.left + innerWidth] }),
    [innerWidth, margin.left],
  );
  const yScale = useMemo(
    () => scaleLinear<number>({ domain: [1, 0], range: [margin.top, margin.top + innerHeight] }),
    [innerHeight, margin.top],
  );

  const progressX = xScale(progress);
  const progressLabelX = Math.min(Math.max(progressX, margin.left + 24), margin.left + innerWidth - 24);

  return (
    <svg width={width} height={height} style={{ display: "block" }}>
      <rect width={width} height={height} fill="transparent" />

      {segments.map((segment, index) => {
        const xStart = xScale(segment.start);
        const xEnd = xScale(segment.end);
        const depth = STAGE_DEPTH[segment.stage];
        const bandSize = segment.stage === "n3" ? 0.12 : segment.stage === "n2" ? 0.1 : 0.06;
        const yStart = yScale(depth + bandSize);
        const yEnd = yScale(depth - bandSize);
        return (
          <Group key={"stage-" + index}>
            <rect
              x={xStart}
              y={Math.min(yStart, yEnd)}
              width={xEnd - xStart}
              height={Math.abs(yEnd - yStart)}
              rx={12}
              fill={STAGE_COLORS[segment.stage]}
            />
          </Group>
        );
      })}

      {segments.map((segment, index) => {
        const xStart = xScale(segment.start);
        const xEnd = xScale(segment.end);
        const depth = STAGE_DEPTH[segment.stage];
        const bandSize = segment.stage === "n3" ? 0.12 : segment.stage === "n2" ? 0.1 : 0.06;
        const yStart = yScale(depth + bandSize);
        const yEnd = yScale(depth - bandSize);
        return (
          <text
            key={"stage-label-" + index}
            x={(xStart + xEnd) / 2}
            y={Math.min(yStart, yEnd) - 10}
            textAnchor="middle"
            style={{ fill: "rgba(229,236,255,0.7)", fontSize: 12, letterSpacing: "0.12em" }}
          >
            {STAGE_LABELS[segment.stage]}
          </text>
        );
      })}

      <LinePath
        data={data}
        x={(d) => xScale(d.x)}
        y={(d) => yScale(d.y)}
        stroke="rgba(229,236,255,0.9)"
        strokeWidth={2.5}
        strokeLinecap="round"
      />

      <line
        x1={progressX}
        y1={margin.top - 8}
        x2={progressX}
        y2={margin.top + innerHeight + 16}
        stroke="rgba(229,236,255,0.55)"
        strokeDasharray="6 12"
        strokeWidth={1.6}
      />
      <circle cx={progressX} cy={margin.top - 10} r={4} fill={EEG_COLOR_THETA} />
      <text
        x={progressLabelX}
        y={margin.top - 16}
        textAnchor="middle"
        style={{ fill: "rgba(229,236,255,0.82)", fontSize: 11 }}
      >
        {(progress * 90).toFixed(0)} min
      </text>

      <line
        x1={margin.left}
        y1={margin.top + innerHeight}
        x2={margin.left + innerWidth}
        y2={margin.top + innerHeight}
        stroke="rgba(229,236,255,0.28)"
        strokeWidth={1}
      />
      {[0, 30, 60, 90].map((mark) => (
        <text
          key={"hyp-" + mark}
          x={xScale(mark / 90)}
          y={margin.top + innerHeight + 22}
          textAnchor={mark === 0 ? "start" : mark === 90 ? "end" : "middle"}
          style={{ fill: "rgba(229,236,255,0.6)", fontSize: 11 }}
        >
          {mark} min
        </text>
      ))}
    </svg>
  );
}

function BrainCircuitNetwork({ state }: { state: Section2State }) {
  const panels = useMemo(() => buildRegionPanels(state), [
    state.remBlendFactor,
    state.cortexWaveAmplitude,
    state.cortexWaveFrequency,
    state.trnSpindleIntensity,
    state.memoryFlowRate,
    state.brainstemPosition,
    state.emgPattern,
    state.emgAmplitude,
    state.phase,
  ]);
  const phaseDetail = PHASE_DETAILS[state.phase];

  return (
    <section
      className="rounded-3xl border px-4 py-6 sm:px-6 transition-all duration-1000"
      style={{
        backgroundColor: "var(--card)",
        borderColor: state.phase === "rem" ? "rgba(20,184,166,0.35)" : "var(--border)",
        boxShadow: state.phase === "rem"
          ? "0 24px 60px rgba(20, 184, 166, 0.12)"
          : "0 24px 60px rgba(9, 15, 28, 0.2)",
      }}
    >
      <div className="text-center">
        <h3 className="text-lg sm:text-xl font-semibold" style={{ color: "var(--foreground)" }}>
          NREM → REM Control Circuit
        </h3>
        <p className="mt-1 text-sm" style={{ color: "var(--foreground)", opacity: 0.7 }}>
          {phaseDetail.summary}
        </p>
      </div>
      <div className="mt-6 rounded-2xl border" style={{ borderColor: "rgba(255,255,255,0.05)", background: "rgba(12, 20, 34, 0.78)", padding: "20px" }}>
        <ParentSize debounceTime={0}>
          {({ width, height }) => (
            <NetworkCanvas
              width={width}
              height={height || Math.max(width * 0.55, 360)}
              panels={panels}
            />
          )}
        </ParentSize>
      </div>
    </section>
  );
}

interface RegionPanelDefinition {
  id: string;
  label: string;
  description: string;
  row: number;
  col: number;
  stroke: string;
  background: string;
  data: WavePoint[];
  domain: readonly [number, number];
}

interface PositionedPanel extends RegionPanelDefinition {
  x: number;
  y: number;
  width: number;
  height: number;
  plotPadding: { top: number; right: number; bottom: number; left: number };
  plotWidth: number;
  plotHeight: number;
}

interface NetworkCanvasProps {
  width: number;
  height: number;
  panels: RegionPanelDefinition[];
}

function NetworkCanvas({ width, height, panels }: NetworkCanvasProps) {
  const safeWidth = width || 640;
  const safeHeight = height || Math.max(safeWidth * 0.55, 360);
  const padding = safeWidth < 640 ? 24 : 32;
  const columns = 3;
  const rows = 2;
  const gutterX = safeWidth < 640 ? 16 : 30;
  const gutterY = 32;
  const innerWidth = Math.max(safeWidth - padding * 2, 320);
  const innerHeight = Math.max(safeHeight - padding * 2, 280);
  const panelWidth = Math.max((innerWidth - gutterX * (columns - 1)) / columns, 140);
  const panelHeight = Math.max((innerHeight - gutterY * (rows - 1)) / rows, 140);

  const positionedPanels: PositionedPanel[] = panels.map((panel) => {
    const x = padding + panel.col * (panelWidth + gutterX);
    const y = padding + panel.row * (panelHeight + gutterY);
    const plotPadding = { top: 44, right: 28, bottom: 34, left: 46 };
    const plotWidth = Math.max(panelWidth - plotPadding.left - plotPadding.right, 48);
    const plotHeight = Math.max(panelHeight - plotPadding.top - plotPadding.bottom, 48);

    return {
      ...panel,
      x,
      y,
      width: panelWidth,
      height: panelHeight,
      plotPadding,
      plotWidth,
      plotHeight,
    };
  });

  return (
    <svg width={safeWidth} height={safeHeight} style={{ display: "block" }}>
      <rect width={safeWidth} height={safeHeight} fill="none" />
     {positionedPanels.map((panel) => {
        const plotLeft = panel.x + panel.plotPadding.left;
        const plotTop = panel.y + panel.plotPadding.top;
        const xScale = scaleLinear({ domain: [0, 1], range: [plotLeft, plotLeft + panel.plotWidth] });
        const yScale = scaleLinear({ domain: panel.domain, range: [plotTop + panel.plotHeight, plotTop] });
        const localXScale = scaleLinear({ domain: [0, 1], range: [0, panel.plotWidth] });
        const localYScale = scaleLinear({ domain: panel.domain, range: [panel.plotHeight, 0] });
        const strokeColor = panel.stroke ?? "#94a3b8";
        const borderColor = `${strokeColor}55`;

        return (
          <Group key={panel.id}>
            <rect
              x={panel.x}
              y={panel.y}
              width={panel.width}
              height={panel.height}
              rx={24}
              fill={panel.background}
              stroke={borderColor}
              strokeWidth={1.2}
            />
            <text
              x={panel.x + 20}
              y={panel.y + 28}
              style={{ fill: "rgba(229,236,255,0.92)", fontSize: 15, fontWeight: 600 }}
            >
              {panel.label}
            </text>
            <text
              x={panel.x + 20}
              y={panel.y + 48}
              style={{ fill: "rgba(229,236,255,0.65)", fontSize: 12 }}
            >
              {panel.description}
            </text>

            <Group left={plotLeft} top={plotTop}>
              <AxisLeft
                scale={localYScale}
                numTicks={3}
                stroke="rgba(148,163,184,0.28)"
                tickStroke="rgba(148,163,184,0.35)"
                tickFormat={(value) => `${Math.round(Number(value))}`}
                tickLabelProps={() => ({ fill: "rgba(148,163,184,0.75)", fontSize: 10, dx: "-0.4em" })}
              />
              <AxisBottom
                top={panel.plotHeight}
                scale={localXScale}
                numTicks={3}
                stroke="rgba(148,163,184,0.28)"
                tickStroke="rgba(148,163,184,0.35)"
                tickLabelProps={() => ({ fill: "rgba(148,163,184,0.75)", fontSize: 10, dy: "0.6em" })}
                tickFormat={(value) => `${Math.round(Number(value) * 100)}%`}
              />
            </Group>

            <LinePath
              data={panel.data}
              x={(d) => xScale(d.x)}
              y={(d) => yScale(d.y)}
              stroke={strokeColor}
              strokeWidth={2}
              strokeLinecap="round"
              opacity={0.95}
            />
          </Group>
        );
      })}
    </svg>
  );
}

function buildRegionPanels(state: Section2State): RegionPanelDefinition[] {
  const cortexData = generateRegionalWaveform("cortex", state, 512);
  const thalamusData = generateRegionalWaveform("thalamus", state, 512);
  const trnData = generateRegionalWaveform("trn", state, 512);
  const hippocampusData = generateRegionalWaveform("hippocampus", state, 512);
  const brainstemData = generateRegionalWaveform("brainstem", state, 512);
  const spinalData = generateRegionalWaveform("spinal", state, 512);

  return [
    {
      id: "cortex",
      label: "Cortex",
      description: state.phase === "rem" ? "Theta rehearsal" : "Slow-wave consolidation",
      row: 0,
      col: 0,
      stroke: "#60a5fa",
      background: "rgba(96,165,250,0.12)",
      data: cortexData,
      domain: REGIONAL_SIGNAL_DOMAINS.cortex,
    },
    {
      id: "thalamus",
      label: "Thalamus",
      description: state.trnSpindleIntensity > 0.35 ? "Relay synchronized" : "Relay idle",
      row: 0,
      col: 1,
      stroke: "#a5b4fc",
      background: "rgba(129,140,248,0.12)",
      data: thalamusData,
      domain: REGIONAL_SIGNAL_DOMAINS.thalamus,
    },
    {
      id: "trn",
      label: "TRN Gate",
      description: state.trnSpindleIntensity > 0.4 ? "Spindle shielding" : "Gate relaxed",
      row: 0,
      col: 2,
      stroke: "#c084fc",
      background: "rgba(192,132,252,0.12)",
      data: trnData,
      domain: REGIONAL_SIGNAL_DOMAINS.trn,
    },
    {
      id: "hippocampus",
      label: "Hippocampus",
      description: state.memoryFlowRate > 0.6 ? "Replay packets streaming" : "Quiet replay",
      row: 1,
      col: 0,
      stroke: "#f4d35e",
      background: "rgba(244,211,94,0.12)",
      data: hippocampusData,
      domain: REGIONAL_SIGNAL_DOMAINS.hippocampus,
    },
    {
      id: "brainstem",
      label: "Brainstem Flip-Flop",
      description: state.brainstemPosition === "rem" ? "REM-on drive" : "REM-off guard",
      row: 1,
      col: 1,
      stroke: "#34d399",
      background: "rgba(52,211,153,0.12)",
      data: brainstemData,
      domain: REGIONAL_SIGNAL_DOMAINS.brainstem,
    },
    {
      id: "atonia",
      label: "SLD → Spinal",
      description: state.emgPattern === "flatline" ? "Motor output locked" : "Tone returning",
      row: 1,
      col: 2,
      stroke: "#f97316",
      background: "rgba(249,115,22,0.12)",
      data: spinalData,
      domain: REGIONAL_SIGNAL_DOMAINS.spinal,
    },
  ];
}

// Viridis color interpolation (professional scientific standard)
const viridisColors = [
  '#440154', '#482878', '#3e4989', '#31688e', '#26828e',
  '#1f9e89', '#35b779', '#6ece58', '#b5de2b', '#fde725'
];

const plasmaColors = [
  '#0d0887', '#46039f', '#7201a8', '#9c179e', '#bd3786',
  '#d8576b', '#ed7953', '#fb9f3a', '#fdca26', '#f0f921'
];

function interpolateColor(colors: string[], t: number): string {
  if (t <= 0) return colors[0];
  if (t >= 1) return colors[colors.length - 1];

  const scaledT = t * (colors.length - 1);
  const index = Math.floor(scaledT);
  const fraction = scaledT - index;

  if (index >= colors.length - 1) return colors[colors.length - 1];

  const color1 = colors[index];
  const color2 = colors[index + 1];

  const rgb1 = {
    r: parseInt(color1.slice(1, 3), 16),
    g: parseInt(color1.slice(3, 5), 16),
    b: parseInt(color1.slice(5, 7), 16)
  };
  const rgb2 = {
    r: parseInt(color2.slice(1, 3), 16),
    g: parseInt(color2.slice(3, 5), 16),
    b: parseInt(color2.slice(5, 7), 16)
  };

  const r = Math.round(rgb1.r + (rgb2.r - rgb1.r) * fraction);
  const g = Math.round(rgb1.g + (rgb2.g - rgb1.g) * fraction);
  const b = Math.round(rgb1.b + (rgb2.b - rgb1.b) * fraction);

  return `rgb(${r}, ${g}, ${b})`;
}

interface RegionalSpectralData {
  region: string;
  delta: number;
  theta: number;
  alpha: number;
  sigma: number;
  beta: number;
  gamma: number;
}

function SpectralHeatmap({ entries }: { entries: RegionalSpectralData[] }) {
  const width = 600;
  const height = 400;
  const margin = { top: 56, right: 160, bottom: 96, left: 180 };

  const frequencyBands = [
    { key: "delta", label: "δ (0.5-4)", range: "0.5-4 Hz" },
    { key: "theta", label: "θ (4-8)", range: "4-8 Hz" },
    { key: "alpha", label: "α (8-12)", range: "8-12 Hz" },
    { key: "sigma", label: "σ (11-16)", range: "11-16 Hz" },
    { key: "beta", label: "β (15-30)", range: "15-30 Hz" },
    { key: "gamma", label: "γ (30+)", range: "30+ Hz" }
  ];

  const columnIndices = frequencyBands.map((_, index) => index);
  const rowIndices = entries.map((_, index) => index);

  const xScale = scaleBand<number>({
    domain: columnIndices,
    range: [margin.left, width - margin.right],
    paddingInner: 0.18,
    paddingOuter: 0.02,
  });

  const yScale = scaleBand<number>({
    domain: rowIndices,
    range: [margin.top, height - margin.bottom],
    paddingInner: 0.24,
    paddingOuter: 0.02,
  });

  const cellWidth = xScale.bandwidth();
  const cellHeight = yScale.bandwidth();
  const cellGap = Math.min(cellWidth, cellHeight) * 0.24;

  const allValues: number[] = [];
  entries.forEach((entry) => {
    frequencyBands.forEach((band) => {
      const value = entry[band.key as keyof RegionalSpectralData] as number;
      allValues.push(value);
    });
  });
  const minValue = Math.min(...allValues);
  const maxValue = Math.max(...allValues);
  const range = Math.max(maxValue - minValue, 1e-3);
  const normalize = (value: number) => (value - minValue) / range;
  const clampNormalized = (value: number) => Math.min(1, Math.max(0, normalize(value)));
  const getColor = (value: number) => interpolateColor(viridisColors, clampNormalized(value));

  const legendHeight = height - margin.top - margin.bottom;
  const legendScale = scaleLinear<number>({ domain: [minValue, maxValue], range: [legendHeight, 0] });
  const legendTicks = [0, 0.25, 0.5, 0.75, 1].map((fraction) => minValue + range * fraction);

  return (
    <svg width={width} height={height} style={{ display: "block" }}>
      <defs>
        <linearGradient id="viridis-legend" x1="0" y1="1" x2="0" y2="0">
          {viridisColors.map((color, index) => (
            <stop
              key={`viridis-stop-${index}`}
              offset={`${(index / (viridisColors.length - 1)) * 100}%`}
              stopColor={color}
            />
          ))}
        </linearGradient>
      </defs>

      <rect width={width} height={height} fill="rgba(12, 19, 36, 0.45)" rx={14} />

      {/* Row highlight guides */}
      {rowIndices.map((rowIndex) => {
        const y = yScale(rowIndex);
        if (y === undefined) return null;
        const rectY = y + cellGap / 2;
        const rectHeight = cellHeight - cellGap;
        return (
          <rect
            key={`row-bg-${rowIndex}`}
            x={margin.left - 12}
            y={rectY - 8}
            width={width - margin.left - margin.right + 24}
            height={rectHeight + 16}
            rx={rectHeight / 2}
            fill="rgba(255, 255, 255, 0.02)"
          />
        );
      })}

      {/* Heatmap cells */}
      {entries.map((entry, rowIndex) => {
        const y = yScale(rowIndex);
        if (y === undefined) return null;
        const baseY = y + cellGap / 2;
        const rectHeight = cellHeight - cellGap;

        return frequencyBands.map((band, columnIndex) => {
          const x = xScale(columnIndex);
          if (x === undefined) return null;
          const baseX = x + cellGap / 2;
          const rectWidth = cellWidth - cellGap;
          const rawValue = entry[band.key as keyof RegionalSpectralData] as number;
          const fillColor = getColor(rawValue);

          return (
            <Group key={`cell-${rowIndex}-${columnIndex}`}>
              <rect
                x={baseX}
                y={baseY}
                width={rectWidth}
                height={rectHeight}
                rx={6}
                fill={fillColor}
                stroke="rgba(255,255,255,0.12)"
                strokeWidth={0.6}
              />
              <text
                x={baseX + rectWidth / 2}
                y={baseY + rectHeight / 2 + 4}
                textAnchor="middle"
                style={{ fill: "rgba(15,23,42,0.85)", fontSize: 11, fontWeight: 600 }}
              >
                {(rawValue * 100).toFixed(0)}
              </text>
            </Group>
          );
        });
      })}

      {/* Row labels - brain regions */}
      {entries.map((entry, rowIndex) => {
        const y = yScale(rowIndex);
        if (y === undefined) return null;
        const baseY = y + cellGap / 2;
        const rectHeight = cellHeight - cellGap;
        const centerY = baseY + rectHeight / 2;
        return (
          <text
            key={`row-label-${entry.region}`}
            x={margin.left - 24}
            y={centerY}
            textAnchor="end"
            style={{ fill: "rgba(229,236,255,0.9)", fontSize: 13, fontWeight: 600 }}
            dominantBaseline="middle"
          >
            {entry.region}
          </text>
        );
      })}

      {/* Column labels - frequency bands */}
      {frequencyBands.map((band, columnIndex) => {
        const x = xScale(columnIndex);
        if (x === undefined) return null;
        const baseX = x + cellGap / 2;
        const rectWidth = cellWidth - cellGap;
        const centerX = baseX + rectWidth / 2;
        return (
          <text
            key={`col-label-${band.key}`}
            x={centerX}
            y={height - margin.bottom + 22}
            textAnchor="middle"
            style={{ fill: "rgba(229,236,255,0.88)", fontSize: 11, fontWeight: 600 }}
          >
            <tspan x={centerX} dy="0">
              {band.label}
            </tspan>
            <tspan
              x={centerX}
              dy="1.25em"
              style={{ fill: "rgba(229,236,255,0.6)", fontSize: 9, fontWeight: 400 }}
            >
              {band.range}
            </tspan>
          </text>
        );
      })}

      {/* Legend - Viridis gradient bar on right with ticks */}
      <Group left={width - margin.right + 36} top={margin.top}>
        <text x={0} y={-18} style={{ fill: "rgba(229,236,255,0.78)", fontSize: 12, fontWeight: 600, letterSpacing: "0.08em" }}>
          Power
        </text>

        <rect x={0} y={0} width={24} height={legendHeight} fill="url(#viridis-legend)" rx={6} stroke="rgba(255,255,255,0.12)" />

        {legendTicks.map((tick) => {
          const y = legendScale(tick);
          return (
            <Group key={`legend-${tick.toFixed(2)}`}>
              <line x1={28} y1={y} x2={36} y2={y} stroke="rgba(229,236,255,0.6)" strokeWidth={1} />
              <text x={40} y={y + 4} style={{ fill: "rgba(229,236,255,0.72)", fontSize: 11 }}>
                {(tick * 100).toFixed(0)}%
              </text>
            </Group>
          );
        })}

        <text x={0} y={legendHeight + 24} style={{ fill: "rgba(229,236,255,0.6)", fontSize: 10 }}>
          Low synchrony
        </text>
        <text x={0} y={-32} style={{ fill: "rgba(229,236,255,0.85)", fontSize: 10 }}>
          High synchrony
        </text>
      </Group>
    </svg>
  );
}

function PolysomnographyPanel({ state }: { state: Section2State }) {
  const polysomnographySummary = getPolysomnographySummary(state);
  return (
    <section
      className="rounded-3xl border px-4 py-6 sm:px-6 sm:py-8 transition-all duration-1000"
      style={{
        backgroundColor: "var(--card)",
        borderColor: state.phase === 'rem' ? "rgba(20,184,166,0.35)" : "var(--border)",
        boxShadow: state.phase === 'rem'
          ? "0 26px 65px rgba(20, 184, 166, 0.12)"
          : "0 26px 65px rgba(9, 15, 28, 0.22)",
      }}
    >
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg sm:text-xl font-semibold" style={{ color: "var(--foreground)" }}>
            Polysomnography
          </h3>
          <p className="mt-1 text-sm sm:text-base" style={{ color: "var(--foreground)", opacity: 0.7 }}>
            {polysomnographySummary}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <SignalChip label="Stage" value={state.hypnogramStage.toUpperCase()} color={EEG_COLOR_DELTA} />
          <SignalChip label="EOG" value={state.eogBurstPattern === "rem-saccades" ? "REM bursts" : "Quiet"} color={EOG_COLOR} />
          <SignalChip label="EMG" value={state.emgPattern === "flatline" ? "Atonia" : "Active"} color={EMG_COLOR} />
        </div>
      </header>

      <div className="mt-6 rounded-2xl border" style={{ borderColor: "rgba(255,255,255,0.04)", background: "rgba(16,24,40,0.6)", padding: "20px" }}>
        <ParentSize debounceTime={10}>
          {({ width }) => <PSGTraces state={state} width={width} height={260} />}
        </ParentSize>
      </div>
    </section>
  );
}

function SignalChip({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <span
      className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs"
      style={{
        backgroundColor: color + "22",
        color,
        border: "1px solid " + color + "33",
        letterSpacing: "0.06em",
      }}
    >
      {label}: {value}
    </span>
  );
}

function RecentComparativeTraces({ state }: { state: Section2State }) {
  const sampleProgress = Math.max(Math.min(state.scrollProgress, 0.95), 0.05);
  const remStart = Math.max(sampleProgress - 0.08, 0);
  const remEnd = sampleProgress;
  const nremStart = Math.max(remStart - 0.18, 0);
  const nremEnd = remStart;

  const buildWindow = (start: number, end: number, generator: (phase: "nrem" | "rem") => WavePoint[]) => {
    const data: WavePoint[] = [];
    const phase = end > sampleProgress - 0.02 ? "rem" : "nrem";
    const window = generator(phase);
    for (let i = 0; i < window.length; i += 1) {
      const t = start + ((end - start) * i) / (window.length - 1);
      data.push({ x: t, y: window[i].y });
    }
    return data;
  };

  const eogWindow = (phase: "nrem" | "rem") => {
    const amplitude = phase === "rem" ? 0.6 : 0.2;
    const burstRate = phase === "rem" ? 0.9 : 0.1;
    return createWave({ samples: 80, amplitude, frequency: 4 + burstRate * 8, variance: 0.12 });
  };

  const respWindow = (phase: "nrem" | "rem") => {
    const amplitude = phase === "rem" ? 0.3 : 0.45;
    const variance = phase === "rem" ? 0.16 : 0.05;
    return createWave({ samples: 80, amplitude, frequency: 3, variance });
  };

  const heartWindow = (phase: "nrem" | "rem") => {
    const amplitude = phase === "rem" ? 0.22 : 0.12;
    const frequency = phase === "rem" ? 4.2 : 3.2;
    return createWave({ samples: 80, amplitude, frequency, variance: amplitude * 0.6 });
  };

  const traces = useMemo(
    () => ([
      {
        label: "Eye Movements",
        color: EOG_COLOR,
        data: buildWindow(nremStart, nremEnd, eogWindow),
        dataRem: buildWindow(remStart, remEnd, eogWindow),
      },
      {
        label: "Respiration",
        color: RESP_COLOR,
        data: buildWindow(nremStart, nremEnd, respWindow),
        dataRem: buildWindow(remStart, remEnd, respWindow),
      },
      {
        label: "Heart Variability",
        color: HR_COLOR,
        data: buildWindow(nremStart, nremEnd, heartWindow),
        dataRem: buildWindow(remStart, remEnd, heartWindow),
      },
    ]),
    [nremStart, nremEnd, remStart, remEnd],
  );

  const width = 760;
  const height = 260;
  const margin = { top: 36, right: 42, bottom: 36, left: 120 };
  const innerWidth = width - margin.left - margin.right;
  const laneHeight = 64;
  const laneGap = 24;

  const xScale = scaleLinear<number>({ domain: [nremStart, remEnd], range: [margin.left, margin.left + innerWidth] });

  return (
    <svg width={width} height={height} style={{ display: "block" }}>
      <defs>
        <LinearGradient id="nremShade" from="rgba(123,165,221,0.14)" to="rgba(123,165,221,0.04)" />
        <LinearGradient id="remShade" from="rgba(184,165,216,0.2)" to="rgba(184,165,216,0.08)" />
      </defs>

      <rect width={width} height={height} fill="transparent" />
      <rect x={margin.left} y={margin.top - 28} width={innerWidth * (nremEnd - nremStart) / (remEnd - nremStart)} height={laneHeight * traces.length + laneGap * (traces.length - 1)} fill="url(#nremShade)" rx={18} />
      <rect x={xScale(remStart)} y={margin.top - 28} width={innerWidth * (remEnd - remStart) / (remEnd - nremStart)} height={laneHeight * traces.length + laneGap * (traces.length - 1)} fill="url(#remShade)" rx={18} />

      <text x={margin.left - 12} y={margin.top - 12} textAnchor="end" style={{ fill: "rgba(229,236,255,0.6)", fontSize: 11 }}>Late NREM</text>
      <text x={xScale(remStart) + 6} y={margin.top - 12} style={{ fill: "rgba(229,236,255,0.6)", fontSize: 11 }}>REM burst</text>

      {traces.map((trace, index) => {
        const center = margin.top + index * (laneHeight + laneGap) + laneHeight / 2;
        return (
          <Group key={trace.label}>
            <rect x={margin.left - 16} y={center - laneHeight / 2} width={innerWidth + 32} height={laneHeight} rx={laneHeight / 2} fill="rgba(12, 22, 36, 0.45)" stroke="rgba(255,255,255,0.05)" />
            <LinePath data={trace.data} x={(d) => xScale(d.x)} y={(d) => center - d.y * (laneHeight * 0.3)} stroke={trace.color} strokeWidth={1.8} strokeLinecap="round" opacity={0.6} />
            <LinePath data={trace.dataRem} x={(d) => xScale(d.x)} y={(d) => center - d.y * (laneHeight * 0.3)} stroke={trace.color} strokeWidth={2.4} strokeLinecap="round" />
            <text x={margin.left - 24} y={center + 4} textAnchor="end" style={{ fill: "rgba(229,236,255,0.7)", fontSize: 12 }}>{trace.label}</text>
          </Group>
        );
      })}

      <line x1={xScale(remStart)} y1={margin.top - 24} x2={xScale(remStart)} y2={margin.top + traces.length * (laneHeight + laneGap) - laneGap + 24} stroke="rgba(229,236,255,0.45)" strokeDasharray="4 8" />
      <text x={xScale(remStart)} y={margin.top + traces.length * (laneHeight + laneGap) - laneGap + 40} textAnchor="middle" style={{ fill: "rgba(229,236,255,0.6)", fontSize: 11 }}>Flip to REM</text>
    </svg>
  );
}
