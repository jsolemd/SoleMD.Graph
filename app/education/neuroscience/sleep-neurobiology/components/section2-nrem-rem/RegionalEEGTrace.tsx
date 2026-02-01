"use client";

import React, { useMemo } from "react";
import { scaleLinear } from "@visx/scale";
import { LinePath, AreaClosed } from "@visx/shape";
import { Group } from "@visx/group";
import { GridRows } from "@visx/grid";
import { curveMonotoneX } from "@visx/curve";
import type { Section2State } from "./types";
import {
  generateRegionalWaveform,
  REGIONAL_SIGNAL_DOMAINS,
  type RegionalSignal,
} from "./brainRegionSignals";

interface RegionalEEGTraceProps {
  /** Brain region identifier */
  region: RegionalSignal;
  /** Current sleep state */
  state: Section2State;
  /** Width of the trace */
  width: number;
  /** Height of the trace */
  height: number;
  /** Color for the waveform */
  color: string;
  /** Show filled area under waveform */
  showFill?: boolean;
}

export default function RegionalEEGTrace({
  region,
  state,
  width,
  height,
  color,
  showFill = false,
}: RegionalEEGTraceProps) {
  const data = useMemo(
    () => generateRegionalWaveform(region, state, 480),
    [
      region,
      state.remBlendFactor,
      state.cortexWaveAmplitude,
      state.cortexWaveFrequency,
      state.trnSpindleIntensity,
      state.memoryFlowRate,
      state.brainstemPosition,
      state.emgPattern,
      state.emgAmplitude,
    ]
  );

  const margin = { top: 2, right: 2, bottom: 2, left: 2 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  const xScale = useMemo(
    () =>
      scaleLinear({
        domain: [0, 1],
        range: [0, innerWidth],
      }),
    [innerWidth]
  );

  const [domainMin, domainMax] = REGIONAL_SIGNAL_DOMAINS[region];
  const yScale = useMemo(
    () =>
      scaleLinear({
        domain: [domainMin, domainMax],
        range: [innerHeight, 0],
      }),
    [domainMax, domainMin, innerHeight]
  );

  const regionLabels: Record<RegionalSignal, string> = {
    cortex: "Cortex",
    thalamus: "Thalamus",
    trn: "Thalamic Reticular Nucleus",
    hippocampus: "Hippocampus",
    brainstem: "Brainstem",
    spinal: "Spinal Cord (EMG)",
  };

  return (
    <svg
      width={width}
      height={height}
      style={{ overflow: "visible" }}
      role="img"
      aria-label={`${regionLabels[region]} electrical activity trace`}
    >
      <defs>
        <filter id={`eeg-glow-${region}`}>
          <feGaussianBlur stdDeviation="2.0" result="coloredBlur"/>
          <feMerge>
            <feMergeNode in="coloredBlur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>

      <title>{regionLabels[region]} Activity</title>
      <Group left={margin.left} top={margin.top}>
        {/* Professional grid background */}
        <GridRows
          scale={yScale}
          width={innerWidth}
          strokeDasharray="1,3"
          stroke="rgba(255, 255, 255, 0.08)"
          numTicks={5}
        />

        {/* Baseline */}
        <line
          x1={0}
          x2={innerWidth}
          y1={yScale(0)}
          y2={yScale(0)}
          stroke="rgba(255, 255, 255, 0.15)"
          strokeWidth={0.6}
        />

        {/* Optional filled area */}
        {showFill && (
          <AreaClosed
            data={data}
            x={(d) => xScale(d.x)}
            y={(d) => yScale(d.y)}
            yScale={yScale}
            fill={color}
            fillOpacity={0.25}
          />
        )}

        {/* Waveform line with glow and smooth curve interpolation */}
        <LinePath
          data={data}
          x={(d) => xScale(d.x)}
          y={(d) => yScale(d.y)}
          stroke={color}
          strokeWidth={region === "spinal" ? 2.5 : 3.0}
          strokeOpacity={1.0}
          strokeLinecap="round"
          strokeLinejoin="round"
          filter={`url(#eeg-glow-${region})`}
          curve={curveMonotoneX}
        />
      </Group>
    </svg>
  );
}
