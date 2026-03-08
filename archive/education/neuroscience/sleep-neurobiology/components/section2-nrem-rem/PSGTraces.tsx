"use client";

import React, { useMemo } from "react";
import { scaleLinear } from "@visx/scale";
import { LinePath } from "@visx/shape";
import { Group } from "@visx/group";
import { GridRows } from "@visx/grid";
import { AxisLeft } from "@visx/axis";
import { LinearGradient } from "@visx/gradient";
import { Threshold } from "@visx/threshold";
import { curveMonotoneX } from "@visx/curve";
import type { Section2State } from "./types";

interface PSGTracesProps {
  state: Section2State;
  width: number;
  height: number;
}

interface WavePoint {
  x: number;
  y: number;
}

const TRACE_COLORS = {
  eeg: "#7BA5DD",
  eog: "#C6B4F4",
  emg: "#E07A7A",
  resp: "#8AD4A0",
  hr: "#F4D35E",
};

// Generate realistic K-complex: biphasic V-shaped waveform
// Sharp negative wave (~200ms) followed by slower positive wave (~300ms)
// K-complexes are THE MOST PROMINENT feature of N2 sleep
function generateKComplex(x: number, center: number, amplitude: number = 5.5): number {
  const offset = x - center;

  // K-complex duration ~0.5-1.0 seconds
  if (Math.abs(offset) > 0.035) return 0;

  // Negative phase: Sharp, high-amplitude downward deflection (like a spike)
  if (offset >= -0.005 && offset < 0.012) {
    const negPhase = (offset + 0.005) / 0.017; // Normalize to 0-1
    return -amplitude * Math.exp(-Math.pow((negPhase - 0.3) * 6, 2));
  }
  // Positive phase: Slower, broader upward deflection (V-shape completion)
  else if (offset >= 0.012 && offset < 0.035) {
    const posOffset = offset - 0.012;
    return amplitude * 0.7 * Math.exp(-Math.pow(posOffset * 35, 2));
  }
  return 0;
}

// Generate realistic sleep spindle: waxing-waning 12-14 Hz burst
// Duration: 0.5-1.5 seconds with Gaussian amplitude envelope
function generateSpindle(x: number, center: number, duration: number = 0.04, frequency: number = 13): number {
  const offset = x - center;

  if (Math.abs(offset) > duration / 2) return 0;

  // Gaussian envelope for waxing-waning effect
  const envelope = Math.exp(-Math.pow((offset / duration) * 4, 2));
  // 12-14 Hz carrier wave (sleep spindle frequency)
  const carrier = Math.sin(offset * Math.PI * 2 * frequency * 25);

  return carrier * envelope * 1.2;
}

// Generate realistic EEG trace with stage-specific patterns
// Use FIXED frequencies and state-driven amplitudes
function generateEEGTrace(state: Section2State, samples: number = 720): WavePoint[] {
  const data: WavePoint[] = [];
  const blend = state.remBlendFactor;
  const stage = state.hypnogramStage;

  // Pre-calculate K-complex and spindle positions for N2
  const kComplexPositions: number[] = [];
  const spindlePositions: Array<{ center: number; duration: number; frequency: number }> = [];

  if (stage === "n2") {
    // K-complexes: 2-4 per 10-second window (physiologically accurate)
    const kCount = 2 + Math.floor(Math.random() * 3);
    for (let k = 0; k < kCount; k++) {
      kComplexPositions.push(0.1 + Math.random() * 0.8);
    }

    // Sleep spindles: 3-5 per window
    const spindleIntensity = state.trnSpindleIntensity;
    const spindleDensity = Math.max(3, Math.floor(spindleIntensity * 5));
    for (let s = 0; s < spindleDensity; s++) {
      spindlePositions.push({
        center: 0.1 + Math.random() * 0.8,
        duration: 0.04 + Math.random() * 0.03,
        frequency: 12 + Math.random() * 2,
      });
    }
  }

  for (let i = 0; i < samples; i++) {
    const x = i / samples;
    let y = 0;

    // WAKE: Posterior dominant alpha (8-13 Hz, eyes closed) + Beta (13-30 Hz, anterior)
    // For C3-M2 (central), we see mixed alpha and beta
    // SMALL amplitude, HIGH frequency = "busy but small"
    if (stage === "wake") {
      const alpha = Math.sin(x * Math.PI * 2 * 9.5 * 3) * 0.35  // 8-13 Hz dominant (reduced from 0.6)
        + Math.sin(x * Math.PI * 2 * 10.5 * 3) * 0.18          // (reduced from 0.3)
        + Math.sin(x * Math.PI * 2 * 8.5 * 3) * 0.12;          // (reduced from 0.2)
      const beta = Math.sin(x * Math.PI * 2 * 18 * 3) * 0.18    // 13-30 Hz present (reduced from 0.3)
        + Math.sin(x * Math.PI * 2 * 22 * 3) * 0.12             // (reduced from 0.2)
        + Math.sin(x * Math.PI * 2 * 25 * 3) * 0.08;            // (reduced from 0.15)
      y = alpha + beta;
    }
    // N1: Theta dominant (4-7 Hz) with alpha dropout + vertex sharp transients (C3 max)
    // Hallmarks: alpha disappearance, low-amplitude mixed frequency (4-7 Hz)
    // TRANSITIONAL: irregular, messy appearance
    else if (stage === "n1") {
      const theta = Math.sin(x * Math.PI * 2 * 5.5 * 3) * 0.35   // 4-7 Hz theta (reduced from 0.5)
        + Math.sin(x * Math.PI * 2 * 6.8 * 3) * 0.22             // (reduced from 0.3)
        + Math.sin(x * Math.PI * 2 * 4.2 * 3) * 0.18;            // (reduced from 0.25)
      const residualAlpha = Math.sin(x * Math.PI * 2 * 9 * 3) * 0.12; // Fading alpha (reduced from 0.15)
      // Add low-frequency drift for "messy" appearance
      const drift = Math.sin(x * Math.PI * 2 * 1.5 * 3) * 0.15;
      y = theta + residualAlpha + drift;

      // Vertex sharp transients: Sharply contoured, bilateral, central max
      // Usually <0.5 sec duration, isolated, spontaneous
      // Increased frequency and variability for more irregular appearance
      const vertexPhase = (x * 8) % 1; // ~8 vertex waves (increased from 6) for more irregularity
      if (vertexPhase < 0.05) {
        const vertexAmplitude = 1.0 + Math.random() * 0.8; // More variable (was 1.2 + 0.5)
        const sharpness = Math.exp(-Math.pow((vertexPhase - 0.025) * 100, 2));
        y += sharpness * vertexAmplitude * (Math.random() > 0.5 ? 1 : -1);
      }
    }
    // N2: Background theta/delta + sleep spindles + K-complexes
    // QUIET background makes K-complexes and spindles dramatically stand out
    else if (stage === "n2") {
      // Background: DRASTICALLY REDUCED for maximum contrast
      const delta = Math.sin(x * Math.PI * 2 * 1.5 * 3) * 0.12;  // Reduced from 0.3
      const theta = Math.sin(x * Math.PI * 2 * 5.8 * 3) * 0.10;  // Reduced from 0.25
      let n2Pattern = delta + theta;

      // Add pre-calculated sleep spindles (keep prominent)
      for (const spindle of spindlePositions) {
        n2Pattern += generateSpindle(x, spindle.center, spindle.duration, spindle.frequency) * state.trnSpindleIntensity * 1.5;
      }

      // Add pre-calculated K-complexes (MUST be very prominent against quiet background)
      for (const kCenter of kComplexPositions) {
        n2Pattern += generateKComplex(x, kCenter, 6.0); // VERY high amplitude - K-complexes dominate quiet background
      }

      y = n2Pattern;
    }
    // N3: Slow-wave sleep - High-amplitude delta (0.5-4 Hz, >75µV, frontal max)
    // Hallmark: ≥20% of epoch contains delta waves ≥75µV
    // MASSIVE amplitude dominates the trace visually
    else if (stage === "n3") {
      // Very slow, VERY HIGH amplitude delta waves (0.5-2 Hz typical)
      const delta1 = Math.sin(x * Math.PI * 2 * 0.8 * 3) * 3.5;  // 0.8 Hz (increased from 2.2)
      const delta2 = Math.sin(x * Math.PI * 2 * 1.5 * 3) * 2.8;  // 1.5 Hz (increased from 1.8)
      const delta3 = Math.sin(x * Math.PI * 2 * 0.5 * 3) * 2.2;  // 0.5 Hz (increased from 1.5)
      y = delta1 + delta2 + delta3; // Total ~8.5 amplitude - uses most of -8 to 8 range

      // Sparse spindles (rare in N3 but can occur)
      const spindleIntensity = state.trnSpindleIntensity; // Should be very low (0.06-0.18)
      if (spindleIntensity > 0.05) {
        const spindlePhase = (x * 1.5) % 1;
        if (spindlePhase < 0.15) {
          const envelope = Math.sin(spindlePhase * Math.PI / 0.15);
          y += Math.sin(x * Math.PI * 2 * 12 * 3) * envelope * spindleIntensity * 0.4;
        }
      }
    }
    // REM: Low-amplitude mixed frequency + theta (4-8 Hz) + sawtooth waves (2-6 Hz, central max)
    // Hallmarks: Resembles wake EEG but with EMG atonia and rapid eye movements
    // MODERATE amplitude - clearly distinct from N3's massive waves and Wake's tiny oscillations
    else if (stage === "rem") {
      // Mixed frequency background (resembles wake but slightly larger)
      const theta = Math.sin(x * Math.PI * 2 * 6.5 * 3) * 0.48    // 4-8 Hz theta (slightly reduced from 0.55)
        + Math.sin(x * Math.PI * 2 * 5.2 * 3) * 0.30              // (reduced from 0.35)
        + Math.sin(x * Math.PI * 2 * 7.5 * 3) * 0.22;             // (reduced from 0.25)
      const gamma = Math.sin(x * Math.PI * 2 * 40 * 3) * 0.15;    // Gamma activity (reduced from 0.18)
      const beta = Math.sin(x * Math.PI * 2 * 20 * 3) * 0.22      // Beta (desynchronized) (reduced from 0.25)
        + Math.sin(x * Math.PI * 2 * 16 * 3) * 0.13;              // (reduced from 0.15)
      const alpha = Math.sin(x * Math.PI * 2 * 9 * 3) * 0.10;     // Some alpha (reduced from 0.12)

      // Sawtooth waves: 2-6 Hz sharply contoured, serrated, central max
      // Often precede bursts of rapid eye movements (phasic REM)
      const sawtoothFreq = 3.5 + Math.random() * 1.5; // 3-5 Hz typical
      const sawtoothPhase = (x * sawtoothFreq * 3) % 1;
      // Create serrated triangular waveform
      const sawtooth = (sawtoothPhase < 0.5 ? sawtoothPhase * 2 : (1 - sawtoothPhase) * 2) * 0.55  // Reduced from 0.6
        + Math.sin(sawtoothPhase * Math.PI * 12) * 0.13; // Add serrations (reduced from 0.15)

      y = theta + gamma + beta + alpha + sawtooth;
    }
    // Fallback: Use blend for any intermediate states
    else {
      const nremPattern = Math.sin(x * Math.PI * 2 * 1.2 * 3) * 0.8;
      const remPattern = Math.sin(x * Math.PI * 2 * 6.5 * 3) * 0.6
        + Math.sin(x * Math.PI * 2 * 40 * 3) * 0.15;
      y = nremPattern * (1 - blend) + remPattern * blend;
    }

    data.push({ x, y: y + (Math.random() - 0.5) * 0.06 });
  }
  return data;
}

// Generate EOG trace with stage-specific eye movement patterns
// Uses HARDCODED amplitudes per stage (like EEG) for dramatic visual differences
// SCALED UP to use 20-40% of [-8, 8] domain for visibility
function generateEOGTrace(state: Section2State, samples: number = 360): WavePoint[] {
  const data: WavePoint[] = [];
  const stage = state.hypnogramStage;

  for (let i = 0; i < samples; i++) {
    const x = i / samples;
    let y = 0;

    switch (stage) {
      case "wake":
        // Eye blinks: Sharp, irregular downward deflections (0.2-0.4 Hz)
        const blinkPhase = (x * 3.2) % 1; // ~3 blinks per 10-sec window
        if (blinkPhase < 0.08) {
          const blinkShape = Math.exp(-Math.pow((blinkPhase - 0.04) * 40, 2));
          y = -blinkShape * 3.6; // SCALED UP: 3x larger
        }
        // Occasional waking eye movements (low frequency drift)
        y += Math.sin(x * Math.PI * 2 * 0.6) * 1.0; // SCALED UP: 3x larger
        break;

      case "n1":
        // Slow Rolling Eye Movements (SREMs) - hallmark of N1
        // 1.5 complete slow rolls per 10-second window (visible waveform)
        y = Math.sin(x * Math.PI * 2 * 1.5) * 3.5; // DRAMATIC SREMs - clearly visible waves
        // Add slight irregularity at different frequency
        y += Math.sin(x * Math.PI * 2 * 2.0) * 0.8; // Moderate variation
        break;

      case "n2":
        // Minimal eye movement activity - 1 slow drift per window
        y = Math.sin(x * Math.PI * 2 * 1.0) * 1.5; // Gentle drift - clearly visible
        break;

      case "n3":
        // Nearly no eye movements (deep sleep) - very slow drift
        y = Math.sin(x * Math.PI * 2 * 0.8) * 0.8; // Minimal but visible movement
        break;

      case "rem":
        // Rapid Eye Movements - bursts of saccades (hallmark of REM)
        const burstPhase = Math.floor(x * 8) % 2;
        if (burstPhase === 0) {
          // Active burst: rapid random saccades - VERY LARGE
          y = (Math.random() - 0.5) * 6.5; // SCALED UP: 3x larger - Dramatic saccades
        } else {
          // Quieter period between bursts
          y = Math.sin(x * Math.PI * 2 * 20) * 1.5; // SCALED UP: 3x larger
        }
        break;
    }

    data.push({ x, y: y + (Math.random() - 0.5) * 0.04 });
  }
  return data;
}

// Generate EMG trace with stage-specific muscle tone
// Uses HARDCODED tone levels per stage (like EEG) for dramatic visual differences
// SCALED UP to use 20-50% of [-8, 8] domain for visibility
// Shows progressive relaxation from Wake → N1 → N2 → N3 → REM (atonia)
function generateEMGTrace(state: Section2State, samples: number = 360): WavePoint[] {
  const data: WavePoint[] = [];
  const stage = state.hypnogramStage;

  // HARDCODED stage-specific muscle tone levels - SCALED UP 3x for dramatic visual differences
  const toneLevels: Record<typeof stage, number> = {
    wake: 4.2,   // Very active, high amplitude (was 1.4)
    n1: 3.0,     // Moderately active (was 1.0)
    n2: 2.0,     // Reduced tone (was 0.65)
    n3: 1.2,     // Low tone (was 0.40)
    rem: 0.25,   // Atonia - nearly flat (was 0.08, scaled up slightly for visibility)
  };

  const toneLevel = toneLevels[stage];

  for (let i = 0; i < samples; i++) {
    const x = i / samples;
    let y = 0;

    if (stage === "rem") {
      // REM atonia: nearly flat line with minimal noise
      y = (Math.random() - 0.5) * toneLevel * 1.2;
    } else {
      // Wake/NREM: High-frequency muscle activity (30-50 Hz)
      // Amplitude decreases progressively through sleep stages
      const highFreq = Math.sin(x * Math.PI * 2 * 45) * toneLevel * 0.3;
      const midFreq = Math.sin(x * Math.PI * 2 * 35) * toneLevel * 0.2;
      const noise = (Math.random() - 0.5) * toneLevel * 1.4;
      y = highFreq + midFreq + noise;
    }

    data.push({ x, y });
  }
  return data;
}

// Generate respiration trace with stage-specific breathing patterns
// Uses HARDCODED patterns per stage (like EEG) for dramatic visual differences
// SCALED UP to use 20-40% of [-8, 8] domain for visibility
function generateRespTrace(state: Section2State, samples: number = 360): WavePoint[] {
  const data: WavePoint[] = [];
  const stage = state.hypnogramStage;

  // HARDCODED stage-specific respiration parameters
  const stageParams: Record<typeof stage, { rate: number; amplitude: number; irregularity: number }> = {
    wake: { rate: 2.0, amplitude: 2.0, irregularity: 0.2 },     // 12 breaths/min, moderate amplitude
    n1: { rate: 2.2, amplitude: 2.2, irregularity: 0.3 },       // 13.2 breaths/min, slightly irregular
    n2: { rate: 2.3, amplitude: 2.5, irregularity: 0.1 },       // 13.8 breaths/min, regular
    n3: { rate: 2.0, amplitude: 2.8, irregularity: 0.05 },      // 12 breaths/min, very regular (deep/slow)
    rem: { rate: 2.7, amplitude: 2.2, irregularity: 0.8 },      // 16.2 breaths/min, highly irregular
  };

  const { rate, amplitude, irregularity } = stageParams[stage];

  for (let i = 0; i < samples; i++) {
    const x = i / samples;

    // Base breathing pattern
    let y = Math.sin(x * Math.PI * 2 * rate) * amplitude;

    // Add stage-specific irregularity
    if (irregularity > 0) {
      // Amplitude variation (more in REM)
      const ampVariation = Math.sin(x * Math.PI * 2 * 0.8) * irregularity * amplitude * 0.4;
      y += ampVariation;

      // Frequency variation (more in REM)
      const freqVariation = Math.sin(x * Math.PI * 2 * rate * 1.3 + Math.sin(x * Math.PI * 4) * irregularity) * irregularity * amplitude * 0.3;
      y += freqVariation;
    }

    data.push({ x, y });
  }
  return data;
}

// Generate heart rate trace with stage-specific baselines
// Uses HARDCODED HR and HRV per stage (like EEG) for dramatic visual differences
// SCALED UP amplitude for visible individual beats
function generateHRTrace(state: Section2State, samples: number = 360): WavePoint[] {
  const data: WavePoint[] = [];
  const stage = state.hypnogramStage;

  // HARDCODED stage-specific heart rate and variability
  const stageParams: Record<typeof stage, { hr: number; hrv: number }> = {
    wake: { hr: 72, hrv: 0.18 },      // Moderate HR, moderate HRV
    n1: { hr: 68, hrv: 0.12 },        // Slight decrease
    n2: { hr: 64, hrv: 0.08 },        // Lower HR, lower HRV
    n3: { hr: 58, hrv: 0.05 },        // Lowest HR (parasympathetic), very low HRV
    rem: { hr: 74, hrv: 0.28 },       // Higher HR (sympathetic), highest HRV
  };

  const { hr, hrv } = stageParams[stage];

  // Window is 10 seconds, so beatsPerWindow = (bpm / 60) * 10
  const beatsPerWindow = (hr / 60) * 10;
  const variability = hrv;

  // SCALED UP base amplitude from 0.9 to 2.5 for visible beats
  const baseAmplitude = 2.5;

  for (let i = 0; i < samples; i++) {
    const x = i / samples;

    // QRS complex simulation (standard ECG waveform)
    const beatPhase = (x * beatsPerWindow) % 1;
    let y = 0;

    if (beatPhase < 0.1) {
      // R peak (tallest deflection)
      y = baseAmplitude + (Math.random() - 0.5) * variability * 0.15;
    } else if (beatPhase < 0.3) {
      // S wave (downward deflection after R)
      y = -0.2 * baseAmplitude;
    } else {
      // Baseline with T wave
      y = Math.sin((beatPhase - 0.3) * Math.PI * 2) * 0.15 * baseAmplitude;
    }

    // Add beat-to-beat variability (HRV)
    // Higher HRV in REM (sympathetic), lower in deep NREM (parasympathetic)
    y += (Math.random() - 0.5) * variability * 0.4;

    data.push({ x, y });
  }
  return data;
}

interface TraceChannelProps {
  label: string;
  data: WavePoint[];
  color: string;
  yOffset: number;
  height: number;
  width: number;
  showGrid?: boolean;
  annotation?: string;
}

function TraceChannel({ label, data, color, yOffset, height, width, showGrid = true, annotation }: TraceChannelProps) {
  const margin = { left: 100, right: 80 };
  const innerWidth = width - margin.left - margin.right;

  const xScale = useMemo(
    () =>
      scaleLinear({
        domain: [0, 1],
        range: [margin.left, margin.left + innerWidth],
      }),
    [innerWidth, margin.left]
  );

  const yScale = useMemo(
    () =>
      scaleLinear({
        domain: [-8, 8], // Increased to accommodate K-complexes and N3 delta waves
        range: [yOffset + height * 0.8, yOffset + height * 0.2],
      }),
    [yOffset, height]
  );

  return (
    <Group>
      {/* Background */}
      <rect
        x={0}
        y={yOffset}
        width={width}
        height={height}
        fill="rgba(12, 20, 36, 0.3)"
        stroke="rgba(255, 255, 255, 0.05)"
        strokeWidth={1}
      />

      {/* Grid */}
      {showGrid && (
        <GridRows
          scale={yScale}
          width={innerWidth}
          left={margin.left}
          strokeDasharray="2,4"
          stroke="rgba(229, 236, 255, 0.1)"
          strokeOpacity={0.3}
          numTicks={3}
        />
      )}

      {/* Baseline */}
      <line
        x1={margin.left}
        x2={margin.left + innerWidth}
        y1={yOffset + height / 2}
        y2={yOffset + height / 2}
        stroke="rgba(255, 255, 255, 0.15)"
        strokeWidth={1}
        strokeDasharray="4,2"
      />

      {/* Threshold fill - highlights areas above/below baseline */}
      <Threshold
        id={`threshold-${label}`}
        data={data}
        x={(d) => xScale(d.x)}
        y0={(d) => yScale(d.y)}
        y1={() => yScale(0)}
        clipAboveTo={yScale.range()[1]}
        clipBelowTo={yScale.range()[0]}
        curve={curveMonotoneX}
        aboveAreaProps={{
          fill: color,
          fillOpacity: 0.15,
        }}
        belowAreaProps={{
          fill: color,
          fillOpacity: 0.08,
        }}
      />

      {/* Waveform - use linear interpolation to preserve sharp K-complexes and spindles */}
      <LinePath
        data={data}
        x={(d) => xScale(d.x)}
        y={(d) => yScale(d.y)}
        stroke={color}
        strokeWidth={1.5}
        strokeOpacity={0.9}
        strokeLinecap="round"
      />

      {/* Label */}
      <text
        x={10}
        y={yOffset + height / 2}
        textAnchor="start"
        dominantBaseline="middle"
        style={{ fill: color, fontSize: 13, fontWeight: 600 }}
      >
        {label}
      </text>

      {/* Annotation */}
      {annotation && (
        <text
          x={margin.left + innerWidth + 10}
          y={yOffset + height / 2}
          textAnchor="start"
          dominantBaseline="middle"
          style={{ fill: "rgba(229, 236, 255, 0.6)", fontSize: 11 }}
        >
          {annotation}
        </text>
      )}
    </Group>
  );
}

export default function PSGTraces({ state, width, height }: PSGTracesProps) {
  const traceHeight = height / 5;

  const eegData = useMemo(() => generateEEGTrace(state), [state.remBlendFactor, state.hypnogramStage, state.trnSpindleIntensity]);
  const eogData = useMemo(() => generateEOGTrace(state), [state.hypnogramStage]);
  const emgData = useMemo(() => generateEMGTrace(state), [state.hypnogramStage]);
  const respData = useMemo(() => generateRespTrace(state), [state.hypnogramStage]);
  const hrData = useMemo(() => generateHRTrace(state), [state.hypnogramStage]);

  return (
    <svg
      width={width}
      height={height}
      role="img"
      aria-label="Polysomnography traces showing brain and body activity during sleep"
    >
      <title>Polysomnography (PSG) Multi-Channel Recording</title>
      <desc>
        Five-channel physiological monitoring displaying EEG brain waves, EOG eye movements,
        EMG muscle tone, respiration pattern, and heart rate. Current state shows {
          state.emgPattern === "flatline" ? "muscle atonia (paralysis)" : "active muscle tone"
        } and {state.eogBurstPattern === "rem-saccades" ? "rapid eye movements" : "minimal eye activity"}.
      </desc>

      <LinearGradient id="eeg-grad" from={TRACE_COLORS.eeg} to="#a4b8e8" />
      <LinearGradient id="eog-grad" from={TRACE_COLORS.eog} to="#e0d4f8" />
      <LinearGradient id="emg-grad" from={TRACE_COLORS.emg} to="#f0a4a4" />
      <LinearGradient id="resp-grad" from={TRACE_COLORS.resp} to="#b8e8c8" />
      <LinearGradient id="hr-grad" from={TRACE_COLORS.hr} to="#f9e79f" />

      <TraceChannel
        label="EEG (C3-M2)"
        data={eegData}
        color={TRACE_COLORS.eeg}
        yOffset={0}
        height={traceHeight}
        width={width}
        annotation={(() => {
          const stage = state.hypnogramStage;
          if (stage === "wake") return "Alpha/Beta";
          if (stage === "n1") return "Theta";
          if (stage === "n2") {
            const intensity = state.trnSpindleIntensity;
            if (intensity > 0.5) return "Spindles+";
            if (intensity > 0.2) return "Spindles";
            return "Spindles-";
          }
          if (stage === "n3") return "Delta SWS";
          if (stage === "rem") return "Theta/Gamma";
          return "Mixed";
        })()}
      />

      <TraceChannel
        label="EOG (L-R)"
        data={eogData}
        color={TRACE_COLORS.eog}
        yOffset={traceHeight}
        height={traceHeight}
        width={width}
        annotation={state.eogBurstPattern === "rem-saccades" ? "REM bursts" : "Slow rolling"}
      />

      <TraceChannel
        label="EMG (Chin)"
        data={emgData}
        color={TRACE_COLORS.emg}
        yOffset={traceHeight * 2}
        height={traceHeight}
        width={width}
        annotation={state.emgPattern === "flatline" ? "ATONIA" : "Active"}
      />

      <TraceChannel
        label="Respiration"
        data={respData}
        color={TRACE_COLORS.resp}
        yOffset={traceHeight * 3}
        height={traceHeight}
        width={width}
        annotation={state.respirationPattern === "irregular" ? "Irregular" : "Regular"}
      />

      <TraceChannel
        label="HR"
        data={hrData}
        color={TRACE_COLORS.hr}
        yOffset={traceHeight * 4}
        height={traceHeight}
        width={width}
        annotation={`${Math.round(state.heartRate)} bpm`}
      />

      {/* Time markers */}
      <text
        x={width - 60}
        y={height - 10}
        textAnchor="end"
        style={{ fill: "rgba(229, 236, 255, 0.5)", fontSize: 10 }}
      >
        10 seconds
      </text>
    </svg>
  );
}
