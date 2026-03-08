// @ts-nocheck
"use client";

import React, { useMemo } from "react";
import { Group } from "@visx/group";
import { scaleLinear } from "@visx/scale";
import { AreaClosed, LinePath } from "@visx/shape";
import { curveLinear } from "@visx/curve";
import { AxisBottom, AxisLeft } from "@visx/axis";
import { GridRows } from "@visx/grid";
import { LinearGradient } from "@visx/gradient";
import type { NEDataPoint } from "./types";

const CYCLE_PERIOD = 50; // seconds

interface NEOscillationGraphProps {
  width: number;
  height: number;
  currentTime: number;
  neLevel: number;
  phase: string;
}

export default function NEOscillationGraph({
  width,
  height,
  currentTime,
  neLevel,
  phase,
}: NEOscillationGraphProps) {
  const margin = { top: 20, right: 40, bottom: 60, left: 70 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  // Generate NE oscillation data
  const data = useMemo((): NEDataPoint[] => {
    const points: NEDataPoint[] = [];
    const numPoints = 1200;
    const maxTime = 150; // 3 cycles

    for (let i = 0; i <= numPoints; i++) {
      const t = (i / numPoints) * maxTime;
      const baseLevel = 0.5;
      const amplitude = 0.2;
      const level = baseLevel + amplitude * Math.sin((2 * Math.PI * t) / CYCLE_PERIOD);
      points.push({ time: t, level });
    }

    return points;
  }, []);

  // Scales
  const xScale = useMemo(
    () =>
      scaleLinear({
        domain: [0, 150],
        range: [0, innerWidth],
      }),
    [innerWidth]
  );

  const yScale = useMemo(
    () =>
      scaleLinear({
        domain: [0, 1],
        range: [innerHeight, 0],
      }),
    [innerHeight]
  );

  // Accessors
  const getX = (d: NEDataPoint) => xScale(d.time) ?? 0;
  const getY = (d: NEDataPoint) => yScale(d.level) ?? 0;

  // Find the actual data point at current time (for accurate dot positioning)
  const currentDataPoint = useMemo(() => {
    // Find closest data point to current time
    let closestPoint = data[0];
    let minDiff = Math.abs(data[0].time - currentTime);

    for (const point of data) {
      const diff = Math.abs(point.time - currentTime);
      if (diff < minDiff) {
        minDiff = diff;
        closestPoint = point;
      }
    }

    return closestPoint;
  }, [data, currentTime]);

  // Current point indicator - use actual curve data
  const clampedTime = Math.max(0, Math.min(currentTime, 150));
  const currentX = Math.max(0, Math.min(xScale(clampedTime) ?? 0, innerWidth));
  const currentY = Math.max(0, Math.min(yScale(currentDataPoint.level) ?? 0, innerHeight));

  // Show curve only after intro phase
  const visibleData = useMemo(() => {
    const filtered = data.filter((d) => d.time <= clampedTime);

    if (filtered.length >= 2) {
      return filtered;
    }

    // Ensure there's always a minimal baseline segment during the intro ramp
    const fallbackEndIndex = Math.min(1, data.length - 1);
    return data.slice(0, fallbackEndIndex + 1);
  }, [data, clampedTime]);

  // Always full opacity when curve is shown
  const graphOpacity = 1;

  return (
    <div className="relative">
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ display: "block", width: "100%", height: "auto", maxWidth: "100%" }}
      >
        <defs>
          <LinearGradient id="ne-gradient" from="#f59e0b" to="#ea580c" vertical={true} />
        </defs>

        <Group left={margin.left} top={margin.top}>
          {/* Grid */}
          <GridRows
            scale={yScale}
            width={innerWidth}
            stroke="var(--border)"
            strokeOpacity={0.3}
            strokeDasharray="2,2"
            numTicks={5}
          />

          {/* Area under curve */}
          {visibleData.length > 1 && (
            <AreaClosed
              data={visibleData}
              x={getX}
              y={getY}
              yScale={yScale}
              fill="url(#ne-gradient)"
              fillOpacity={0.3}
              curve={curveLinear}
            />
          )}

          {/* Line path */}
          {visibleData.length > 1 && (
            <LinePath
              data={visibleData}
              x={getX}
              y={getY}
              stroke="#f59e0b"
              strokeWidth={2.5}
              curve={curveLinear}
              strokeOpacity={0.9}
            />
          )}

          {/* Current time indicator */}
          <g opacity={phase === "intro" ? 0.35 : 1}>
            <line
              x1={currentX}
              y1={0}
              x2={currentX}
              y2={innerHeight}
              stroke="var(--color-golden-yellow)"
              strokeWidth={1.5}
              strokeDasharray="4,4"
              strokeOpacity={0.6}
            />
            <circle
              cx={currentX}
              cy={currentY}
              r={5}
              fill="#f59e0b"
              stroke="#fff"
              strokeWidth={2}
            />
          </g>

          {/* Enhanced micro-arousal markers with bursts */}
          {phase !== "intro" && [50, 100, 150].map((t) => {
            if (t > currentTime) return null;
            const x = xScale(t) ?? 0;
            const baseY = yScale(0.5) ?? 0;
            const peakY = yScale(0.7) ?? 0;

            // Check if we're near this arousal point (within 3 seconds)
            const isNearArousal = Math.abs(currentTime - t) < 3;

            return (
              <g key={t}>
                {/* Vertical burst lines */}
                <defs>
                  <linearGradient id={`burst-gradient-${t}`} x1="0%" y1="100%" x2="0%" y2="0%">
                    <stop offset="0%" stopColor="#f59e0b" stopOpacity="0" />
                    <stop offset="50%" stopColor="#f59e0b" stopOpacity="0.6" />
                    <stop offset="100%" stopColor="#fbbf24" stopOpacity="0.9" />
                  </linearGradient>
                </defs>

                {/* Main burst line */}
                <line
                  x1={x}
                  y1={innerHeight}
                  x2={x}
                  y2={peakY - 20}
                  stroke={`url(#burst-gradient-${t})`}
                  strokeWidth={3}
                  strokeOpacity={isNearArousal ? 0.8 : 0.5}
                />

                {/* Burst rays */}
                {[-15, -7.5, 7.5, 15].map((angle, i) => (
                  <line
                    key={i}
                    x1={x}
                    y1={baseY}
                    x2={x + Math.sin((angle * Math.PI) / 180) * 30}
                    y2={baseY - Math.cos((angle * Math.PI) / 180) * 40}
                    stroke="#f59e0b"
                    strokeWidth={2}
                    strokeOpacity={(isNearArousal ? 0.6 : 0.3) * (1 - Math.abs(angle) / 20)}
                  />
                ))}

                {/* Pulsing circle at peak */}
                <circle
                  cx={x}
                  cy={peakY - 25}
                  r={isNearArousal ? 8 : 5}
                  fill="#fbbf24"
                  opacity={isNearArousal ? 0.9 : 0.6}
                >
                  {isNearArousal && (
                    <animate
                      attributeName="r"
                      values="5;10;5"
                      dur="1.5s"
                      repeatCount="indefinite"
                    />
                  )}
                </circle>

                {/* Micro-arousal label with icon */}
                <text
                  x={x}
                  y={peakY - 35}
                  textAnchor="middle"
                  fontSize={9}
                  fill="#f59e0b"
                  fontWeight="600"
                  opacity={0.8}
                >
                  ⚡ micro-arousal
                </text>

                {/* Mini EEG spike visualization */}
                {isNearArousal && (
                  <g opacity={0.7}>
                    {/* Small EEG trace showing spike */}
                    <path
                      d={`
                        M ${x - 20},${peakY - 55}
                        L ${x - 15},${peakY - 55}
                        L ${x - 10},${peakY - 50}
                        L ${x - 5},${peakY - 55}
                        L ${x},${peakY - 70}
                        L ${x + 5},${peakY - 40}
                        L ${x + 10},${peakY - 55}
                        L ${x + 15},${peakY - 52}
                        L ${x + 20},${peakY - 55}
                      `}
                      stroke="#f59e0b"
                      strokeWidth={1.5}
                      fill="none"
                    />
                    <text
                      x={x + 25}
                      y={peakY - 50}
                      fontSize={7}
                      fill="#f59e0b"
                      opacity={0.6}
                    >
                      EEG
                    </text>
                  </g>
                )}
              </g>
            );
          })}

          {/* Axes */}
          <AxisBottom
            top={innerHeight}
            scale={xScale}
            stroke="var(--foreground)"
            strokeOpacity={0.3}
            tickStroke="var(--foreground)"
            tickLabelProps={() => ({
              fill: "var(--foreground)",
              fontSize: 11,
              textAnchor: "middle",
              opacity: 0.7,
            })}
            label="Time (seconds)"
            labelOffset={30}
            labelProps={{
              fill: "var(--foreground)",
              fontSize: 12,
              textAnchor: "middle",
              opacity: 0.8,
            }}
            numTicks={6}
          />
          <AxisLeft
            scale={yScale}
            stroke="var(--foreground)"
            strokeOpacity={0.3}
            tickStroke="var(--foreground)"
            tickLabelProps={() => ({
              fill: "var(--foreground)",
              fontSize: 11,
              textAnchor: "end",
              dx: -5,
              opacity: 0.7,
            })}
            label="NE Level"
            labelOffset={50}
            labelProps={{
              fill: "var(--foreground)",
              fontSize: 12,
              textAnchor: "middle",
              opacity: 0.8,
            }}
            numTicks={5}
          />
        </Group>
      </svg>

      {/* Legend */}
      <div className="absolute top-4 right-4 text-xs" style={{ color: "var(--foreground)" }}>
        <div className="flex items-center gap-2 mb-1">
          <div className="w-4 h-2 rounded" style={{ background: "#f59e0b" }}></div>
          <span className="opacity-70">Norepinephrine</span>
        </div>
        <div className="text-[10px] opacity-50 mt-1">~50 sec period</div>
      </div>
    </div>
  );
}
