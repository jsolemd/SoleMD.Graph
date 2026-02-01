"use client";

import React, { useMemo } from "react";
import { scaleLinear } from "@visx/scale";
import { LinePath } from "@visx/shape";
import { curveMonotoneX } from "@visx/curve";
import { Group } from "@visx/group";
import { AxisLeft, AxisBottom } from "@visx/axis";
import { GridRows } from "@visx/grid";
import { LinearGradient } from "@visx/gradient";
import { Sun, Moon, Coffee } from "lucide-react";

interface ProcessDataPoint {
  time: number; // Hours (0-24)
  processS: number; // Homeostatic pressure (0-100)
  processC: number; // Circadian gate (-1 to 1, normalized)
  combined: number; // Sleep propensity
  melatonin: number; // Melatonin levels (0-100)
  orexin: number; // Orexin/hypocretin levels (0-100)
}

type Section1EventType = "milestone" | "flip";

interface Section1EventAnnotation {
  id: string;
  time: number;
  label: string;
  description: string;
  type: Section1EventType;
  labelAnchor: "start" | "end";
  labelDy: number;
  labelOffsetX?: number;
}

interface Section1EventWithData extends Section1EventAnnotation {
  dataPoint: ProcessDataPoint;
  displayTime: number;
}

interface ProcessGraphProps {
  width?: number;
  height?: number;
  currentTime?: number; // Current time in the animation (0-24)
  showCaffeine?: boolean;
  margin?: { top: number; right: number; bottom: number; left: number };
  processS?: number; // Optional override for Process S level
  processC?: number; // Optional override for Process C level
  animated?: boolean; // Whether to show animated timeline progression
}

// Generate 24-hour cycle data
const generateProcessData = (): ProcessDataPoint[] => {
  const data: ProcessDataPoint[] = [];

  for (let hour = 0; hour <= 24; hour += 0.5) {
    // Process S: Homeostatic sleep pressure (adenosine accumulation)
    // Low after sleep, rises during wake, high at bedtime
    let processS: number;
    if (hour >= 7 && hour < 23) {
      // Wake period (7am-11pm): exponential rise from ~8% to ~85%
      const wakeHours = hour - 7;
      processS = 8 + 77 * (1 - Math.exp(-0.15 * wakeHours));
    } else {
      // Sleep period (11pm-7am): exponential decay from ~85% to ~8%
      let sleepHours: number;
      if (hour >= 23) {
        sleepHours = hour - 23; // 23:00 to 24:00
      } else {
        sleepHours = hour + 1; // 0:00 to 7:00 (adding 1 hour from 23:00)
      }
      processS = 85 * Math.exp(-0.25 * sleepHours) + 5;
    }

    // Process C: Circadian alerting signal
    // Trough around 3-5am when the circadian sleep gate opens; evening boost keeps us alert near habitual bedtime
    const circadianBase = Math.sin((hour - 10) * (Math.PI / 12));
    const eveningBoost = 0.3 * Math.exp(-Math.pow((hour - 20) / 2.2, 2));
    const rawProcessC = circadianBase + eveningBoost;
    const processC = Math.max(-1, Math.min(1, rawProcessC));

    // Combined sleep propensity
    // High when S is high AND C is low (nighttime = sleepy)
    // Low when S is low OR C is high (daytime = alert)
    const combined = processS * (1 - processC * 0.4);

    // Melatonin: Low during day, rises ~8pm, peaks ~2-4am, decreases by morning
    // Suppressed by light, peaks during darkness
    let melatonin: number;
    if (hour >= 20 || hour <= 6) {
      // Night period (8pm to 6am): high melatonin
      const nightHour = hour >= 20 ? hour - 20 : hour + 4; // 0-10 scale
      const peakHour = 6; // Peak at ~2am (20 + 6 = 26 or 2am)
      melatonin = 85 * Math.exp(-Math.pow((nightHour - peakHour) / 3.5, 2)) + 10;
    } else {
      // Day period (6am to 8pm): low melatonin with slight rise toward evening
      const dayProgress = (hour - 6) / 14; // 0 to 1 from 6am to 8pm
      melatonin = 5 + 10 * dayProgress;
    }

    // Orexin: High during wake, low during sleep
    // Tracks wakefulness and arousal, inhibited during sleep
    let orexin: number;
    if (hour >= 7 && hour < 23) {
      // Wake period (7am-11pm): high orexin with slight dip post-lunch
      const wakeHour = hour - 7;
      const postLunchDip = hour >= 13 && hour <= 15 ? 10 : 0;
      orexin = 75 - postLunchDip + 15 * Math.sin((wakeHour / 16) * Math.PI);
    } else {
      // Sleep period (11pm-7am): low orexin
      orexin = 15 + 10 * Math.random(); // Low with slight variability
    }

    data.push({
      time: hour,
      processS,
      processC,
      combined,
      melatonin,
      orexin,
    });
  }

  return data;
};

// Scripted Section 1 narrative anchor points for Process S/C graph
const SECTION1_EVENT_ANNOTATIONS: Section1EventAnnotation[] = [
  {
    id: "sleep-flip-22",
    time: 22,
    label: "10 PM - Flip to sleep",
    description: "Process S peaks while the circadian gate opens",
    type: "flip",
    labelAnchor: "start",
    labelDy: -24,
    labelOffsetX: 14,
  },
  {
    id: "night-maintenance-02",
    time: 2,
    label: "2 AM - Night maintenance",
    description: "Sleep pressure unloads while Process C holds the gate open",
    type: "milestone",
    labelAnchor: "start",
    labelDy: 32,
    labelOffsetX: 14,
  },
  {
    id: "wake-flip-07",
    time: 7,
    label: "7 AM - Flip back to wake",
    description: "Day shift baseline—wake systems hold steady at dawn and relight after sleep",
    type: "flip",
    labelAnchor: "end",
    labelDy: 30,
    labelOffsetX: 16,
  },
];

export default function ProcessGraph({
  width = 800,
  height = 400,
  currentTime = 12,
  showCaffeine = false,
  margin = { top: 40, right: 100, bottom: 60, left: 80 },
  processS,
  processC,
  animated = true,
}: ProcessGraphProps) {
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  const data = useMemo(() => generateProcessData(), []);

  const dataByTime = useMemo(() => {
    const map = new Map<number, ProcessDataPoint>();
    data.forEach((point) => {
      map.set(Number(point.time.toFixed(2)), point);
    });
    return map;
  }, [data]);

  // Reorder and filter data to flow from noon→midnight→noon (display order)
  const currentData = useMemo(() => {
    if (!animated) {
      // For static display, reorder to noon→midnight→noon, excluding duplicate midnight (time=24)
      const afternoonEvening = data.filter(d => d.time >= 12 && d.time < 24);
      const nightMorning = data.filter(d => d.time >= 0 && d.time < 12);
      return [...afternoonEvening, ...nightMorning];
    }

    // For animated display, filter based on currentTime and reorder
    if (currentTime >= 12) {
      // Currently in afternoon/evening (12pm - midnight)
      // Show only noon → currentTime
      return data.filter(d => d.time >= 12 && d.time <= currentTime);
    } else {
      // Currently in night/morning (midnight - noon)
      // Show full afternoon/evening + night/morning up to currentTime
      const afternoonEvening = data.filter(d => d.time >= 12 && d.time < 24);
      const nightMorning = data.filter(d => d.time >= 0 && d.time <= currentTime);
      return [...afternoonEvening, ...nightMorning];
    }
  }, [data, currentTime, animated]);

  // Current data point for highlighting - use only data values, not prop overrides
  const currentPoint = useMemo(() => {
    return currentData.reduce((prev, curr) =>
      Math.abs(curr.time - currentTime) < Math.abs(prev.time - currentTime) ? curr : prev
    );
  }, [currentData, currentTime]);

  // Transform data time (0-24) to display time (12-36)
  const getDisplayTime = (dataTime: number): number => {
    // 0-11 hours → 24-35 (midnight to 11am)
    // 12-23 hours → 12-23 (noon to 11pm)
    return dataTime < 12 ? dataTime + 24 : dataTime;
  };

  const section1Events = useMemo<Section1EventWithData[]>(() => {
    return SECTION1_EVENT_ANNOTATIONS
      .map((event) => {
        const point = dataByTime.get(Number(event.time.toFixed(2)));
        if (!point) {
          return null;
        }
        return {
          ...event,
          dataPoint: point,
          displayTime: getDisplayTime(event.time),
        } as Section1EventWithData;
      })
      .filter((event): event is Section1EventWithData => Boolean(event));
  }, [dataByTime]);

  const currentDisplayTime = getDisplayTime(currentTime);

  const visibleSection1Events = useMemo(() => {
    if (!animated) {
      return section1Events;
    }
    return section1Events.filter((event) => event.displayTime <= currentDisplayTime + 0.0001);
  }, [animated, currentDisplayTime, section1Events]);

  // Scales - shifted to start at 12pm (noon)
  const xScale = useMemo(
    () =>
      scaleLinear({
        domain: [12, 36], // 12pm today to 12pm tomorrow
        range: [0, innerWidth],
      }),
    [innerWidth]
  );

  const yScaleS = useMemo(
    () =>
      scaleLinear({
        domain: [0, 100],
        range: [innerHeight, 0],
        nice: true,
      }),
    [innerHeight]
  );

  const yScaleC = useMemo(
    () =>
      scaleLinear({
        domain: [-1.1, 1.1],
        range: [innerHeight, 0],
      }),
    [innerHeight]
  );

  const yScaleHormones = useMemo(
    () =>
      scaleLinear({
        domain: [0, 100],
        range: [innerHeight, 0],
        nice: true,
      }),
    [innerHeight]
  );

  // Time zones for background
  // Caffeine effect visualization
  const caffeineTime = 14; // 2 PM
  const caffeineEffect = showCaffeine && currentTime > caffeineTime;


  return (
    <div style={{ position: 'relative', width, height }}>

      <svg width={width} height={height}>
      <defs>
        {/* Night gradient */}
        <LinearGradient id="night-gradient" from="#1e3a8a" to="#3b82f6" />
      </defs>

      <Group left={margin.left} top={margin.top}>
        {/* Subtle night zones - very low opacity */}
        {/* Night zone: 10pm to 6am (22-30 on shifted scale) */}
        <rect
          x={xScale(22)}
          y={0}
          width={xScale(30) - xScale(22)}
          height={innerHeight}
          fill="url(#night-gradient)"
          fillOpacity={0.03}
        />

        {/* Grid lines */}
        <GridRows
          scale={yScaleS}
          width={innerWidth}
          strokeDasharray="2,4"
          stroke="#e5e7eb"
          strokeOpacity={0.3}
        />

        {/* Process S Line */}
        <LinePath
          data={currentData}
          x={(d) => xScale(getDisplayTime(d.time))}
          y={(d) => yScaleS(d.processS)}
          stroke="#3b82f6"
          strokeWidth={3}
          curve={curveMonotoneX}
        />

        {/* Process C Line */}
        <LinePath
          data={currentData}
          x={(d) => xScale(getDisplayTime(d.time))}
          y={(d) => yScaleC(d.processC)}
          stroke="#fbbf24"
          strokeWidth={2}
          curve={curveMonotoneX}
          strokeDasharray="4,2"
        />

        {/* Melatonin Line - subtle overlay */}
        <LinePath
          data={currentData}
          x={(d) => xScale(getDisplayTime(d.time))}
          y={(d) => yScaleHormones(d.melatonin)}
          stroke="#a78bfa"
          strokeWidth={1.5}
          strokeOpacity={0.4}
          curve={curveMonotoneX}
          strokeDasharray="6,3"
        />

        {/* Orexin Line - subtle overlay */}
        <LinePath
          data={currentData}
          x={(d) => xScale(getDisplayTime(d.time))}
          y={(d) => yScaleHormones(d.orexin)}
          stroke="#34d399"
          strokeWidth={1.5}
          strokeOpacity={0.4}
          curve={curveMonotoneX}
          strokeDasharray="6,3"
        />

        {/* Section 1 scripted timepoints */}
        {visibleSection1Events.map((event) => {
          const x = xScale(event.displayTime);
          const sY = yScaleS(event.dataPoint.processS);
          const cY = yScaleC(event.dataPoint.processC);
          const labelOffsetX = event.labelOffsetX ?? 12;
          const anchorMultiplier = event.labelAnchor === "start" ? 1 : -1;
          const labelX = x + anchorMultiplier * labelOffsetX;
          const labelY = sY + event.labelDy;
          const descriptionY = labelY + 13;

          return (
            <Group key={event.id}>
              {event.type === "flip" && (
                <>
                  <circle
                    cx={x}
                    cy={sY}
                    r={9}
                    fill="none"
                    stroke="#ef4444"
                    strokeWidth={1.5}
                    strokeDasharray="4,2"
                    strokeOpacity={0.8}
                  />
                  <circle
                    cx={x}
                    cy={cY}
                    r={7}
                    fill="none"
                    stroke="#ef4444"
                    strokeWidth={1.5}
                    strokeDasharray="4,2"
                    strokeOpacity={0.8}
                  />
                </>
              )}

              <circle
                cx={x}
                cy={sY}
                r={event.type === "flip" ? 6 : 5}
                fill="#3b82f6"
                stroke="#ffffff"
                strokeWidth={2}
              />

              <circle
                cx={x}
                cy={cY}
                r={event.type === "flip" ? 5 : 4}
                fill="#fbbf24"
                stroke="#ffffff"
                strokeWidth={2}
              />

              <text
                x={labelX}
                y={labelY}
                textAnchor={event.labelAnchor}
                fontSize={12}
                fontWeight={600}
                fill="var(--foreground)"
                opacity={0.95}
              >
                {event.label}
              </text>
              <text
                x={labelX}
                y={descriptionY}
                textAnchor={event.labelAnchor}
                fontSize={11}
                fill="var(--foreground)"
                opacity={0.65}
              >
                {event.description}
              </text>
            </Group>
          );
        })}

        {/* Caffeine intervention */}
        {caffeineEffect && (
          <Group>
            <line
              x1={xScale(caffeineTime)}
              x2={xScale(caffeineTime)}
              y1={0}
              y2={innerHeight}
              stroke="#f59e0b"
              strokeWidth={2}
              strokeDasharray="4,4"
            />
            <circle
              cx={xScale(caffeineTime)}
              cy={yScaleS(50)}
              r={6}
              fill="#f59e0b"
            />
            <text
              x={xScale(caffeineTime) + 10}
              y={yScaleS(50)}
              fontSize={12}
              fill="#f59e0b"
              alignmentBaseline="middle"
            >
              Caffeine blocks adenosine
            </text>
          </Group>
        )}

        {/* Current time indicator */}
        <line
          x1={xScale(getDisplayTime(currentTime))}
          x2={xScale(getDisplayTime(currentTime))}
          y1={-10}
          y2={innerHeight + 10}
          stroke="#ef4444"
          strokeWidth={3}
          strokeOpacity={0.8}
        />

        {/* Current time label badge */}
        <Group>
          {/* Background badge */}
          <rect
            x={xScale(getDisplayTime(currentTime)) - 28}
            y={-32}
            width={56}
            height={20}
            fill="rgba(239, 68, 68, 0.95)"
            rx={10}
            stroke="#ffffff"
            strokeWidth={1.5}
          />
          {/* Time text */}
          <text
            x={xScale(getDisplayTime(currentTime))}
            y={-18}
            fontSize={11}
            fontWeight="700"
            fill="#ffffff"
            textAnchor="middle"
            fontFamily="monospace"
          >
            {Math.floor(currentTime).toString().padStart(2, '0')}:{Math.floor((currentTime % 1) * 60).toString().padStart(2, '0')}
          </text>
        </Group>

        {/* Current point highlights */}
        {animated && (
          <Group>
            {/* Process S current point */}
            <circle
              cx={xScale(getDisplayTime(currentPoint.time))}
              cy={yScaleS(currentPoint.processS)}
              r={5}
              fill="#3b82f6"
              stroke="white"
              strokeWidth={2}
            />

            {/* Process C current point */}
            <circle
              cx={xScale(getDisplayTime(currentPoint.time))}
              cy={yScaleC(currentPoint.processC)}
              r={5}
              fill="#fbbf24"
              stroke="white"
              strokeWidth={2}
            />

            {/* Melatonin current point */}
            <circle
              cx={xScale(getDisplayTime(currentPoint.time))}
              cy={yScaleHormones(currentPoint.melatonin)}
              r={4}
              fill="#a78bfa"
              stroke="white"
              strokeWidth={1.5}
              opacity={0.7}
            />

            {/* Orexin current point */}
            <circle
              cx={xScale(getDisplayTime(currentPoint.time))}
              cy={yScaleHormones(currentPoint.orexin)}
              r={4}
              fill="#34d399"
              stroke="white"
              strokeWidth={1.5}
              opacity={0.7}
            />
          </Group>
        )}

        {/* Time markers */}
        <Group>
          {/* Wake time - 7am (display time = 31 after wrap) */}
          <circle cx={xScale(getDisplayTime(7))} cy={-15} r={12} fill="#fbbf24" />
          <Sun size={16} x={xScale(getDisplayTime(7)) - 8} y={-23} color="white" />

          {/* Sleep time - 11pm (display time = 23) */}
          <circle cx={xScale(getDisplayTime(23))} cy={-15} r={12} fill="#3b82f6" />
          <Moon size={16} x={xScale(getDisplayTime(23)) - 8} y={-23} color="white" />
        </Group>

        {/* Axes */}
        <AxisLeft
          scale={yScaleS}
          label="Process S (Sleep Pressure %)"
          labelOffset={50}
          stroke="#3b82f6"
          tickStroke="#3b82f6"
          tickLabelProps={() => ({
            fill: "#ffffff",
            fontSize: 11,
            textAnchor: "end",
          })}
          labelProps={{
            fill: "#ffffff",
            fontSize: 12,
            fontWeight: 600,
          }}
        />

        <AxisLeft
          scale={yScaleC}
          orientation="right"
          left={innerWidth}
          label="Process C: circadian alerting"
          labelOffset={50}
          stroke="#fbbf24"
          tickStroke="#fbbf24"
          tickLabelProps={() => ({
            fill: "#ffffff",
            fontSize: 11,
            textAnchor: "start",
          })}
          labelProps={{
            fill: "#ffffff",
            fontSize: 12,
            fontWeight: 600,
          }}
          tickValues={[-1, 0, 1]}
          tickFormat={(value) => {
            if (value > 0) return "Alerting";
            if (value < 0) return "Sleep gate";
            return "Neutral";
          }}
        />

        <AxisBottom
          scale={xScale}
          top={innerHeight}
          label="Time of Day (24h)"
          tickFormat={(value) => {
            const hour = value as number;
            if (hour === 12) return "12pm";
            if (hour === 24) return "12am";
            if (hour === 36) return "12pm";
            if (hour < 24) return `${hour - 12}pm`;
            return `${hour - 24}am`;
          }}
          tickValues={[12, 18, 24, 30, 36]}
          tickLabelProps={() => ({
            fill: "#ffffff",
            fontSize: 11,
          })}
          labelProps={{
            fill: "#ffffff",
            fontSize: 12,
            fontWeight: 600,
            dy: 30,
          }}
        />
      </Group>

      {/* Legend - Repositioned inside main area */}
      <Group left={margin.left + 10} top={margin.top - 25}>
        <rect x={0} y={9} width={18} height={2.5} fill="#3b82f6" />
        <text x={24} y={12} fontSize={10} alignmentBaseline="middle" fill="#ffffff" fontWeight="600">
          Process S
        </text>

        <rect x={115} y={9} width={18} height={2.5} fill="#facc15" />
        <text x={141} y={12} fontSize={10} alignmentBaseline="middle" fill="#ffffff" fontWeight="600">
          Process C
        </text>

        <rect x={225} y={9} width={18} height={1.5} fill="#a78bfa" opacity={0.4} />
        <text x={249} y={12} fontSize={9} alignmentBaseline="middle" fill="#d8b4fe" fontWeight="500">
          Melatonin
        </text>

        <rect x={325} y={9} width={18} height={1.5} fill="#34d399" opacity={0.4} />
        <text x={349} y={12} fontSize={9} alignmentBaseline="middle" fill="#6ee7b7" fontWeight="500">
          Orexin
        </text>

        {showCaffeine && (
          <>
            <Coffee size={12} x={410} y={5} color="#f59e0b" />
            <text x={427} y={11} fontSize={10} alignmentBaseline="middle" fill="#ffffff" fontWeight="600">
              Caffeine
            </text>
          </>
        )}
      </Group>
    </svg>
    </div>
  );
}
