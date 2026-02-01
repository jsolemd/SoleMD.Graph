"use client";

import React, { useMemo } from "react";
import { Group } from "@visx/group";
import { scaleLinear } from "@visx/scale";
import { AreaClosed, LinePath } from "@visx/shape";
import { curveLinear } from "@visx/curve";
import { AxisBottom, AxisLeft } from "@visx/axis";
import { GridRows } from "@visx/grid";
import type { VolumeDataPoint } from "./types";

const CYCLE_PERIOD = 50; // seconds

interface VolumePhaseGraphProps {
  width: number;
  height: number;
  currentTime: number;
  bloodVolume: number;
  csfVolume: number;
  phase: string;
}

export default function VolumePhaseGraph({
  width,
  height,
  currentTime,
  bloodVolume,
  csfVolume,
  phase,
}: VolumePhaseGraphProps) {
  const margin = { top: 20, right: 60, bottom: 60, left: 70 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  // Generate volume data
  const data = useMemo((): VolumeDataPoint[] => {
    const points: VolumeDataPoint[] = [];
    const numPoints = 1200;
    const maxTime = 150; // 3 cycles

    for (let i = 0; i <= numPoints; i++) {
      const t = (i / numPoints) * maxTime;
      const baseLevel = 0.5;
      const amplitude = 0.2;

      // Blood volume follows NE directly
      const blood = baseLevel + amplitude * Math.sin((2 * Math.PI * t) / CYCLE_PERIOD);

      // CSF volume is inverse
      const csf = 1 - blood;

      points.push({ time: t, blood, csf });
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
  const getX = (d: VolumeDataPoint) => xScale(d.time) ?? 0;
  const getBloodY = (d: VolumeDataPoint) => yScale(d.blood) ?? 0;
  const getCsfY = (d: VolumeDataPoint) => yScale(d.csf) ?? 0;

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

  // Current point indicators - use actual curve data
  const clampedTime = Math.max(0, Math.min(currentTime, 150));
  const currentX = Math.max(0, Math.min(xScale(clampedTime) ?? 0, innerWidth));
  const currentBloodY = Math.max(0, Math.min(yScale(currentDataPoint.blood) ?? 0, innerHeight));
  const currentCsfY = Math.max(0, Math.min(yScale(currentDataPoint.csf) ?? 0, innerHeight));

  const showInverseIndicators = phase === "volume-exchange" || phase === "flow-clearance";

  // Hide curves in intro phase - show only axes
  const visibleData = useMemo(() => {
    const filtered = data.filter((d) => d.time <= clampedTime);

    if (filtered.length >= 2) {
      return filtered;
    }

    const fallbackEndIndex = Math.min(1, data.length - 1);
    return data.slice(0, fallbackEndIndex + 1);
  }, [data, clampedTime]);

  return (
    <div className="relative">
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ display: "block", width: "100%", height: "auto", maxWidth: "100%" }}
      >
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

          {/* CSF volume area (blue) */}
          {visibleData.length > 1 && (
            <>
              <AreaClosed
                data={visibleData}
                x={getX}
                y={getCsfY}
                yScale={yScale}
                fill="#3b82f6"
                fillOpacity={0.2}
                curve={curveLinear}
              />
              <LinePath
                data={visibleData}
                x={getX}
                y={getCsfY}
                stroke="#3b82f6"
                strokeWidth={2.5}
                curve={curveLinear}
                strokeOpacity={0.9}
              />
            </>
          )}

          {/* Blood volume area (orange) */}
          {visibleData.length > 1 && (
            <>
              <AreaClosed
                data={visibleData}
                x={getX}
                y={getBloodY}
                yScale={yScale}
                fill="#f59e0b"
                fillOpacity={0.2}
                curve={curveLinear}
              />
              <LinePath
                data={visibleData}
                x={getX}
                y={getBloodY}
                stroke="#f59e0b"
                strokeWidth={2.5}
                curve={curveLinear}
                strokeOpacity={0.9}
              />
            </>
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
            {/* Blood point */}
            <circle
              cx={currentX}
              cy={currentBloodY}
              r={5}
              fill="#f59e0b"
              stroke="#fff"
              strokeWidth={2}
            />
            {/* CSF point */}
            <circle
              cx={currentX}
              cy={currentCsfY}
              r={5}
              fill="#3b82f6"
              stroke="#fff"
              strokeWidth={2}
            />
          </g>

          {/* Inverse relationship indicators */}
          {showInverseIndicators && currentTime > 30 && currentTime < 120 && (
            <>
              {/* Show at crossover points */}
              {bloodVolume > 0.48 && bloodVolume < 0.52 && (
                <g>
                  {/* Crossover marker */}
                  <circle
                    cx={currentX}
                    cy={yScale(0.5) ?? 0}
                    r={12}
                    fill="none"
                    stroke="var(--color-golden-yellow)"
                    strokeWidth={2}
                    strokeOpacity={0.6}
                    strokeDasharray="3,3"
                  />
                  <text
                    x={currentX + 20}
                    y={(yScale(0.5) ?? 0) - 2}
                    fontSize={9}
                    fill="var(--foreground)"
                    fontWeight="600"
                    opacity={0.7}
                  >
                    Crossover point
                  </text>
                </g>
              )}

              {/* Inverse relationship arrows when blood is high */}
              {bloodVolume > 0.6 && (
                <g opacity={0.7}>
                  {/* Blood up arrow */}
                  <path
                    d={`M ${currentX - 25},${currentBloodY + 15} L ${currentX - 25},${currentBloodY - 10} L ${currentX - 30},${currentBloodY - 5} M ${currentX - 25},${currentBloodY - 10} L ${currentX - 20},${currentBloodY - 5}`}
                    stroke="#f59e0b"
                    strokeWidth={2}
                    fill="none"
                  />
                  <text
                    x={currentX - 25}
                    y={currentBloodY + 30}
                    fontSize={8}
                    fill="#f59e0b"
                    textAnchor="middle"
                    fontWeight="600"
                  >
                    Blood ↑
                  </text>

                  {/* CSF down arrow */}
                  <path
                    d={`M ${currentX + 25},${currentCsfY - 15} L ${currentX + 25},${currentCsfY + 10} L ${currentX + 20},${currentCsfY + 5} M ${currentX + 25},${currentCsfY + 10} L ${currentX + 30},${currentCsfY + 5}`}
                    stroke="#3b82f6"
                    strokeWidth={2}
                    fill="none"
                  />
                  <text
                    x={currentX + 25}
                    y={currentCsfY - 25}
                    fontSize={8}
                    fill="#3b82f6"
                    textAnchor="middle"
                    fontWeight="600"
                  >
                    CSF ↓
                  </text>
                </g>
              )}

              {/* Inverse relationship arrows when CSF is high */}
              {csfVolume > 0.6 && (
                <g opacity={0.7}>
                  {/* CSF up arrow */}
                  <path
                    d={`M ${currentX - 25},${currentCsfY + 15} L ${currentX - 25},${currentCsfY - 10} L ${currentX - 30},${currentCsfY - 5} M ${currentX - 25},${currentCsfY - 10} L ${currentX - 20},${currentCsfY - 5}`}
                    stroke="#3b82f6"
                    strokeWidth={2}
                    fill="none"
                  />
                  <text
                    x={currentX - 25}
                    y={currentCsfY + 30}
                    fontSize={8}
                    fill="#3b82f6"
                    textAnchor="middle"
                    fontWeight="600"
                  >
                    CSF ↑
                  </text>

                  {/* Blood down arrow */}
                  <path
                    d={`M ${currentX + 25},${currentBloodY - 15} L ${currentX + 25},${currentBloodY + 10} L ${currentX + 20},${currentBloodY + 5} M ${currentX + 25},${currentBloodY + 10} L ${currentX + 30},${currentBloodY + 5}`}
                    stroke="#f59e0b"
                    strokeWidth={2}
                    fill="none"
                  />
                  <text
                    x={currentX + 25}
                    y={currentBloodY - 25}
                    fontSize={8}
                    fill="#f59e0b"
                    textAnchor="middle"
                    fontWeight="600"
                  >
                    Blood ↓
                  </text>
                </g>
              )}
            </>
          )}


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
            label="Volume (relative)"
            labelOffset={55}
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
        <div className="flex items-center gap-2 mb-2">
          <div className="w-4 h-2 rounded bg-orange-500"></div>
          <span className="opacity-70">Blood volume</span>
        </div>
        <div className="flex items-center gap-2 mb-2">
          <div className="w-4 h-2 rounded bg-blue-500"></div>
          <span className="opacity-70">CSF volume</span>
        </div>
        {showInverseIndicators && (
          <div className="mt-3 p-2 rounded border" style={{
            backgroundColor: "rgba(251, 180, 78, 0.08)",
            borderColor: "rgba(251, 180, 78, 0.3)"
          }}>
            <div className="text-[10px] font-semibold mb-1" style={{ color: "var(--color-golden-yellow)" }}>
              Inverse Phase
            </div>
            <div className="text-[9px] opacity-70">
              Blood ↑ = CSF ↓
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
