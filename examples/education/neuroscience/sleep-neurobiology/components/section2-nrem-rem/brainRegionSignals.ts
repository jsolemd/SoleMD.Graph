import type { Section2State } from "./types";

/**
 * Waveform definitions for the thalamocortical circuit visualizer. Each generator returns
 * biologically inspired synthetic microvolt traces for a specific region so the learner sees
 * the hallmarks of each sleep stage (spindles, K-complexes, slow waves, REM theta, etc.).
 */
export interface WavePoint {
  x: number;
  y: number;
}

export type RegionalSignal =
  | "cortex"
  | "thalamus"
  | "trn"
  | "hippocampus"
  | "brainstem"
  | "spinal";

export const REGIONAL_SIGNAL_DOMAINS: Record<RegionalSignal, readonly [number, number]> = {
  cortex: [-160, 160],
  thalamus: [-110, 110],
  trn: [-130, 130],
  hippocampus: [-140, 140],
  brainstem: [-70, 70],
  spinal: [-180, 180],
} as const;

const TWO_PI = Math.PI * 2;
export const EEG_WINDOW_SECONDS = 6;

const WINDOW_SECONDS = EEG_WINDOW_SECONDS;

const STAGE_SPINDLE_CENTERS: Partial<Record<Section2State["hypnogramStage"], number[]>> = {
  n2: [1.05, 3.0, 4.8],
  n3: [2.8],
};

const STAGE_K_COMPLEX_CENTERS: Partial<Record<Section2State["hypnogramStage"], number[]>> = {
  n2: [2.35, 5.25],
};

const STAGE_VERTEX_CENTERS: Partial<Record<Section2State["hypnogramStage"], number[]>> = {
  n1: [1.6, 3.5, 5.05],
};

const REM_PGO_PULSES = [1.4, 3.1, 4.7];

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

interface WaveComponent {
  amplitude: number;
  frequency: number;
  phase?: number;
}

function sineComponent(time: number, { amplitude, frequency, phase = 0 }: WaveComponent): number {
  return amplitude * Math.sin(TWO_PI * frequency * time + phase);
}

function sumComponents(time: number, components: WaveComponent[]): number {
  return components.reduce((total, component) => total + sineComponent(time, component), 0);
}

function gaussianPulse(time: number, center: number, stdDev: number): number {
  const normalized = (time - center) / stdDev;
  return Math.exp(-0.5 * normalized * normalized);
}

function spindleBurst(
  time: number,
  center: number,
  sigmaWidth: number,
  amplitude: number,
  frequency: number,
  phase: number = Math.PI / 5,
): number {
  const envelope = gaussianPulse(time, center, sigmaWidth);
  return amplitude * envelope * Math.sin(TWO_PI * frequency * time + phase);
}

function kComplexWave(time: number, center: number, negativeAmplitude: number, positiveAmplitude: number): number {
  const downStroke = -negativeAmplitude * gaussianPulse(time, center, 0.23);
  const upStroke = positiveAmplitude * gaussianPulse(time, center + 0.32, 0.30);
  return downStroke + upStroke;
}

function vertexWave(time: number, center: number, amplitude: number): number {
  const sharp = -amplitude * gaussianPulse(time, center, 0.11);
  const rebound = amplitude * 0.5 * gaussianPulse(time, center + 0.18, 0.16);
  return sharp + rebound;
}

function rippleBurst(time: number, center: number, amplitude: number, frequency: number): number {
  const envelope = gaussianPulse(time, center, 0.018);
  return amplitude * envelope * Math.sin(TWO_PI * frequency * (time - center));
}

export function generateRegionalWaveform(
  region: RegionalSignal,
  state: Section2State,
  samples: number = 512,
): WavePoint[] {
  const data: WavePoint[] = [];
  const stage = state.hypnogramStage;
  const remBlend = clamp01(state.remBlendFactor);
  const spindleGain = clamp01(state.trnSpindleIntensity);
  const deltaGain = clamp01(state.cortexWaveAmplitude);
  const memoryGain = clamp01(state.memoryFlowRate);
  const spindleCenters = STAGE_SPINDLE_CENTERS[stage] ?? [];
  const kComplexCenters = STAGE_K_COMPLEX_CENTERS[stage] ?? [];
  const vertexCenters = STAGE_VERTEX_CENTERS[stage] ?? [];

  for (let i = 0; i < samples; i += 1) {
    const progress = i / (samples - 1);
    const time = progress * WINDOW_SECONDS;
    let value = 0;

    switch (region) {
      case "cortex": {
        if (stage === "wake") {
          const alpha = sumComponents(time, [
            { amplitude: 38, frequency: 9.8 },
            { amplitude: 16, frequency: 11.2, phase: Math.PI / 7 },
          ]);
          const beta = sumComponents(time, [
            { amplitude: 18, frequency: 17.5, phase: Math.PI / 3 },
            { amplitude: 12, frequency: 22.5, phase: Math.PI / 5 },
          ]);
          value = alpha + beta;
          break;
        }

        if (stage === "n1") {
          const theta = sumComponents(time, [
            { amplitude: 32, frequency: 5.6 },
            { amplitude: 18, frequency: 6.8, phase: Math.PI / 6 },
          ]);
          const residualAlpha = sumComponents(time, [
            { amplitude: 12, frequency: 9.5, phase: Math.PI / 8 },
          ]);
          const vertex = vertexCenters.reduce((sum, center) => sum + vertexWave(time, center, 70), 0);
          const slowDrift = sineComponent(time, { amplitude: 10 + deltaGain * 10, frequency: 1.3, phase: Math.PI / 5 });
          value = theta + residualAlpha + vertex + slowDrift;
          break;
        }

        if (stage === "n3") {
          const slow = sumComponents(time, [
            { amplitude: 120 + deltaGain * 45, frequency: 0.9 },
            { amplitude: 70 + deltaGain * 30, frequency: 0.5, phase: Math.PI / 6 },
            { amplitude: 45, frequency: 1.4, phase: Math.PI / 4 },
          ]);
          const rareSpindle = spindleCenters.reduce(
            (sum, center) => sum + spindleBurst(time, center, 0.28, 22, 12.8),
            0,
          );
          const remLike = sumComponents(time, [
            { amplitude: 26, frequency: 6.6, phase: Math.PI / 8 },
            { amplitude: 12, frequency: 18.5, phase: Math.PI / 5 },
            { amplitude: 6, frequency: 34, phase: Math.PI / 7 },
          ]);
          value = slow * (1 - remBlend) + remLike * remBlend + rareSpindle * (1 - remBlend);
          break;
        }

        if (stage === "rem") {
          const theta = sumComponents(time, [
            { amplitude: 32, frequency: 6.4 },
            { amplitude: 18, frequency: 7.8, phase: Math.PI / 4 },
          ]);
          const betaGamma = sumComponents(time, [
            { amplitude: 14, frequency: 19.5, phase: Math.PI / 6 },
            { amplitude: 8, frequency: 34.0, phase: Math.PI / 3 },
          ]);
          value = theta + betaGamma;
          break;
        }

        const theta = sumComponents(time, [
          { amplitude: 34 + deltaGain * 12, frequency: 6.1 },
          { amplitude: 16, frequency: 7.4, phase: Math.PI / 5 },
        ]);
        const lowDelta = sineComponent(time, {
          amplitude: 18 + deltaGain * 24,
          frequency: 1.15,
          phase: Math.PI / 6,
        });
        const spindleEnvelope = spindleCenters.reduce(
          (sum, center) =>
            sum +
            spindleBurst(
              time,
              center,
              0.24 + 0.05 * (1 - spindleGain),
              36 + spindleGain * 52,
              12.4 + spindleGain * 1.8,
            ),
          0,
        );
        const kComplex = kComplexCenters.reduce(
          (sum, center) => sum + kComplexWave(time, center, 95 + deltaGain * 38, 72 + deltaGain * 22),
          0,
        );
        const remBlendPattern = sumComponents(time, [
          { amplitude: 24, frequency: 6.8, phase: Math.PI / 7 },
          { amplitude: 12, frequency: 19.2, phase: Math.PI / 6 },
          { amplitude: 6, frequency: 33.6, phase: Math.PI / 2 },
        ]);
        value = (theta + lowDelta + spindleEnvelope + kComplex) * (1 - remBlend) + remBlendPattern * remBlend;
        break;
      }

      case "thalamus": {
        if (stage === "wake") {
          const alphaRelay = sumComponents(time, [
            { amplitude: 28, frequency: 10.3 },
            { amplitude: 12, frequency: 12.6, phase: Math.PI / 6 },
          ]);
          const baseline = sineComponent(time, { amplitude: 8, frequency: 5.2, phase: Math.PI / 4 });
          value = alphaRelay + baseline;
          break;
        }

        if (stage === "n1") {
          const thetaGate = sumComponents(time, [
            { amplitude: 20, frequency: 5.8 },
            { amplitude: 12, frequency: 8.5, phase: Math.PI / 5 },
          ]);
          const fadingAlpha = sumComponents(time, [
            { amplitude: 12, frequency: 10.5, phase: Math.PI / 7 },
          ]);
          value = thetaGate + fadingAlpha;
          break;
        }

        if (stage === "n3") {
          const slow = sumComponents(time, [
            { amplitude: 66 + deltaGain * 30, frequency: 0.95, phase: Math.PI / 5 },
            { amplitude: 28, frequency: 2.2, phase: Math.PI / 6 },
          ]);
          const remGate = sumComponents(time, [
            { amplitude: 22, frequency: 6.4, phase: Math.PI / 5 },
            { amplitude: 10, frequency: 17.5, phase: Math.PI / 7 },
          ]);
          value = slow * (1 - remBlend) + remGate * remBlend;
          break;
        }

        if (stage === "rem") {
          const thetaGate = sumComponents(time, [
            { amplitude: 26, frequency: 6.5 },
            { amplitude: 14, frequency: 8.8, phase: Math.PI / 6 },
          ]);
          const fastRelay = sumComponents(time, [
            { amplitude: 10, frequency: 17.0, phase: Math.PI / 4 },
            { amplitude: 6, frequency: 32.0, phase: Math.PI / 3 },
          ]);
          value = thetaGate + fastRelay;
          break;
        }

        const base = sumComponents(time, [
          { amplitude: 14 + deltaGain * 10, frequency: 1.8, phase: Math.PI / 4 },
        ]);
        const spindle = spindleCenters.reduce(
          (sum, center) =>
            sum +
            spindleBurst(
              time,
              center,
              0.21,
              44 + spindleGain * 58,
              12.6 + spindleGain * 1.6,
              Math.PI / 4,
            ),
          0,
        );
        const remComponent = sumComponents(time, [
          { amplitude: 24, frequency: 6.8, phase: Math.PI / 5 },
          { amplitude: 12, frequency: 18.4, phase: Math.PI / 6 },
        ]);
        value = (base + spindle) * (1 - remBlend) + remComponent * remBlend;
        break;
      }

      case "trn": {
        if (stage === "wake") {
          value = sumComponents(time, [
            { amplitude: 6, frequency: 8.0, phase: Math.PI / 6 },
            { amplitude: 4, frequency: 13.0, phase: Math.PI / 3 },
          ]);
          break;
        }

        if (stage === "rem") {
          const remIdling = sumComponents(time, [
            { amplitude: 10, frequency: 6.5, phase: Math.PI / 5 },
            { amplitude: 6, frequency: 18.0, phase: Math.PI / 6 },
          ]);
          value = remIdling;
          break;
        }

        const spindleCore = spindleCenters.reduce(
          (sum, center) =>
            sum +
            spindleBurst(
              time,
              center,
              0.18,
              58 + spindleGain * 72,
              12.8 + spindleGain * 1.9,
              Math.PI / 6,
            ),
          0,
        );
        const inhibitoryFloor = -14 * (1 - remBlend) * gaussianPulse(time, 3.2, 1.4);
        const remLeak = sumComponents(time, [
          { amplitude: 12, frequency: 6.2, phase: Math.PI / 5 },
          { amplitude: 6, frequency: 18.5, phase: Math.PI / 6 },
        ]);
        value = spindleCore * (1 - remBlend) + remLeak * remBlend + inhibitoryFloor;
        break;
      }

      case "hippocampus": {
        if (stage === "wake") {
          value = sumComponents(time, [
            { amplitude: 24, frequency: 4.5 },
            { amplitude: 16, frequency: 7.5, phase: Math.PI / 3 },
            { amplitude: 12, frequency: 10.5, phase: Math.PI / 2 },
          ]);
          break;
        }

        if (stage === "rem") {
          const theta = sumComponents(time, [
            { amplitude: 46 + memoryGain * 20, frequency: 6.6 },
            { amplitude: 16, frequency: 8.4, phase: Math.PI / 4 },
          ]);
          const gamma = sumComponents(time, [
            { amplitude: 10, frequency: 35.0, phase: Math.PI / 6 },
            { amplitude: 8, frequency: 58.0, phase: Math.PI / 3 },
          ]);
          value = theta + gamma;
          break;
        }

        const slowWave = sumComponents(time, [
          { amplitude: 40 + deltaGain * 28, frequency: 0.95, phase: Math.PI / 6 },
          { amplitude: 18, frequency: 1.8, phase: Math.PI / 4 },
        ]);
        const rippleCenters = spindleCenters.length
          ? spindleCenters.map((center) => center + 0.055)
          : [1.2, 3.3, 5.0];
        const ripples = rippleCenters.reduce(
          (sum, center) => sum + rippleBurst(time, center, 28 + memoryGain * 36, 140 + memoryGain * 90),
          0,
        );
        const thetaBridge = sumComponents(time, [
          { amplitude: 20 + memoryGain * 12, frequency: 6.1 },
          { amplitude: 10, frequency: 8.6, phase: Math.PI / 6 },
        ]);
        const remTheta = sumComponents(time, [
          { amplitude: 40 + memoryGain * 18, frequency: 6.7 },
          { amplitude: 14, frequency: 8.9, phase: Math.PI / 4 },
          { amplitude: 8, frequency: 32.0, phase: Math.PI / 5 },
        ]);
        value = (slowWave + ripples + thetaBridge * 0.35) * (1 - remBlend) + remTheta * remBlend;
        break;
      }

      case "brainstem": {
        const remDrive = remBlend;
        const offDrive = 1 - remDrive;
        const remOff = offDrive * (48 + 9 * Math.sin(TWO_PI * 0.28 * time + Math.PI / 3));
        const remOn = remDrive * (52 + 7 * Math.sin(TWO_PI * 0.32 * time + Math.PI / 4));
        const flipFlop = remOn - remOff;

        const pgo = remDrive > 0.35
          ? REM_PGO_PULSES.reduce(
              (sum, center) => sum + 22 * gaussianPulse(time, center, 0.08) * Math.sin(TWO_PI * 3.5 * (time - center)),
              0,
            )
          : 0;

        const tonicBias = (state.brainstemPosition === "rem" ? 1 : 0) * 8;
        value = flipFlop + pgo + tonicBias - 6;
        break;
      }

      case "spinal": {
        const baseToneByStage: Record<Section2State["hypnogramStage"], number> = {
          wake: 1,
          n1: 0.72,
          n2: 0.52,
          n3: 0.32,
          rem: 0.08,
        };
        const toneMultiplier = baseToneByStage[stage] ?? 0.4;
        const pattern =
          state.emgPattern === "flatline"
            ? 0
            : toneMultiplier * state.emgAmplitude * (1 - remBlend * 0.85);

        const highFreq = sineComponent(time, { amplitude: 90 * pattern, frequency: 48 });
        const midFreq = sineComponent(time, { amplitude: 38 * pattern, frequency: 72, phase: Math.PI / 4 });
        const lowFreq = sineComponent(time, { amplitude: 22 * pattern, frequency: 32, phase: Math.PI / 5 });
        const remNoise = sineComponent(time, { amplitude: 6 + remBlend * 8, frequency: 25, phase: Math.PI / 3 });

        value = highFreq + midFreq + lowFreq;
        value = value * (1 - remBlend) + remNoise * remBlend;
        break;
      }
    }

    data.push({ x: progress, y: value });
  }

  return data;
}
