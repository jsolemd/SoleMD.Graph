'use client';

import React from 'react';
import { LinePath, AreaClosed } from '@visx/shape';
import { scaleLinear } from '@visx/scale';
import { LinearGradient } from '@visx/gradient';
import { curveMonotoneX } from '@visx/curve';

interface SparklineProps {
  data: number[];
  width: number;
  height: number;
  color?: string;
  strokeWidth?: number;
}

export function Sparkline({
  data,
  width,
  height,
  color = '#3B82F6',
  strokeWidth = 2
}: SparklineProps) {
  if (!data || data.length === 0) return null;

  const strokeColor = typeof color === 'string' ? color : '#3B82F6';

  const xScale = scaleLinear({
    domain: [0, data.length - 1],
    range: [0, width]
  });

  const yScale = scaleLinear({
    domain: [Math.min(...data), Math.max(...data)],
    range: [height, 0]
  });

  const sparklineData = data.map((value, index) => ({
    x: xScale(index) ?? 0,
    y: yScale(value) ?? 0
  }));

  return (
    <svg width={width} height={height}>
      <LinePath
        data={sparklineData}
        x={d => d.x}
        y={d => d.y}
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        curve={curveMonotoneX}
        opacity={0.8}
      />
    </svg>
  );
}

interface AreaSparklineProps extends SparklineProps {
  gradientId?: string;
}

export function AreaSparkline({
  data,
  width,
  height,
  color = '#3B82F6',
  gradientId = 'sparkline-gradient'
}: AreaSparklineProps) {
  if (!data || data.length === 0) return null;

  const strokeColor = typeof color === 'string' ? color : '#3B82F6';

  const xScale = scaleLinear({
    domain: [0, data.length - 1],
    range: [0, width]
  });

  const yScale = scaleLinear({
    domain: [Math.min(...data), Math.max(...data)],
    range: [height, 0]
  });

  const sparklineData = data.map((value, index) => ({
    x: xScale(index) ?? 0,
    y: yScale(value) ?? 0
  }));

  return (
    <svg width={width} height={height}>
      <LinearGradient
        id={gradientId}
        from={strokeColor}
        to={strokeColor}
        fromOpacity={0.3}
        toOpacity={0.05}
      />
      <AreaClosed
        data={sparklineData}
        x={d => d.x}
        y={d => d.y}
        yScale={yScale}
        fill={`url(#${gradientId})`}
        curve={curveMonotoneX}
      />
      <LinePath
        data={sparklineData}
        x={d => d.x}
        y={d => d.y}
        stroke={strokeColor}
        strokeWidth={1.5}
        curve={curveMonotoneX}
        opacity={0.9}
      />
    </svg>
  );
}

interface ProgressArcProps {
  value: number; // 0-100
  width: number;
  height: number;
  color?: string;
  backgroundColor?: string;
  strokeWidth?: number;
}

export function ProgressArc({
  value,
  width,
  height,
  color = '#3B82F6',
  backgroundColor = '#E5E7EB',
  strokeWidth = 6
}: ProgressArcProps) {
  const strokeColor = typeof color === 'string' ? color : '#3B82F6';
  const backgroundStrokeColor = typeof backgroundColor === 'string' ? backgroundColor : '#E5E7EB';
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(width, height) / 2 - strokeWidth;

  const startAngle = -Math.PI / 2; // Start at top
  const endAngle = startAngle + (2 * Math.PI * (value / 100));

  const backgroundPath = describeArc(centerX, centerY, radius, startAngle, startAngle + 2 * Math.PI);
  const progressPath = describeArc(centerX, centerY, radius, startAngle, endAngle);

  return (
    <svg width={width} height={height}>
      <LinearGradient
        id="progress-gradient"
        from={strokeColor}
        to={strokeColor}
        fromOpacity={1}
        toOpacity={0.6}
      />
      {/* Background arc */}
      <path
        d={backgroundPath}
        fill="none"
        stroke={backgroundStrokeColor}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      {/* Progress arc */}
      <path
        d={progressPath}
        fill="none"
        stroke="url(#progress-gradient)"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      {/* Center text */}
      <text
        x={centerX}
        y={centerY}
        textAnchor="middle"
        dominantBaseline="middle"
        className="text-sm font-semibold fill-gray-700"
      >
        {Math.round(value)}
      </text>
    </svg>
  );
}

function describeArc(x: number, y: number, radius: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(x, y, radius, endAngle);
  const end = polarToCartesian(x, y, radius, startAngle);
  const largeArcFlag = endAngle - startAngle <= Math.PI ? "0" : "1";

  return [
    "M", start.x, start.y,
    "A", radius, radius, 0, largeArcFlag, 0, end.x, end.y
  ].join(" ");
}

function polarToCartesian(centerX: number, centerY: number, radius: number, angleInRadians: number) {
  return {
    x: centerX + (radius * Math.cos(angleInRadians)),
    y: centerY + (radius * Math.sin(angleInRadians))
  };
}

interface RadialBarProps {
  baseline: number;
  intervention: number;
  width: number;
  height: number;
  baselineColor?: string;
  interventionColor?: string;
}

export function RadialBar({
  baseline,
  intervention,
  width,
  height,
  baselineColor = '#E5E7EB',
  interventionColor = '#10B981'
}: RadialBarProps) {
  const safeBaselineColor = typeof baselineColor === 'string' ? baselineColor : '#E5E7EB';
  const safeInterventionColor = typeof interventionColor === 'string' ? interventionColor : '#10B981';
  const centerX = width / 2;
  const centerY = height / 2;
  const maxRadius = Math.min(width, height) / 2 - 10;
  const innerRadius = maxRadius * 0.6;

  const baselineRadius = innerRadius + (maxRadius - innerRadius) * (baseline / 100);
  const interventionRadius = innerRadius + (maxRadius - innerRadius) * (intervention / 100);

  return (
    <svg width={width} height={height}>
      <LinearGradient
        id="baseline-gradient"
        from={safeBaselineColor}
        to={safeBaselineColor}
        fromOpacity={0.8}
        toOpacity={0.4}
      />
      <LinearGradient
        id="intervention-gradient"
        from={safeInterventionColor}
        to={safeInterventionColor}
        fromOpacity={0.9}
        toOpacity={0.6}
      />

      {/* Baseline circle */}
      <circle
        cx={centerX}
        cy={centerY}
        r={baselineRadius}
        fill="url(#baseline-gradient)"
        stroke={safeBaselineColor}
        strokeWidth={2}
        opacity={0.7}
      />

      {/* Intervention circle */}
      <circle
        cx={centerX}
        cy={centerY}
        r={interventionRadius}
        fill="none"
        stroke="url(#intervention-gradient)"
        strokeWidth={3}
        strokeDasharray="4 2"
      />

      {/* Labels */}
      <text
        x={centerX}
        y={centerY - 8}
        textAnchor="middle"
        className="text-xs font-medium fill-gray-600"
      >
        Baseline
      </text>
      <text
        x={centerX}
        y={centerY + 8}
        textAnchor="middle"
        className="text-xs font-semibold fill-gray-800"
      >
        {Math.round(intervention)}%
      </text>
    </svg>
  );
}

interface TimelineChipsProps {
  timePoints: Array<{ time: string; value: number }>;
  width: number;
  height: number;
  color?: string;
}

export function TimelineChips({
  timePoints,
  width,
  height,
  color = '#3B82F6'
}: TimelineChipsProps) {
  if (!timePoints || timePoints.length === 0) return null;

  const xScale = scaleLinear({
    domain: [0, timePoints.length - 1],
    range: [20, width - 20]
  });

  const yScale = scaleLinear({
    domain: [0, Math.max(...timePoints.map(d => d.value))],
    range: [height - 20, 20]
  });

  return (
    <svg width={width} height={height}>
      <LinearGradient
        id="timeline-gradient"
        from={color}
        to={color}
        fromOpacity={0.2}
        toOpacity={0.05}
      />

      {/* Area under curve */}
      <AreaClosed
        data={timePoints.map((d, i) => ({
          x: xScale(i) ?? 0,
          y: yScale(d.value) ?? 0
        }))}
        x={d => d.x}
        y={d => d.y}
        yScale={yScale}
        fill="url(#timeline-gradient)"
        curve={curveMonotoneX}
      />

      {/* Data points */}
      {timePoints.map((point, index) => (
        <g key={index}>
          <circle
            cx={xScale(index)}
            cy={yScale(point.value)}
            r={3}
            fill={color}
            stroke="white"
            strokeWidth={2}
          />
          <text
            x={xScale(index)}
            y={height - 5}
            textAnchor="middle"
            className="text-xs fill-gray-600"
          >
            {point.time}
          </text>
        </g>
      ))}
    </svg>
  );
}
