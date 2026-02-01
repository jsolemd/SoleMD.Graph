"use client";

import React from "react";
import { AxisLeft, AxisBottom } from "@visx/axis";
import { GridRows, GridColumns } from "@visx/grid";
import { scaleLinear, scaleTime } from "@visx/scale";
import { Area, Line, LinePath, Bar } from "@visx/shape";
import { curveMonotoneX, curveBasis, curveStep } from "@visx/curve";
import { Group } from "@visx/group";
import { GradientTealBlue, GradientOrangeRed, GradientPurpleRed } from "@visx/gradient";
import { Threshold } from "@visx/threshold";
import { Pattern } from "@visx/pattern";
import { Annotation, Label, Connector, CircleSubject } from "@visx/annotation";

// Types for medical data
export interface VitalSign {
  time: Date;
  value: number;
  unit: string;
}

export interface SleepStageData {
  time: Date;
  stage: number; // 0: Wake, 1: N1, 2: N2, 3: N3, 4: REM
}

export interface EEGData {
  time: number; // milliseconds
  amplitude: number; // microvolts
  frequency?: number; // Hz
}

export interface DoseResponseData {
  dose: number;
  response: number;
  errorBar?: number;
}

// EEG Waveform Component
export const EEGWaveform: React.FC<{
  data: EEGData[];
  width: number;
  height: number;
  margin?: { top: number; right: number; bottom: number; left: number };
}> = ({ data, width, height, margin = { top: 20, right: 20, bottom: 40, left: 60 } }) => {
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  const xScale = scaleLinear({
    domain: [Math.min(...data.map(d => d.time)), Math.max(...data.map(d => d.time))],
    range: [0, innerWidth],
  });

  const yScale = scaleLinear({
    domain: [-100, 100], // typical EEG range in microvolts
    range: [innerHeight, 0],
  });

  return (
    <svg width={width} height={height}>
      <GradientTealBlue id="eeg-gradient" />
      <Group left={margin.left} top={margin.top}>
        <GridRows scale={yScale} width={innerWidth} strokeDasharray="2,2" opacity={0.3} />
        <GridColumns scale={xScale} height={innerHeight} strokeDasharray="2,2" opacity={0.3} />

        <LinePath
          data={data}
          x={(d) => xScale(d.time)}
          y={(d) => yScale(d.amplitude)}
          stroke="url(#eeg-gradient)"
          strokeWidth={2}
          curve={curveBasis}
        />

        <AxisLeft
          scale={yScale}
          label="Amplitude (μV)"
          labelProps={{
            fontSize: 12,
            textAnchor: "middle",
            fill: "#666",
          }}
        />

        <AxisBottom
          scale={xScale}
          top={innerHeight}
          label="Time (ms)"
          labelProps={{
            fontSize: 12,
            textAnchor: "middle",
            fill: "#666",
          }}
        />
      </Group>
    </svg>
  );
};

// Sleep Hypnogram Component
export const SleepHypnogram: React.FC<{
  data: SleepStageData[];
  width: number;
  height: number;
  margin?: { top: number; right: number; bottom: number; left: number };
}> = ({ data, width, height, margin = { top: 20, right: 20, bottom: 40, left: 80 } }) => {
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  const xScale = scaleTime({
    domain: [data[0].time, data[data.length - 1].time],
    range: [0, innerWidth],
  });

  const yScale = scaleLinear({
    domain: [0, 4],
    range: [0, innerHeight],
  });

  const stageColors = ["#fbbf24", "#a3a3a3", "#737373", "#404040", "#8b5cf6"];
  const stageLabels = ["Wake", "N1", "N2", "N3", "REM"];

  return (
    <svg width={width} height={height}>
      <Pattern
        id="sleep-pattern"
        height={8}
        width={8}
        stroke="#e5e7eb"
        strokeWidth={1}
        orientation={["diagonal"]}
      />

      <Group left={margin.left} top={margin.top}>
        <rect
          x={0}
          y={0}
          width={innerWidth}
          height={innerHeight}
          fill="url(#sleep-pattern)"
          opacity={0.1}
        />

        <Area
          data={data}
          x={(d) => xScale(d.time)}
          y0={innerHeight}
          y1={(d) => yScale(d.stage)}
          curve={curveStep}
          fill="#3b82f6"
          fillOpacity={0.3}
          stroke="#3b82f6"
          strokeWidth={2}
        />

        {/* Stage labels */}
        {stageLabels.map((label, index) => (
          <text
            key={label}
            x={-10}
            y={yScale(index)}
            textAnchor="end"
            alignmentBaseline="middle"
            fontSize={12}
            fill={stageColors[index]}
          >
            {label}
          </text>
        ))}

        <AxisBottom
          scale={xScale}
          top={innerHeight}
          label="Time"
          tickFormat={(value) => {
            const date = value as Date;
            return `${date.getHours()}:${date.getMinutes().toString().padStart(2, "0")}`;
          }}
        />
      </Group>
    </svg>
  );
};

// Heart Rate Variability Chart
export const HeartRateChart: React.FC<{
  data: VitalSign[];
  width: number;
  height: number;
  normalRange?: { min: number; max: number };
}> = ({ data, width, height, normalRange = { min: 60, max: 100 } }) => {
  const margin = { top: 20, right: 20, bottom: 40, left: 60 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  const xScale = scaleTime({
    domain: [data[0].time, data[data.length - 1].time],
    range: [0, innerWidth],
  });

  const yScale = scaleLinear({
    domain: [40, 120],
    range: [innerHeight, 0],
  });

  return (
    <svg width={width} height={height}>
      <GradientOrangeRed id="hr-gradient" />

      <Group left={margin.left} top={margin.top}>
        {/* Normal range background */}
        <rect
          x={0}
          y={yScale(normalRange.max)}
          width={innerWidth}
          height={yScale(normalRange.min) - yScale(normalRange.max)}
          fill="#10b981"
          fillOpacity={0.1}
        />

        <Threshold
          data={data}
          x={(d) => xScale(d.time)}
          y0={(d) => yScale(normalRange.min)}
          y1={(d) => yScale(d.value)}
          clipAboveTo={yScale(normalRange.max)}
          clipBelowTo={yScale(normalRange.min)}
          curve={curveMonotoneX}
          belowAreaProps={{
            fill: "#3b82f6",
            fillOpacity: 0.3,
          }}
          aboveAreaProps={{
            fill: "#ef4444",
            fillOpacity: 0.3,
          }}
        />

        <LinePath
          data={data}
          x={(d) => xScale(d.time)}
          y={(d) => yScale(d.value)}
          stroke="url(#hr-gradient)"
          strokeWidth={3}
          curve={curveMonotoneX}
        />

        {/* Annotate abnormal values */}
        {data
          .filter((d) => d.value < normalRange.min || d.value > normalRange.max)
          .map((d, i) => (
            <Annotation
              key={i}
              x={xScale(d.time)}
              y={yScale(d.value)}
              dx={20}
              dy={d.value > normalRange.max ? -20 : 20}
            >
              <Connector stroke="#ef4444" />
              <CircleSubject radius={4} fill="#ef4444" />
              <Label
                showAnchorLine={false}
                backgroundFill="white"
                backgroundPadding={4}
                fontColor="#ef4444"
                fontSize={10}
              >
                {d.value} bpm
              </Label>
            </Annotation>
          ))}

        <AxisLeft scale={yScale} label="Heart Rate (bpm)" />
        <AxisBottom scale={xScale} top={innerHeight} label="Time" />
      </Group>
    </svg>
  );
};

// Dose-Response Curve
export const DoseResponseCurve: React.FC<{
  data: DoseResponseData[];
  width: number;
  height: number;
  ec50?: number;
}> = ({ data, width, height, ec50 }) => {
  const margin = { top: 20, right: 20, bottom: 40, left: 60 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  const xScale = scaleLinear({
    domain: [0, Math.max(...data.map(d => d.dose))],
    range: [0, innerWidth],
  });

  const yScale = scaleLinear({
    domain: [0, 100],
    range: [innerHeight, 0],
  });

  return (
    <svg width={width} height={height}>
      <GradientPurpleRed id="dose-gradient" />

      <Group left={margin.left} top={margin.top}>
        <GridRows scale={yScale} width={innerWidth} strokeDasharray="2,2" opacity={0.3} />
        <GridColumns scale={xScale} height={innerHeight} strokeDasharray="2,2" opacity={0.3} />

        {/* EC50 line */}
        {ec50 && (
          <>
            <line
              x1={xScale(ec50)}
              x2={xScale(ec50)}
              y1={0}
              y2={innerHeight}
              stroke="#f59e0b"
              strokeDasharray="4,4"
              strokeWidth={2}
            />
            <text
              x={xScale(ec50)}
              y={-5}
              textAnchor="middle"
              fontSize={12}
              fill="#f59e0b"
            >
              EC₅₀
            </text>
          </>
        )}

        <Area
          data={data}
          x={(d) => xScale(d.dose)}
          y0={innerHeight}
          y1={(d) => yScale(d.response)}
          curve={curveMonotoneX}
          fill="url(#dose-gradient)"
          fillOpacity={0.3}
        />

        <LinePath
          data={data}
          x={(d) => xScale(d.dose)}
          y={(d) => yScale(d.response)}
          stroke="url(#dose-gradient)"
          strokeWidth={3}
          curve={curveMonotoneX}
        />

        {/* Error bars */}
        {data.map((d, i) =>
          d.errorBar ? (
            <Group key={i}>
              <line
                x1={xScale(d.dose)}
                x2={xScale(d.dose)}
                y1={yScale(d.response - d.errorBar)}
                y2={yScale(d.response + d.errorBar)}
                stroke="#666"
                strokeWidth={1}
              />
              <line
                x1={xScale(d.dose) - 3}
                x2={xScale(d.dose) + 3}
                y1={yScale(d.response - d.errorBar)}
                y2={yScale(d.response - d.errorBar)}
                stroke="#666"
                strokeWidth={1}
              />
              <line
                x1={xScale(d.dose) - 3}
                x2={xScale(d.dose) + 3}
                y1={yScale(d.response + d.errorBar)}
                y2={yScale(d.response + d.errorBar)}
                stroke="#666"
                strokeWidth={1}
              />
            </Group>
          ) : null
        )}

        {/* Data points */}
        {data.map((d, i) => (
          <circle
            key={i}
            cx={xScale(d.dose)}
            cy={yScale(d.response)}
            r={4}
            fill="#8b5cf6"
            stroke="white"
            strokeWidth={2}
          />
        ))}

        <AxisLeft scale={yScale} label="Response (%)" />
        <AxisBottom scale={xScale} top={innerHeight} label="Dose (mg)" />
      </Group>
    </svg>
  );
};

export default {
  EEGWaveform,
  SleepHypnogram,
  HeartRateChart,
  DoseResponseCurve,
};