"use client";

import React, { useMemo } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Group } from "@visx/group";
import { Line, Bar, LinePath, Area } from "@visx/shape";
import { GlyphCircle } from "@visx/glyph";
import { scaleLinear } from "@visx/scale";
import { curveStepAfter } from "@visx/curve";
import { LinearGradient } from "@visx/gradient";
import type { SleepStage } from "../shared/TimelineScrollOrchestrator";
import { getSleepStage, calculateProcessS, calculateProcessC } from "../shared/TimelineScrollOrchestrator";
import { calculateNTLevel, NEUROTRANSMITTER_SYSTEMS } from "./NeurotransmitterPanel";

/**
 * TimelineBrainNetwork Component
 *
 * Simplified brain network visualization that changes activation patterns
 * based on current time and sleep stage, following the script.md narrative.
 *
 * Features:
 * - Time-based neurotransmitter system activation
 * - Sleep stage-specific network states
 * - Smooth transitions between states
 * - Anatomical layer organization
 */

interface BrainRegion {
  id: string;
  name: string;
  abbreviation: string;
  neurotransmitter?: string;
  x: number;
  y: number;
  size: number;
  layer: 'cortex' | 'thalamus' | 'hypothalamus' | 'brainstem';
  color: string;
  wakefulnessRole: 'arousal' | 'stabilizer' | 'switch' | 'gate' | 'clock';
}

interface NetworkConnection {
  from: string;
  to: string;
  type: 'ascending' | 'inhibitory' | 'stabilizing' | 'gating';
  strength: number;
}

interface TimelineBrainNetworkProps {
  currentTime: number;
  sleepStage: SleepStage;
  processS: number;
  processC: number;
  width?: number;
  height?: number;
}

const BASE_WIDTH = 640;
const BASE_HEIGHT = 680;

const LAYER_LAYOUT = {
  cortex: { y: 30, height: 130 },
  thalamus: { y: 175, height: 130 },
  hypothalamus: { y: 320, height: 180 },
  brainstem: { y: 515, height: 165 },
} as const;

const BRAIN_REGIONS: BrainRegion[] = [
  // Cortex - centered at top
  { id: 'ctx', name: 'Cerebral Cortex', abbreviation: 'CTX', x: 320, y: LAYER_LAYOUT.cortex.y + 50, size: 32, layer: 'cortex', color: '#67e8f9', wakefulnessRole: 'arousal' },

  // Thalamus - central relay with gating on right
  { id: 'thal', name: 'Thalamus', abbreviation: 'THAL', x: 320, y: LAYER_LAYOUT.thalamus.y + 55, size: 28, layer: 'thalamus', color: '#c4b5fd', wakefulnessRole: 'gate' },
  { id: 'trn', name: 'Thalamic Reticular Nucleus', abbreviation: 'TRN', x: 480, y: LAYER_LAYOUT.thalamus.y + 55, size: 22, layer: 'thalamus', color: '#6b7280', wakefulnessRole: 'gate' },

  // Hypothalamus - functional layout: sleep (left) ← → stabilizer (center) → wake (right)
  { id: 'vlpo', name: 'VLPO', abbreviation: 'VLPO', neurotransmitter: 'GABA', x: 160, y: LAYER_LAYOUT.hypothalamus.y + 70, size: 24, layer: 'hypothalamus', color: '#3b82f6', wakefulnessRole: 'switch' },
  { id: 'orx', name: 'Orexin Neurons', abbreviation: 'ORX', neurotransmitter: 'Orexin', x: 320, y: LAYER_LAYOUT.hypothalamus.y + 70, size: 26, layer: 'hypothalamus', color: '#a78bfa', wakefulnessRole: 'stabilizer' },
  { id: 'tmn', name: 'Tuberomammillary Nucleus', abbreviation: 'TMN', neurotransmitter: 'Histamine', x: 480, y: LAYER_LAYOUT.hypothalamus.y + 70, size: 22, layer: 'hypothalamus', color: '#8b5cf6', wakefulnessRole: 'arousal' },

  // Brainstem - ascending arousal centers in clear vertical alignment
  { id: 'dr', name: 'Dorsal Raphe', abbreviation: 'DR', neurotransmitter: 'Serotonin', x: 220, y: LAYER_LAYOUT.brainstem.y + 70, size: 22, layer: 'brainstem', color: '#ef4444', wakefulnessRole: 'arousal' },
  { id: 'lc', name: 'Locus Coeruleus', abbreviation: 'LC', neurotransmitter: 'Norepinephrine', x: 320, y: LAYER_LAYOUT.brainstem.y + 70, size: 22, layer: 'brainstem', color: '#f59e0b', wakefulnessRole: 'arousal' },
  { id: 'ppt', name: 'Pedunculopontine Tegmentum', abbreviation: 'PPT', neurotransmitter: 'Acetylcholine', x: 420, y: LAYER_LAYOUT.brainstem.y + 70, size: 20, layer: 'brainstem', color: '#10b981', wakefulnessRole: 'arousal' },
  { id: 'vta', name: 'Ventral Tegmental Area', abbreviation: 'VTA', neurotransmitter: 'Dopamine', x: 520, y: LAYER_LAYOUT.brainstem.y + 70, size: 22, layer: 'brainstem', color: '#ec4899', wakefulnessRole: 'arousal' },
];

const CONNECTIONS: NetworkConnection[] = [
  // Ascending arousal pathways
  { from: 'lc', to: 'thal', type: 'ascending', strength: 1 },
  { from: 'dr', to: 'thal', type: 'ascending', strength: 1 },
  { from: 'vta', to: 'thal', type: 'ascending', strength: 1 },
  { from: 'ppt', to: 'thal', type: 'ascending', strength: 1 },
  { from: 'tmn', to: 'ctx', type: 'ascending', strength: 1 },
  { from: 'thal', to: 'ctx', type: 'ascending', strength: 1 },

  // Orexin stabilization
  { from: 'orx', to: 'lc', type: 'stabilizing', strength: 0.8 },
  { from: 'orx', to: 'dr', type: 'stabilizing', strength: 0.8 },
  { from: 'orx', to: 'vta', type: 'stabilizing', strength: 0.8 },
  { from: 'orx', to: 'tmn', type: 'stabilizing', strength: 0.8 },

  // VLPO inhibition (flip-flop)
  { from: 'vlpo', to: 'lc', type: 'inhibitory', strength: 1 },
  { from: 'vlpo', to: 'dr', type: 'inhibitory', strength: 1 },
  { from: 'vlpo', to: 'tmn', type: 'inhibitory', strength: 1 },
  { from: 'vlpo', to: 'orx', type: 'inhibitory', strength: 1 },

  // TRN gating
  { from: 'trn', to: 'thal', type: 'gating', strength: 0.8 },
];

const LAYER_TINTS: Record<BrainRegion['layer'], string> = {
  cortex: 'var(--layer-cortex-tint, hsla(215, 85%, 78%, 0.08))',
  thalamus: 'var(--layer-thalamus-tint, hsla(260, 54%, 74%, 0.08))',
  hypothalamus: 'var(--layer-hypothalamus-tint, hsla(280, 62%, 72%, 0.08))',
  brainstem: 'var(--layer-brainstem-tint, hsla(32, 96%, 70%, 0.08))',
};

const LAYER_OUTLINE_COLORS: Record<BrainRegion['layer'], string> = {
  cortex: 'var(--layer-cortex-outline, hsla(215, 80%, 70%, 0.28))',
  thalamus: 'var(--layer-thalamus-outline, hsla(260, 40%, 68%, 0.25))',
  hypothalamus: 'var(--layer-hypothalamus-outline, hsla(280, 45%, 65%, 0.25))',
  brainstem: 'var(--layer-brainstem-outline, hsla(32, 80%, 62%, 0.25))',
};

const LAYER_LABEL_COLORS: Record<BrainRegion['layer'], string> = {
  cortex: 'var(--layer-cortex-label, hsla(215, 80%, 80%, 0.9))',
  thalamus: 'var(--layer-thalamus-label, hsla(260, 55%, 78%, 0.9))',
  hypothalamus: 'var(--layer-hypothalamus-label, hsla(280, 58%, 76%, 0.9))',
  brainstem: 'var(--layer-brainstem-label, hsla(32, 85%, 72%, 0.9))',
};

const ROLE_RING_COLORS: Record<BrainRegion['wakefulnessRole'], string> = {
  arousal: 'var(--role-arousal, #f59e0b)',
  stabilizer: 'var(--role-stabilizer, #c084fc)',
  switch: 'var(--role-switch, #38bdf8)',
  gate: 'var(--role-gate, #94a3b8)',
  clock: 'var(--role-clock, #22d3ee)',
};

const ROLE_LABELS: Record<BrainRegion['wakefulnessRole'], string> = {
  arousal: 'Wake drivers',
  stabilizer: 'Wake stabilizer',
  switch: 'Sleep switch',
  gate: 'Sleep gate',
  clock: 'Clock cue',
};

/**
 * Map brain regions to neurotransmitter systems
 */
const REGION_TO_NT_MAP: Record<string, string> = {
  vlpo: 'gaba',
  orx: 'orexin',
  tmn: 'histamine',
  lc: 'norepinephrine',
  dr: 'serotonin',
  ppt: 'acetylcholine',
  vta: 'dopamine',
  // Regions without specific NT systems get default behavior
};

/**
 * Calculate region activation using neurotransmitter panel values
 */
const getRegionActivation = (
  region: BrainRegion,
  sleepStage: SleepStage,
  processS: number,
  processC: number,
  currentTime: number
): number => {
  // If region has a mapped neurotransmitter, use its calculated level
  const ntId = REGION_TO_NT_MAP[region.id];
  if (ntId) {
    const ntSystem = NEUROTRANSMITTER_SYSTEMS.find(s => s.id === ntId);
    if (ntSystem) {
      return calculateNTLevel(ntSystem, currentTime, sleepStage, processS, processC);
    }
  }

  // Fallback for unmapped regions (cortex, thalamus, trn)
  const baseActivation = (() => {
    switch (sleepStage) {
      case 'wake':
        return region.wakefulnessRole === 'arousal' || region.wakefulnessRole === 'stabilizer' ? 0.9 : 0.3;
      case 'drowsy':
        return region.wakefulnessRole === 'arousal' ? 0.6 : region.wakefulnessRole === 'switch' ? 0.5 : 0.4;
      case 'n1':
        // N1: Light sleep onset - arousal systems declining, gates becoming active
        return region.wakefulnessRole === 'arousal' ? 0.35 :
               region.wakefulnessRole === 'switch' || region.wakefulnessRole === 'gate' ? 0.6 : 0.3;
      case 'n2':
        // N2: Established NREM - arousal systems quiet, gates fully active
        return region.wakefulnessRole === 'switch' || region.wakefulnessRole === 'gate' ? 0.8 : 0.2;
      case 'n3':
        return region.wakefulnessRole === 'switch' || region.wakefulnessRole === 'gate' ? 0.9 : 0.1;
      case 'rem':
        return region.id === 'ppt' || region.layer === 'cortex' ? 0.8 : 0.3;
      default:
        return 0.5;
    }
  })();

  const sModulation = region.wakefulnessRole === 'switch' ? processS / 100 : 1 - (processS / 200);
  const cModulation = 1 + (processC * 0.2);

  return Math.max(0.1, Math.min(1, baseActivation * sModulation * cModulation));
};

/**
 * Get connection opacity based on activation states
 */
const getConnectionOpacity = (
  connection: NetworkConnection,
  fromActivation: number,
  toActivation: number,
  sleepStage: SleepStage
): number => {
  const baseOpacity = (() => {
    switch (connection.type) {
      case 'ascending':
        return sleepStage === 'wake' ? 0.8 : 0.2;
      case 'inhibitory':
        // Boost inhibitory connections when source is highly active (e.g., VLPO during sleep)
        return sleepStage === 'wake' ? 0.2 : fromActivation > 0.7 ? 0.95 : 0.8;
      case 'stabilizing':
        return sleepStage === 'wake' ? 0.6 : 0.1;
      case 'gating':
        return sleepStage === 'wake' ? 0.3 : 0.7;
      default:
        return 0.5;
    }
  })();

  // For inhibitory connections, brightness depends on SOURCE activation (the inhibitor)
  // For other connections, use the minimum (both need to be active)
  if (connection.type === 'inhibitory') {
    return baseOpacity * fromActivation;
  } else {
    return baseOpacity * Math.min(fromActivation, toActivation);
  }
};

// Sleep depth mapping for hypnogram visualization
const SLEEP_DEPTH: Record<SleepStage, number> = {
  wake: 0,
  drowsy: 0.5, // not used but kept for type compatibility
  n1: 1.5,
  n2: 2.5,
  n3: 4,
  rem: 1.0, // REM at shallow depth (paradoxical sleep, similar arousal threshold to N1)
};

export default function TimelineBrainNetwork({
  currentTime,
  sleepStage,
  processS,
  processC,
  width = 620,
  height = 580,
}: TimelineBrainNetworkProps) {
  // Guard against invalid dimensions (e.g., 0 during initial render)
  const safeWidth = width > 0 ? width : 620;
  const safeHeight = height > 0 ? height : 580;

  // Calculate scaling factors for responsive coordinates
  const scaleX = safeWidth / BASE_WIDTH;
  const scaleY = safeHeight / BASE_HEIGHT;

  // Ensure minimum font scale for readability
  const fontScale = Math.max(Math.min(scaleX, scaleY), 0.75);
  const reducedMotion = useReducedMotion();
  const minScale = Math.min(scaleX, scaleY);

  // Calculate activation levels for all regions
  const regionActivations = useMemo(() => {
    return BRAIN_REGIONS.reduce((acc, region) => {
      acc[region.id] = getRegionActivation(region, sleepStage, processS, processC, currentTime);
      return acc;
    }, {} as Record<string, number>);
  }, [sleepStage, processS, processC, currentTime]);

  // Get gradient colors based on current time
  const getGradientColors = () => {
    if (currentTime >= 7 && currentTime < 12) {
      return { start: "var(--color-golden-yellow)", end: "var(--color-innovation-500)" };
    } else if (currentTime >= 12 && currentTime < 18) {
      return { start: "var(--color-innovation-500)", end: "var(--color-warm-coral)" };
    } else if (currentTime >= 18 && currentTime < 22) {
      return { start: "var(--color-warm-coral)", end: "var(--color-soft-blue)" };
    } else {
      return { start: "var(--color-soft-blue)", end: "var(--color-soft-lavender)" };
    }
  };

  const gradientColors = getGradientColors();

  // Generate realistic sleep stage progression sampled every 30 minutes (10pm → 6am)
  const timelinePoints = useMemo(() => {
    const points: { clock: number; stage: SleepStage }[] = [];
    for (let hour = 22; hour <= 30; hour += 0.5) {
      const normalizedHour = hour >= 24 ? hour - 24 : hour;
      const stage = getSleepStage(normalizedHour, calculateProcessS(normalizedHour), calculateProcessC(normalizedHour));
      points.push({ clock: hour, stage });
    }
    return points;
  }, []);

  const sleepTimelineStart = timelinePoints[0]?.clock ?? 22;
  const sleepTimelineEnd = timelinePoints.length ? timelinePoints[timelinePoints.length - 1].clock : sleepTimelineStart + 1;

  // Hypnogram dimensions - horizontal orientation (time→depth plot)
  const hypnogramWidth = 150;
  const hypnogramHeight = 160;
  const hypnogramMargin = { top: 10, right: 10, bottom: 20, left: 28 };

  // Time scale (X-axis) - map absolute clock hours (22→30) to chart width
  const timeScale = scaleLinear({
    domain: [sleepTimelineStart, sleepTimelineEnd],
    range: [hypnogramMargin.left, hypnogramWidth - hypnogramMargin.right],
  });

  // Depth scale (Y-axis) - inverted so Wake is at top, N3 at bottom
  const depthScale = scaleLinear({
    domain: [0, 4], // Wake=0 to N3=4
    range: [hypnogramMargin.top, hypnogramHeight - hypnogramMargin.bottom],
  });

  // Map sampled points onto hypnogram coordinates
  const hypnogramData = timelinePoints.map((point) => ({
    x: timeScale(point.clock),
    y: depthScale(SLEEP_DEPTH[point.stage]),
    stage: point.stage,
    clock: point.clock,
  }));

  // Translate current time into sleep timeline clock (keeps pointer monotonic)
  const sleepClock = (() => {
    let clock = currentTime;
    if (clock < sleepTimelineStart) {
      // After midnight but before noon → add 24h to stay on timeline; otherwise clamp to start
      clock = clock <= 12 ? clock + 24 : sleepTimelineStart;
    }
    if (clock > sleepTimelineEnd) {
      clock = sleepTimelineEnd;
    }
    return Math.max(sleepTimelineStart, Math.min(clock, sleepTimelineEnd));
  })();

  // Find latest hypnogram point at or before current sleep clock
  const currentPointIndex = (() => {
    if (!hypnogramData.length) return -1;
    let idx = 0;
    for (let i = 0; i < hypnogramData.length; i += 1) {
      if (sleepClock >= hypnogramData[i].clock) {
        idx = i;
      } else {
        break;
      }
    }
    return idx;
  })();

  return (
    <div className="relative flex items-center justify-center h-full">
      {/* Brain Network SVG */}
      <div className="w-full flex items-center justify-center">
        <svg width={safeWidth} height={safeHeight} viewBox={`0 0 ${safeWidth} ${safeHeight}`} preserveAspectRatio="xMidYMid meet">
          <Group>
            {/* Anatomical layers */}
            <Bar
              x={40 * scaleX}
              y={LAYER_LAYOUT.cortex.y * scaleY}
              width={560 * scaleX}
              height={LAYER_LAYOUT.cortex.height * scaleY}
              fill={LAYER_TINTS.cortex}
              stroke={LAYER_OUTLINE_COLORS.cortex}
              strokeWidth={minScale}
              rx={14 * minScale}
            />
            <text x={50 * scaleX} y={(LAYER_LAYOUT.cortex.y + 20) * scaleY} fontSize={Math.max(10 * fontScale, 9)} fill={LAYER_LABEL_COLORS.cortex} fontWeight="600">CORTEX</text>

            <Bar
              x={40 * scaleX}
              y={LAYER_LAYOUT.thalamus.y * scaleY}
              width={560 * scaleX}
              height={LAYER_LAYOUT.thalamus.height * scaleY}
              fill={LAYER_TINTS.thalamus}
              stroke={LAYER_OUTLINE_COLORS.thalamus}
              strokeWidth={minScale}
              rx={14 * minScale}
            />
            <text x={50 * scaleX} y={(LAYER_LAYOUT.thalamus.y + 20) * scaleY} fontSize={Math.max(10 * fontScale, 9)} fill={LAYER_LABEL_COLORS.thalamus} fontWeight="600">THALAMUS</text>

            <Bar
              x={40 * scaleX}
              y={LAYER_LAYOUT.hypothalamus.y * scaleY}
              width={560 * scaleX}
              height={LAYER_LAYOUT.hypothalamus.height * scaleY}
              fill={LAYER_TINTS.hypothalamus}
              stroke={LAYER_OUTLINE_COLORS.hypothalamus}
              strokeWidth={minScale}
              rx={14 * minScale}
            />
            <text x={50 * scaleX} y={(LAYER_LAYOUT.hypothalamus.y + 20) * scaleY} fontSize={Math.max(10 * fontScale, 9)} fill={LAYER_LABEL_COLORS.hypothalamus} fontWeight="600">HYPOTHALAMUS</text>

            <Bar
              x={40 * scaleX}
              y={LAYER_LAYOUT.brainstem.y * scaleY}
              width={560 * scaleX}
              height={LAYER_LAYOUT.brainstem.height * scaleY}
              fill={LAYER_TINTS.brainstem}
              stroke={LAYER_OUTLINE_COLORS.brainstem}
              strokeWidth={minScale}
              rx={14 * minScale}
            />
            <text x={50 * scaleX} y={(LAYER_LAYOUT.brainstem.y + 20) * scaleY} fontSize={Math.max(10 * fontScale, 9)} fill={LAYER_LABEL_COLORS.brainstem} fontWeight="600">BRAINSTEM</text>

            {/* Connections */}
            {CONNECTIONS.map((connection, index) => {
              const fromRegion = BRAIN_REGIONS.find(r => r.id === connection.from);
              const toRegion = BRAIN_REGIONS.find(r => r.id === connection.to);

              if (!fromRegion || !toRegion) return null;

              const fromActivation = regionActivations[connection.from];
              const toActivation = regionActivations[connection.to];
              const opacity = getConnectionOpacity(connection, fromActivation, toActivation, sleepStage);

              const getStrokeDashArray = (type: NetworkConnection['type']) => {
                switch (type) {
                  case 'inhibitory':
                    return '6,2';
                  case 'stabilizing':
                    return '4,4';
                  case 'gating':
                    return '2,6';
                  default:
                    return undefined;
                }
              };

              // Use source neurotransmitter color for all connections
              const strokeColor = fromRegion.color;
              const dashPattern = getStrokeDashArray(connection.type);

              return (
                <Line
                  key={`${connection.from}-${connection.to}-${index}`}
                  from={{ x: fromRegion.x * scaleX, y: fromRegion.y * scaleY }}
                  to={{ x: toRegion.x * scaleX, y: toRegion.y * scaleY }}
                  stroke={strokeColor}
                  strokeWidth={2.5 * minScale}
                  strokeDasharray={dashPattern}
                  strokeOpacity={opacity}
                  pointerEvents="none"
                  style={{
                    transition: 'stroke-opacity 300ms ease, stroke-width 300ms ease',
                    filter: opacity > 0.6 ? `drop-shadow(0 0 6px ${strokeColor}55)` : 'none',
                  }}
                />
              );
            })}

            {/* Brain regions */}
            {BRAIN_REGIONS.map((region) => {
              const activation = regionActivations[region.id];
              const isActive = activation >= 0.65;
              const isTransition = activation >= 0.35 && activation < 0.65;
              const isDormant = activation < 0.35;
              const pulseRadius = region.size * minScale + (isActive ? 8 * minScale : isTransition ? 5 * minScale : 3 * minScale);
              const roleAccent = ROLE_RING_COLORS[region.wakefulnessRole] ?? region.color;
              const haloOpacity = isActive ? 0.55 : isTransition ? 0.32 : 0;
              const haloBlur = isActive ? `${roleAccent}60` : `${roleAccent}24`;
              const arcRadius = region.size * minScale + 12 * minScale;
              const trackStrokeWidth = 4.4 * minScale;
              const coreOpacity = Math.max(0.25, activation * 0.9);
              const coreStroke = isDormant ? 'var(--border)' : 'white';
              const arcRotation = `rotate(-90 ${region.x * scaleX} ${region.y * scaleY})`;

              return (
                <Group key={region.id}>
                  <title>{`${region.name} · ${ROLE_LABELS[region.wakefulnessRole]}`}</title>

                  {/* Activation halo */}
                  {!isDormant && (
                    <motion.circle
                      cx={region.x * scaleX}
                      cy={region.y * scaleY}
                      r={pulseRadius + (isActive ? 6 * minScale : 4 * minScale)}
                      fill="none"
                      stroke={region.color}
                      strokeWidth={isActive ? 1.6 * minScale : 1.2 * minScale}
                      animate={reducedMotion ? undefined : {
                        strokeOpacity: haloOpacity,
                        r: pulseRadius + (isActive ? 9 * minScale : 5 * minScale),
                      }}
                      initial={{ strokeOpacity: 0 }}
                      transition={{
                        duration: 1.8,
                        repeat: reducedMotion ? 0 : Infinity,
                        repeatType: "reverse",
                        ease: "easeInOut",
                        delay: (activation * 0.2) % 0.6,
                      }}
                      style={{ filter: `drop-shadow(0 0 12px ${haloBlur})`, pointerEvents: 'none' }}
                    />
                  )}

                  {/* Layer base */}
                  <GlyphCircle
                    top={region.y * scaleY}
                    left={region.x * scaleX}
                    radius={region.size * minScale}
                    fill={LAYER_TINTS[region.layer]}
                    stroke={LAYER_OUTLINE_COLORS[region.layer]}
                    strokeWidth={1.1 * minScale}
                    fillOpacity={isDormant ? 0.25 : 0.45}
                    style={{ transition: 'fill 300ms ease, stroke 300ms ease', pointerEvents: 'none' }}
                  />

                  {/* Activation track */}
                  <circle
                    cx={region.x * scaleX}
                    cy={region.y * scaleY}
                    r={arcRadius}
                    fill="none"
                    stroke={isDormant ? 'var(--border)' : `${region.color}22`}
                    strokeWidth={trackStrokeWidth}
                    strokeLinecap="round"
                    opacity={isDormant ? 0.2 : 0.5}
                    style={{ pointerEvents: 'none' }}
                  />

                  {/* Activation arc */}
                  {activation > 0.02 && (
                    <motion.circle
                      cx={region.x * scaleX}
                      cy={region.y * scaleY}
                      r={arcRadius}
                      fill="transparent"
                      stroke={region.color}
                      strokeWidth={trackStrokeWidth}
                      strokeLinecap="round"
                      pathLength={1}
                      strokeDasharray="1"
                      initial={{ strokeDashoffset: 1, strokeOpacity: 0 }}
                      animate={{
                        strokeDashoffset: 1 - activation,
                        strokeOpacity: isDormant ? 0.2 : 0.95,
                      }}
                      transition={{ duration: 0.6, ease: "easeOut" }}
                      style={{ pointerEvents: 'none' }}
                      transform={arcRotation}
                    />
                  )}

                  {/* NT core */}
                  <GlyphCircle
                    top={region.y * scaleY}
                    left={region.x * scaleX}
                    radius={Math.max(4.5 * minScale, region.size * minScale * 0.38)}
                    fill={region.color}
                    fillOpacity={coreOpacity}
                    stroke={coreStroke}
                    strokeWidth={1 * minScale}
                    style={{
                      filter: isActive ? `drop-shadow(0 0 8px ${region.color}77)` : isTransition ? `drop-shadow(0 0 4px ${region.color}33)` : 'none',
                      transition: 'opacity 300ms ease, filter 300ms ease',
                      opacity: 1,
                      pointerEvents: 'none',
                    }}
                  />

                  {/* Region label - moved outside the circle */}
                  <text
                    x={region.x * scaleX}
                    y={(region.y + arcRadius + 18) * scaleY}
                    textAnchor="middle"
                    fontSize={Math.max(10 * fontScale, 9)}
                    fontWeight="700"
                    fill="var(--foreground)"
                    opacity={isDormant ? 0.5 : isActive ? 1 : 0.8}
                  >
                    {region.abbreviation}
                  </text>

                  {/* Neurotransmitter label - moved further out */}
                  {region.neurotransmitter && (
                    <text
                      x={region.x * scaleX}
                      y={(region.y + arcRadius + 32) * scaleY}
                      textAnchor="middle"
                      fontSize={Math.max(8 * fontScale, 7)}
                      fill={isDormant ? 'var(--foreground)' : region.color}
                      opacity={isDormant ? 0.4 : 0.5 + activation * 0.4}
                      fontWeight="500"
                    >
                      {activation > 0.4
                        ? region.neurotransmitter
                        : 'Dormant'}
                    </text>
                  )}
                </Group>
              );
            })}
          </Group>
        </svg>
      </div>

    </div>
  );
}
