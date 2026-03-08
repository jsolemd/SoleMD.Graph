"use client";

import React, { useMemo } from "react";
import { motion, useReducedMotion } from "framer-motion";

const NE_CYCLE_PERIOD = 50;
const TOTAL_SEQUENCE_TIME = 150;

interface VasomotionCrossSectionCoronalProps {
  width: number;
  height: number;
  vesselDiameter: number;
  flowRate: number;
  time: number;
  cycleIndex: number;
  phase: string;
  wasteConcentration: number;
  csfVolume: number;
}

export default function VasomotionCrossSectionCoronal({
  width,
  height,
  vesselDiameter,
  flowRate,
  time,
  cycleIndex,
  phase,
  wasteConcentration,
  csfVolume,
}: VasomotionCrossSectionCoronalProps) {
  const showVessel = true; // Always show vessel
  const vesselOpacity = phase === "intro" ? 0.3 : 1; // Subtle in intro, full after
  const showFlow = true;
  const showWaste = phase === "flow-clearance";

  const prefersReducedMotion = useReducedMotion();

  // Horizontal vessel parameters - centered layout
  const vesselLength = width * 0.8;  // Wider vessel
  const startX = width * 0.1;  // Less padding, better centered
  const centerY = height / 2;
  const baseRadius = 35; // Base vessel radius
  const annotationX = Math.max(startX + 12, Math.min(startX + vesselLength - 24, width - 24));
  const csfFillOpacity = vesselOpacity * (0.25 + csfVolume * 0.5);

  const globalTime = cycleIndex * TOTAL_SEQUENCE_TIME + time;
  const cycleProgress = ((globalTime % NE_CYCLE_PERIOD) + NE_CYCLE_PERIOD) % NE_CYCLE_PERIOD / NE_CYCLE_PERIOD;
  const cycleRadians = cycleProgress * Math.PI * 2;
  const effectiveCycleShift = prefersReducedMotion ? 0 : cycleProgress;

  // Generate vessel sections along horizontal axis
  const vesselSections = useMemo(() => {
    const sections = [];
    const numSections = prefersReducedMotion ? 40 : 90;
    const waveCycles = prefersReducedMotion ? 3 : 4.5;
    const amplitude = 0.14 + flowRate * 0.12;

    for (let i = 0; i < numSections; i++) {
      const progress = i / (numSections - 1);
      const x = startX + progress * vesselLength;

      const wavePhase = (progress + effectiveCycleShift) % 1;
      const sinValue = Math.sin(wavePhase * Math.PI * 2 * waveCycles - Math.PI / 2);
      const constriction = 1 - amplitude * sinValue;
      const normalizedConstriction = Math.min(Math.max(constriction, 0.6), 1.35);

      const diameter = baseRadius * vesselDiameter * normalizedConstriction;

      sections.push({
        id: i,
        x,
        diameter,
        progress,
        wavePhase,
      });
    }

    return sections;
  }, [
    prefersReducedMotion,
    vesselDiameter,
    vesselLength,
    startX,
    effectiveCycleShift,
    flowRate,
    baseRadius,
  ]);

  const particleSeeds = useMemo(
    () =>
      Array.from({ length: 48 }, (_, i) => ({
        id: i,
        phaseOffset: i / 48,
        lane: i % 2 === 0 ? 1 : -1,
        depthJitter: 0.6 + Math.random() * 0.4,
        sizeBase: 2.1 + Math.random() * 1.4,
        opacityBase: 0.45 + Math.random() * 0.35,
        swayOffset: Math.random() * Math.PI * 2,
      })),
    []
  );

  const wasteSeeds = useMemo(
    () =>
      Array.from({ length: 28 }, (_, i) => ({
        id: i,
        phaseOffset: i / 28,
        lane: i % 2 === 0 ? 1 : -1,
        depthJitter: 0.4 + Math.random() * 0.5,
        sizeBase: 1.35 + Math.random() * 0.9,
        opacityBase: 0.35 + Math.random() * 0.4,
        swayOffset: Math.random() * Math.PI * 2,
      })),
    []
  );

  // CSF flow particles moving along vessel
  const csfParticles = useMemo(() => {
    if (!showFlow) return [];

    const baseSpeed = 0.08 + flowRate * 0.18;
    const globalCycles = globalTime / NE_CYCLE_PERIOD;
    const effectiveCycles = prefersReducedMotion ? 0 : globalCycles;

    return particleSeeds.map((seed) => {
      const rawProgress = seed.phaseOffset + effectiveCycles * baseSpeed;
      const progress = ((rawProgress % 1) + 1) % 1;
      const x = startX + progress * vesselLength;

      const sectionIndex = Math.min(
        Math.floor(progress * (vesselSections.length - 1)),
        vesselSections.length - 1
      );
      const section = vesselSections[sectionIndex] ?? vesselSections[vesselSections.length - 1];
      const vesselRadius = section?.diameter ?? baseRadius * vesselDiameter;
      const sectionWave = section?.wavePhase ?? 0;

      const sway = prefersReducedMotion ? 0 : Math.sin(cycleRadians * 1.2 + seed.swayOffset) * 6 * seed.depthJitter;
      const perivascularOffset = vesselRadius + 16 + seed.depthJitter * 18;

      const maxCSFDistance = 65;
      const unclampedY = centerY + seed.lane * (perivascularOffset + sway * 0.2);
      const y = seed.lane > 0
        ? Math.min(unclampedY, centerY + maxCSFDistance)
        : Math.max(unclampedY, centerY - maxCSFDistance);

      const vesselPulsation = Math.sin(sectionWave * Math.PI * 2);
      const zPulse = prefersReducedMotion ? 0 : Math.sin(cycleRadians * 0.9 + seed.phaseOffset * Math.PI * 2);
      const zScaleFactor = 0.7 + 0.6 * ((zPulse + 1) / 2);
      const zOpacityFactor = 0.6 + 0.4 * ((zPulse + 1) / 2);

      const size = (seed.sizeBase + Math.abs(vesselPulsation) * 1.1) * zScaleFactor;
      const opacity = (seed.opacityBase + Math.abs(vesselPulsation) * 0.25) * zOpacityFactor * (0.6 + flowRate * 0.4);

      return {
        id: seed.id,
        x,
        y,
        size,
        opacity,
      };
    });
  }, [
    showFlow,
    particleSeeds,
    prefersReducedMotion,
    flowRate,
    vesselSections,
    startX,
    vesselLength,
    centerY,
    baseRadius,
    vesselDiameter,
    cycleRadians,
    globalTime,
  ]);

  const wasteParticles = useMemo(() => {
    if (!showWaste) return [];

    const normalizedWaste = Math.max(Math.min((wasteConcentration - 0.2) / 0.8, 1), 0);
    if (normalizedWaste <= 0.02) {
      return [];
    }

    const baseSpeed = 0.06 + flowRate * 0.16;
    const globalCycles = globalTime / NE_CYCLE_PERIOD;
    const effectiveCycles = prefersReducedMotion ? 0 : globalCycles;

    return wasteSeeds
      .map((seed, index) => {
        const activity = Math.max(Math.min(normalizedWaste * wasteSeeds.length - index, 1), 0);
        if (activity <= 0) {
          return null;
        }

        const rawProgress = seed.phaseOffset + effectiveCycles * baseSpeed;
        const progress = ((rawProgress % 1) + 1) % 1;
        const x = startX + progress * vesselLength;

        const sectionIndex = Math.min(
          Math.floor(progress * (vesselSections.length - 1)),
          vesselSections.length - 1
        );
        const section = vesselSections[sectionIndex] ?? vesselSections[vesselSections.length - 1];
        const vesselRadius = section?.diameter ?? baseRadius * vesselDiameter;

        const sway = prefersReducedMotion ? 0 : Math.sin(cycleRadians * 1.1 + seed.swayOffset) * 4 * seed.depthJitter;
        const perivascularOffset = vesselRadius + 12 + seed.depthJitter * 14;
        const maxDistance = 65;
        const unclampedY = centerY + seed.lane * (perivascularOffset + sway * 0.2);
        const y = seed.lane > 0
          ? Math.min(unclampedY, centerY + maxDistance)
          : Math.max(unclampedY, centerY - maxDistance);

        const zPulse = prefersReducedMotion ? 0 : Math.sin(cycleRadians * 0.95 + seed.phaseOffset * Math.PI * 2);
        const scaleFactor = 0.65 + 0.45 * ((zPulse + 1) / 2);
        const opacityFactor = 0.55 + 0.45 * ((zPulse + 1) / 2);

        return {
          id: seed.id,
          x,
          y,
          size: seed.sizeBase * scaleFactor * (0.6 + 0.7 * normalizedWaste),
          opacity: seed.opacityBase * opacityFactor * activity * (0.5 + flowRate * 0.35),
        };
      })
      .filter((particle): particle is { id: number; x: number; y: number; size: number; opacity: number } => particle !== null);
  }, [
    showWaste,
    wasteSeeds,
    wasteConcentration,
    flowRate,
    prefersReducedMotion,
    vesselSections,
    startX,
    vesselLength,
    centerY,
    baseRadius,
    vesselDiameter,
    cycleRadians,
    globalTime,
  ]);

  return (
    <div className="relative">
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ display: "block", width: "100%", height: "auto", maxWidth: "100%", margin: "0 auto" }}
      >
        <defs>
          {/* Blood gradient */}
          <linearGradient id="blood-coronal-horizontal" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#dc2626" stopOpacity="0.9" />
            <stop offset="50%" stopColor="#ef4444" stopOpacity="1" />
            <stop offset="100%" stopColor="#dc2626" stopOpacity="0.9" />
          </linearGradient>

          {/* Vessel wall gradient */}
          <linearGradient id="vessel-wall-coronal" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#ea580c" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#f97316" stopOpacity="0.6" />
          </linearGradient>

          {/* CSF gradient */}
          <linearGradient id="csf-coronal-bg" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.1" />
            <stop offset="50%" stopColor="#06b6d4" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.1" />
          </linearGradient>
        </defs>

        <motion.g
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6 }}
        >
          {/* Perivascular CSF space background (fixed height) */}
          {showVessel && (
            <>
              <rect
                x={startX}
                y={centerY - baseRadius - 30}
                width={vesselLength}
                height={(baseRadius + 30) * 2}
                fill="url(#csf-coronal-bg)"
                stroke="#3b82f6"
                strokeWidth={1.5}
                strokeOpacity={0.3 * vesselOpacity}
                opacity={csfFillOpacity}
                rx={8}
              />

              {/* CSF space boundary labels */}
              <text
                x={startX + vesselLength / 2}
                y={centerY - baseRadius - 40}
                textAnchor="middle"
                fontSize={9}
                fill="#3b82f6"
                opacity={0.7 * vesselOpacity}
                fontWeight="600"
              >
                Perivascular space (fixed boundaries)
              </text>
            </>
          )}

          {/* Draw vessel as connected vertical ellipses */}
          {showVessel && vesselSections.map((section, i) => (
            <ellipse
              key={section.id}
              cx={section.x}
              cy={centerY}
              rx={3}
              ry={section.diameter}
              fill={i % 2 === 0 ? "url(#blood-coronal-horizontal)" : "#dc2626"}
              fillOpacity={(i % 2 === 0 ? 1 : 0.85) * vesselOpacity}
              stroke={i === 0 || i === vesselSections.length - 1 ? "url(#vessel-wall-coronal)" : "none"}
              strokeWidth={2}
              strokeOpacity={vesselOpacity}
            />
          ))}

          {/* Vessel wall outlines (top and bottom edges) */}
          {showVessel && (
            <>
              {/* Top edge */}
              <path
                d={`M ${vesselSections.map((s, i) =>
                  `${i === 0 ? 'M' : 'L'} ${s.x},${centerY - s.diameter}`
                ).join(' ')}`}
                fill="none"
                stroke="#f97316"
                strokeWidth={3}
                strokeOpacity={0.8 * vesselOpacity}
              />

              {/* Bottom edge */}
              <path
                d={`M ${vesselSections.map((s, i) =>
                  `${i === 0 ? 'M' : 'L'} ${s.x},${centerY + s.diameter}`
                ).join(' ')}`}
                fill="none"
                stroke="#f97316"
                strokeWidth={3}
                strokeOpacity={0.8 * vesselOpacity}
              />
            </>
          )}

          {/* CSF flow particles */}
          {csfParticles.map((particle) => (
            <motion.circle
              key={particle.id}
              cx={particle.x}
              cy={particle.y}
              r={particle.size}
              fill="#3b82f6"
              opacity={particle.opacity}
              initial={{ opacity: 0 }}
              animate={{ opacity: particle.opacity }}
              transition={{ duration: 0.4 }}
            />
          ))}

          {/* Waste particles carried with CSF */}
          {wasteParticles.map((particle) => (
            <motion.circle
              key={`waste-${particle.id}`}
              cx={particle.x}
              cy={particle.y}
              r={particle.size}
              fill="#6b7280"
              opacity={particle.opacity}
              initial={{ opacity: 0 }}
              animate={{ opacity: particle.opacity }}
              transition={{ duration: 0.4 }}
            />
          ))}

          {/* Z-axis flow annotation */}
          {showFlow && (
            <g opacity={0.8}>
              <text
                x={startX + vesselLength + 15}
                y={centerY - 20}
                fontSize={10}
                fill="#3b82f6"
                fontWeight="600"
                textAnchor="start"
                dominantBaseline="middle"
              >
                ⊙ CSF flow
              </text>
              <text
                x={startX + vesselLength + 15}
                y={centerY - 8}
                fontSize={8}
                fill="#3b82f6"
                opacity={0.7}
                textAnchor="start"
                dominantBaseline="middle"
              >
                (through plane)
              </text>
              {showWaste && (
                <text
                  x={startX + vesselLength + 15}
                  y={centerY + 6}
                  fontSize={9}
                  fill="#6b7280"
                  opacity={0.7}
                  textAnchor="start"
                  dominantBaseline="middle"
                >
                  Waste entrained
                </text>
              )}
            </g>
          )}

          {/* Traveling wave annotation */}
          {(phase === "vasomotion" || phase === "volume-exchange") && (
            <g opacity={0.6}>
              <text
                x={annotationX}
                y={centerY - 10}
                fontSize={9}
                fill="var(--foreground)"
                opacity={0.7}
                textAnchor="end"
              >
                Traveling
              </text>
              <text
                x={annotationX}
                y={centerY + 2}
                fontSize={9}
                fill="var(--foreground)"
                opacity={0.7}
                textAnchor="end"
              >
                constriction
              </text>
              <text
                x={annotationX}
                y={centerY + 14}
                fontSize={9}
                fill="var(--foreground)"
                opacity={0.7}
                textAnchor="end"
              >
                waves →
              </text>
            </g>
          )}

          {/* Axis labels - positioned below to avoid overlap with CSF flow annotations */}
          {showVessel && (
            <>
              <text
                x={startX - 10}
                y={centerY + 80}
                textAnchor="end"
                fontSize={10}
                fill="var(--foreground)"
                opacity={0.6}
              >
                Proximal
              </text>
              <text
                x={startX + vesselLength + 10}
                y={centerY + 80}
                textAnchor="start"
                fontSize={10}
                fill="var(--foreground)"
                opacity={0.6}
              >
                Distal
              </text>
            </>
          )}
        </motion.g>
      </svg>

    </div>
  );
}
