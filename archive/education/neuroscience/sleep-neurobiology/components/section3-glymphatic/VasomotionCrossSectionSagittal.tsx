"use client";

import React, { useMemo } from "react";
import { motion, useReducedMotion } from "framer-motion";

const NE_CYCLE_PERIOD = 50;
const TOTAL_SEQUENCE_TIME = 150;

interface VasomotionCrossSectionSagittalProps {
  width: number;
  height: number;
  vesselDiameter: number;
  flowRate: number;
  csfVolume: number;
  phase: string;
  wasteConcentration: number;
  time: number;
  cycleIndex: number;
}

export default function VasomotionCrossSectionSagittal({
  width,
  height,
  vesselDiameter,
  flowRate,
  csfVolume,
  phase,
  wasteConcentration,
  time,
  cycleIndex,
}: VasomotionCrossSectionSagittalProps) {
  const centerX = width / 2;
  const centerY = height / 2;

  const prefersReducedMotion = useReducedMotion();

  // FIXED outer boundary (astrocyte endfeet anchor the perivascular space)
  const OUTER_BOUNDARY_RADIUS = 130; // Increased for better visibility

  // Inner blood vessel varies with diameter
  const baseVesselRadius = 85; // Increased for better visibility
  const vesselRadius = baseVesselRadius * vesselDiameter; // 48-72px range

  const globalTime = cycleIndex * TOTAL_SEQUENCE_TIME + time;
  const cycleProgress = ((globalTime % NE_CYCLE_PERIOD) + NE_CYCLE_PERIOD) % NE_CYCLE_PERIOD / NE_CYCLE_PERIOD;
  const cycleRadians = cycleProgress * Math.PI * 2;
  const pulsation = prefersReducedMotion ? 0 : Math.sin(cycleRadians);

  const dynamicAmplitude = prefersReducedMotion ? 0 : 0.05 + flowRate * 0.08;
  const dynamicVesselRadius = Math.max(
    vesselRadius * (1 + pulsation * dynamicAmplitude),
    baseVesselRadius * 0.55
  );

  // CSF space is the annular region between vessel and fixed boundary
  const vesselWallThickness = 8; // Increased for better visibility
  const csfInnerRadius = dynamicVesselRadius + vesselWallThickness;
  const csfSpaceThickness = Math.max(OUTER_BOUNDARY_RADIUS - csfInnerRadius, 8);

  const showVessel = true; // Always show vessel
  const vesselOpacity = phase === "intro" ? 0.3 : 1; // Subtle in intro, full after
  const showFlow = true;
  const normalizedWaste = Math.max(Math.min((wasteConcentration - 0.2) / 0.8, 1), 0);
  const showWaste = phase === "flow-clearance" && normalizedWaste > 0.02;

  const wasteSeeds = useMemo(
    () =>
      Array.from({ length: 25 }, (_, i) => ({
        id: i,
        angleOffset: (i / 25) * Math.PI * 2,
        radiusJitter: 0.1 + Math.random() * 0.9,
        size: 4 + Math.random() * 3,
        baseOpacity: 0.4 + Math.random() * 0.3,
        drift: 0.4 + Math.random() * 0.6,
      })),
    []
  );

  // Waste particles in perivascular CSF space
  // Pulsate to show z-axis flow (toward/away from viewer)
  const wasteParticles = useMemo(() => {
    if (!showWaste) return [];

    const cyclesElapsed = globalTime / NE_CYCLE_PERIOD;
    const effectiveLoop = prefersReducedMotion ? 0 : cyclesElapsed * Math.PI * 2;

    return wasteSeeds.map((seed) => {
      const angle = seed.angleOffset + effectiveLoop * seed.drift;
      const radius = csfInnerRadius + seed.radiusJitter * csfSpaceThickness * 0.9;

      // Z-axis pulsation: scale and opacity vary to simulate depth
      const zPulse = Math.sin(effectiveLoop + seed.angleOffset * 2);
      const scaleFactor = 0.7 + 0.6 * ((zPulse + 1) / 2); // 0.7 to 1.3
      const opacityFactor = 0.5 + 0.5 * ((zPulse + 1) / 2); // 0.5 to 1.0

      const activity = Math.max(Math.min(normalizedWaste * wasteSeeds.length - seed.id, 1), 0);
      if (activity <= 0) {
        return null;
      }

      return {
        id: seed.id,
        x: centerX + radius * Math.cos(angle),
        y: centerY + radius * Math.sin(angle),
        size: seed.size * scaleFactor * (0.6 + 0.6 * normalizedWaste),
        opacity: seed.baseOpacity * opacityFactor * activity * (0.45 + 0.35 * normalizedWaste),
      };
    }).filter((particle): particle is { id: number; x: number; y: number; size: number; opacity: number } => particle !== null);
  }, [
    showWaste,
    normalizedWaste,
    csfInnerRadius,
    csfSpaceThickness,
    centerX,
    centerY,
    globalTime,
    prefersReducedMotion,
    wasteSeeds,
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
          <radialGradient id="blood-sagittal" cx="50%" cy="50%">
            <stop offset="0%" stopColor="#ef4444" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#dc2626" stopOpacity="1" />
          </radialGradient>

          {/* Vessel wall gradient */}
          <radialGradient id="vessel-wall-sagittal" cx="50%" cy="50%">
            <stop offset="0%" stopColor="#f97316" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#ea580c" stopOpacity="0.9" />
          </radialGradient>

          {/* Perivascular CSF */}
          <radialGradient id="csf-sagittal" cx="50%" cy="50%">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.3" />
          </radialGradient>
        </defs>

        <motion.g
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6 }}
        >
          {/* FIXED outer boundary (astrocyte endfeet) */}
          {showVessel && (
            <>
              <circle
                cx={centerX}
                cy={centerY}
                r={OUTER_BOUNDARY_RADIUS}
                fill="url(#csf-sagittal)"
                stroke="#3b82f6"
                strokeWidth={2.5}
                strokeOpacity={0.5 * vesselOpacity}
                strokeDasharray="4,4"
                opacity={vesselOpacity * (0.35 + csfVolume * 0.55)}
              />

              {/* Astrocyte endfeet annotation */}
              <text
                x={centerX}
                y={centerY - OUTER_BOUNDARY_RADIUS - 12}
                textAnchor="middle"
                fontSize={13}
                fill="#3b82f6"
                opacity={0.7 * vesselOpacity}
                fontWeight="600"
              >
                Astrocyte endfeet (fixed)
              </text>
            </>
          )}

          {/* Z-axis flow annotation */}
          {showFlow && (
            <g>
              <text
                x={centerX + OUTER_BOUNDARY_RADIUS + 20}
                y={centerY}
                textAnchor="start"
                dominantBaseline="middle"
                fontSize={14}
                fill="#3b82f6"
                opacity={0.8}
                fontWeight="600"
              >
                ⊙ CSF flow
              </text>
              <text
                x={centerX + OUTER_BOUNDARY_RADIUS + 20}
                y={centerY + 14}
                textAnchor="start"
                dominantBaseline="middle"
                fontSize={12}
                fill="#3b82f6"
                opacity={0.6}
              >
                (through plane)
              </text>
            </g>
          )}

          {/* Waste particles in CSF */}
          {wasteParticles.map((particle) => (
            <motion.circle
              key={particle.id}
              cx={particle.x}
              cy={particle.y}
              r={particle.size}
              fill="#6b7280"
              opacity={particle.opacity}
              initial={{ opacity: 0 }}
              animate={{ opacity: particle.opacity }}
              transition={{ duration: 0.6, delay: particle.id * 0.02 }}
            />
          ))}

          {/* Arterial vessel - outer wall */}
          {showVessel && (
            <motion.circle
              cx={centerX}
              cy={centerY}
              r={dynamicVesselRadius}
              fill="none"
              stroke="url(#vessel-wall-sagittal)"
              strokeWidth={8}
              opacity={vesselOpacity}
              animate={{ r: dynamicVesselRadius }}
              transition={{ duration: 0.3 }}
            />
          )}

          {/* Arterial vessel - inner wall layer */}
          {showVessel && (
            <motion.circle
              cx={centerX}
              cy={centerY}
              r={dynamicVesselRadius - 3}
              fill="none"
              stroke="#f97316"
              strokeWidth={1}
              strokeOpacity={0.5 * vesselOpacity}
              animate={{ r: dynamicVesselRadius - 3 }}
              transition={{ duration: 0.3 }}
            />
          )}

          {/* Blood lumen */}
          {showVessel && (
            <motion.circle
              cx={centerX}
              cy={centerY}
              r={dynamicVesselRadius - 6}
              fill="url(#blood-sagittal)"
              opacity={vesselOpacity}
              animate={{ r: dynamicVesselRadius - 6 }}
              transition={{ duration: 0.3 }}
            />
          )}

          {/* Labels */}
          {showVessel && (
            <>
              {/* Blood label */}
              <text
                x={centerX}
                y={centerY}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={15}
                fill="#fff"
                fontWeight="600"
                opacity={0.9}
              >
                Blood
              </text>

              {/* Perivascular CSF label */}
              <text
                x={centerX + dynamicVesselRadius + csfSpaceThickness / 2}
                y={centerY}
                textAnchor="middle"
                fontSize={14}
                fill="#3b82f6"
                opacity={0.8}
                fontWeight="600"
              >
                CSF
              </text>
            </>
          )}

          {/* Diameter indicator lines */}
          {(phase === "vasomotion" || phase === "volume-exchange") && (
            <g opacity={0.4}>
              <line
                x1={centerX - dynamicVesselRadius}
                y1={centerY}
                x2={centerX + dynamicVesselRadius}
                y2={centerY}
                stroke="var(--foreground)"
                strokeWidth={1}
                strokeDasharray="4,4"
              />
              <line
                x1={centerX - dynamicVesselRadius}
                y1={centerY - 8}
                x2={centerX - dynamicVesselRadius}
                y2={centerY + 8}
                stroke="var(--foreground)"
                strokeWidth={2}
              />
              <line
                x1={centerX + dynamicVesselRadius}
                y1={centerY - 8}
                x2={centerX + dynamicVesselRadius}
                y2={centerY + 8}
                stroke="var(--foreground)"
                strokeWidth={2}
              />
            </g>
          )}
        </motion.g>
      </svg>

    </div>
  );
}
