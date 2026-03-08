"use client";

import React, { useMemo } from "react";
import { scaleLinear, scaleBand } from "@visx/scale";
import { LinePath, AreaClosed } from "@visx/shape";
import { curveStepAfter } from "@visx/curve";
import { Group } from "@visx/group";
import { AxisLeft, AxisBottom } from "@visx/axis";
import { GridRows } from "@visx/grid";
import { LinearGradient } from "@visx/gradient";
import { ParentSize } from "@visx/responsive";
import type { Section2State } from "./types";

interface EnhancedHypnogramProps {
  state: Section2State;
  width?: number;
  height?: number;
}

interface HypnogramDataPoint {
  time: number; // Minutes (0-90)
  stage: number; // 0=wake, 1=N1, 2=N2, 3=N3, 4=REM
  label: string;
}

const STAGE_COLORS: Record<number, string> = {
  0: "#f8d379", // Wake - golden
  1: "#7f9cdc", // N1 - light blue
  2: "#6285cc", // N2 - medium blue
  3: "#335694", // N3 - deep blue
  4: "#14b8a6", // REM - teal (theta + acetylcholine)
};

const STAGE_FILLS: Record<number, string> = {
  0: "rgba(248, 211, 121, 0.4)", // Wake
  1: "rgba(127, 156, 220, 0.35)", // N1
  2: "rgba(98, 133, 204, 0.4)", // N2
  3: "rgba(51, 86, 148, 0.55)", // N3
  4: "rgba(20, 184, 166, 0.45)", // REM - teal
};

const STAGE_LABELS: Record<number, string> = {
  0: "Wake",
  1: "N1",
  2: "N2",
  3: "N3",
  4: "REM",
};

// Narration pause points from presentation script (Section 2)
const NARRATION_MARKERS = [
  { scrollPercent: 0.02, label: "Wake, eyes closed" },
  { scrollPercent: 0.05, label: "N1 drift" },
  { scrollPercent: 0.07, label: "N1 brief" },
  { scrollPercent: 0.12, label: "N2 entrance" },
  { scrollPercent: 0.20, label: "N2 deepens" },
  { scrollPercent: 0.35, label: "N3 bottoms out" },
  { scrollPercent: 0.50, label: "N3 delta maps" },
  { scrollPercent: 0.60, label: "PSG traces" },
  { scrollPercent: 0.70, label: "Transition to REM" },
  { scrollPercent: 0.80, label: "Atonia circuit" },
  { scrollPercent: 0.85, label: "Inside REM" },
  { scrollPercent: 0.87, label: "EOG bursts" },
  { scrollPercent: 0.92, label: "Orexin stabilizer" },
  { scrollPercent: 0.96, label: "REM winds down" },
  { scrollPercent: 1.00, label: "Cycle complete" },
];

// Generate realistic hypnogram data for a 90-minute sleep cycle
function generateHypnogramData(scrollProgress: number): HypnogramDataPoint[] {
  const data: HypnogramDataPoint[] = [];

  // Define realistic sleep stage progression
  const stageSequence: Array<{ end: number; stage: number }> = [
    { end: 5, stage: 0 },    // 0-5min: Relaxed wake (eyes closed)
    { end: 20, stage: 1 },   // 5-20min: N1 transition (extended to 15 min)
    { end: 38, stage: 2 },   // 20-38min: N2 stabilization with spindles/K complexes (~18 min)
    { end: 63, stage: 3 },   // 38-63min: N3 slow-wave sleep (~25 min)
    { end: 73, stage: 2 },   // 63-73min: Return to N2 bridge before REM (~10 min)
    { end: 85, stage: 4 },   // 73-85min: REM episode (~12 min)
    { end: 90, stage: 2 },   // 85-90min: REM winds down, return to N2 (~5 min)
  ];

  let currentStageIndex = 0;
  for (let minute = 0; minute <= 90; minute += 0.25) {
    // Determine current stage based on time
    while (
      currentStageIndex < stageSequence.length - 1 &&
      minute >= stageSequence[currentStageIndex].end
    ) {
      currentStageIndex++;
    }

    const stage = stageSequence[currentStageIndex].stage;

    data.push({
      time: minute,
      stage,
      label: STAGE_LABELS[stage],
    });
  }

  return data;
}

function EnhancedHypnogramInner({ state, width, height }: EnhancedHypnogramProps & { width: number; height: number }) {
  const margin = { top: 45, right: 80, bottom: 65, left: 60 };
  const innerWidth = Math.max(width - margin.left - margin.right, 200);
  const innerHeight = Math.max(height - margin.top - margin.bottom, 80);

  const data = useMemo(() => generateHypnogramData(state.scrollProgress), [state.scrollProgress]);

  // Filter data based on scroll progress (animated reveal)
  const visibleData = useMemo(() => {
    const currentMinute = state.scrollProgress * 90;
    return data.filter((d) => d.time <= currentMinute);
  }, [data, state.scrollProgress]);

  const xScale = useMemo(
    () =>
      scaleLinear({
        domain: [0, 90],
        range: [0, innerWidth],
      }),
    [innerWidth]
  );

  const yScale = useMemo(
    () =>
      scaleLinear({
        domain: [0, 4], // Wake to REM
        range: [0, innerHeight],
      }),
    [innerHeight]
  );

  const currentMinute = state.scrollProgress * 90;
  const progressX = xScale(currentMinute);

  return (
    <svg
      width={width}
      height={height}
      role="img"
      aria-label="Hypnogram showing sleep stages over 90 minutes"
    >
      <title>Hypnogram - Sleep Stage Progression</title>
      <desc>
        A visualization showing the progression through sleep stages (Wake, N1, N2, N3, and REM)
        over a 90-minute sleep cycle. Current time: {currentMinute.toFixed(0)} minutes.
      </desc>

      <LinearGradient id="wake-grad" from="#f8d379" to="#f9e79f" />
      <LinearGradient id="n1-grad" from="#7f9cdc" to="#a4b8e8" />
      <LinearGradient id="n2-grad" from="#6285cc" to="#8aa4db" />
      <LinearGradient id="n3-grad" from="#335694" to="#4a6fb0" />
      <LinearGradient id="rem-grad" from="#b8a5d8" to="#d0c4e8" />

      <Group left={margin.left} top={margin.top}>
        {/* Background grid */}
        <GridRows
          scale={yScale}
          width={innerWidth}
          strokeDasharray="2,4"
          stroke="rgba(229, 236, 255, 0.2)"
          strokeOpacity={0.5}
        />

        {/* Colored stage fills (like Section 1 ProcessGraph) */}
        {visibleData.map((d, i) => {
          if (i === 0) return null;
          const prevPoint = visibleData[i - 1];
          const x1 = xScale(prevPoint.time);
          const x2 = xScale(d.time);
          const y = yScale(d.stage);
          const height = innerHeight - y;

          return (
            <rect
              key={`fill-${i}`}
              x={x1}
              y={y}
              width={x2 - x1}
              height={height}
              fill={STAGE_FILLS[d.stage]}
            />
          );
        })}

        {/* Hypnogram line with colored stroke - split by stage for proper coloring */}
        {(() => {
          const segments: { data: HypnogramDataPoint[]; color: string }[] = [];
          let currentSegment: HypnogramDataPoint[] = [];
          let currentStage = -1;

          visibleData.forEach((point, i) => {
            if (point.stage !== currentStage && currentSegment.length > 0) {
              segments.push({
                data: [...currentSegment, point], // Include transition point
                color: STAGE_COLORS[currentStage] || "rgba(229, 236, 255, 0.95)"
              });
              currentSegment = [point];
              currentStage = point.stage;
            } else {
              currentSegment.push(point);
              if (i === 0) currentStage = point.stage;
            }
          });

          if (currentSegment.length > 0) {
            segments.push({
              data: currentSegment,
              color: STAGE_COLORS[currentStage] || "rgba(229, 236, 255, 0.95)"
            });
          }

          return segments.map((segment, i) => (
            <LinePath
              key={`segment-${i}`}
              data={segment.data}
              x={(d) => xScale(d.time)}
              y={(d) => yScale(d.stage)}
              stroke={segment.color}
              strokeWidth={3.5}
              curve={curveStepAfter}
              strokeLinecap="round"
            />
          ));
        })()}

        {/* Current time indicator - matches Section 1 style */}
        <line
          x1={progressX}
          x2={progressX}
          y1={-10}
          y2={innerHeight + 10}
          stroke="#ef4444"
          strokeWidth={3}
          strokeOpacity={0.8}
        />

        {/* Current time label badge - matches Section 1 */}
        <Group>
          {/* Background badge */}
          <rect
            x={progressX - 28}
            y={-28}
            width={56}
            height={20}
            fill="rgba(239, 68, 68, 0.95)"
            rx={10}
            stroke="#ffffff"
            strokeWidth={1.5}
          />
          {/* Time text */}
          <text
            x={progressX}
            y={-18}
            fontSize={11}
            fontWeight="700"
            fill="#ffffff"
            textAnchor="middle"
            fontFamily="monospace"
          >
            {Math.floor(currentMinute).toString().padStart(2, '0')} min
          </text>
        </Group>

        {/* Stage labels on left */}
        <AxisLeft
          scale={yScale}
          tickValues={[0, 1, 2, 3, 4]}
          tickFormat={(value) => STAGE_LABELS[value as number]}
          stroke="rgba(229, 236, 255, 0.3)"
          tickStroke="rgba(229, 236, 255, 0.3)"
          tickLabelProps={() => ({
            fill: "rgba(229, 236, 255, 0.8)",
            fontSize: 11,
            textAnchor: "end",
            dx: -8,
          })}
        />

        {/* Time axis */}
        <AxisBottom
          scale={xScale}
          top={innerHeight}
          tickValues={[0, 15, 30, 45, 60, 75, 90]}
          stroke="rgba(229, 236, 255, 0.3)"
          tickStroke="rgba(229, 236, 255, 0.3)"
          tickFormat={(value) => `${value}`}
          tickLabelProps={() => ({
            fill: "rgba(229, 236, 255, 0.7)",
            fontSize: 11,
            textAnchor: "middle",
          })}
          label="Time (minutes)"
          labelProps={{
            fill: "rgba(229, 236, 255, 0.8)",
            fontSize: 12,
            textAnchor: "middle",
            dy: 35,
          }}
        />

        {/* Narration pause markers */}
        {NARRATION_MARKERS.map((marker, i) => {
          const markerTime = marker.scrollPercent * 90;
          const shouldShow = state.scrollProgress >= marker.scrollPercent;

          // Find the stage at this time point
          const dataPoint = data.find((d) => Math.abs(d.time - markerTime) < 0.5);
          const stage = dataPoint?.stage ?? 0;

          return shouldShow ? (
            <g key={`narration-${i}`}>
              <circle
                cx={xScale(markerTime)}
                cy={yScale(stage)}
                r={5}
                fill={STAGE_COLORS[stage]}
                stroke="white"
                strokeWidth={2}
                opacity={0.95}
              />
              <circle
                cx={xScale(markerTime)}
                cy={yScale(stage)}
                r={3}
                fill="white"
                opacity={0.6}
              />
              <title>{`${(marker.scrollPercent * 100).toFixed(0)}% - ${marker.label}`}</title>
            </g>
          ) : null;
        })}

        {/* Stage markers on right */}
        {[
          { stage: 3, label: "Deep NREM", time: 50, labelOffset: 0 },
          { stage: 4, label: "First REM", time: 80, labelOffset: 0 },
        ].map((marker, i) => {
          const shouldShow = currentMinute >= marker.time;
          return shouldShow ? (
            <g key={i}>
              <circle
                cx={xScale(marker.time)}
                cy={yScale(marker.stage)}
                r={4}
                fill={STAGE_COLORS[marker.stage]}
                stroke="white"
                strokeWidth={1.5}
              />
              <text
                x={innerWidth + 8}
                y={yScale(marker.stage) + 4 + marker.labelOffset}
                style={{ fill: "rgba(229, 236, 255, 0.7)", fontSize: 10 }}
              >
                {marker.label}
              </text>
            </g>
          ) : null;
        })}
      </Group>
    </svg>
  );
}

export default function EnhancedHypnogram(props: EnhancedHypnogramProps) {
  if (props.width && props.height) {
    return <EnhancedHypnogramInner {...props} width={props.width} height={props.height} />;
  }

  return (
    <ParentSize debounceTime={10}>
      {({ width, height }) => <EnhancedHypnogramInner {...props} width={width} height={height || 200} />}
    </ParentSize>
  );
}
