"use client";

import React, { useMemo } from "react";
import { motion } from "framer-motion";
import { Activity, Zap, Brain, Coffee, Eye, Sparkles, Heart, Shield } from "lucide-react";
import type { SleepStage } from "../shared/TimelineScrollOrchestrator";

/**
 * NeurotransmitterPanel Component
 *
 * Displays neurotransmitter levels and activity patterns over time,
 * synchronized with the timeline and sleep stages.
 *
 * Features:
 * - Real-time neurotransmitter level visualization
 * - Sleep stage-specific activity patterns
 * - Script-based descriptions and functions
 * - Animated level bars with colors
 */

interface NeurotransmitterSystem {
  id: string;
  name: string;
  abbreviation: string;
  origin: string;
  function: string;
  color: string;
  icon: React.ReactNode;
  peakTimes: number[]; // Hours when this system peaks
  sleepRole: 'wake-promoting' | 'sleep-promoting' | 'stabilizing' | 'gating';
}

interface NeurotransmitterPanelProps {
  currentTime: number;
  sleepStage: SleepStage;
  processS: number;
  processC: number;
  className?: string;
  variant?: "default" | "compact";
}

export const NEUROTRANSMITTER_SYSTEMS: NeurotransmitterSystem[] = [
  {
    id: 'norepinephrine',
    name: 'Norepinephrine',
    abbreviation: 'NE',
    origin: 'Locus Coeruleus',
    function: 'Alertness & Attention',
    color: '#f59e0b',
    icon: <Zap className="h-4 w-4" />,
    peakTimes: [10, 14, 18],
    sleepRole: 'wake-promoting',
  },
  {
    id: 'serotonin',
    name: 'Serotonin',
    abbreviation: '5-HT',
    origin: 'Dorsal Raphe',
    function: 'Mood & Sleep Regulation',
    color: '#ef4444',
    icon: <Heart className="h-4 w-4" />,
    peakTimes: [8, 16],
    sleepRole: 'wake-promoting',
  },
  {
    id: 'dopamine',
    name: 'Dopamine',
    abbreviation: 'DA',
    origin: 'VTA',
    function: 'Reward & Motivation',
    color: '#ec4899',
    icon: <Sparkles className="h-4 w-4" />,
    peakTimes: [10, 15, 20],
    sleepRole: 'wake-promoting',
  },
  {
    id: 'histamine',
    name: 'Histamine',
    abbreviation: 'HA',
    origin: 'TMN',
    function: 'Arousal & Wakefulness',
    color: '#8b5cf6',
    icon: <Eye className="h-4 w-4" />,
    peakTimes: [9, 13, 17],
    sleepRole: 'wake-promoting',
  },
  {
    id: 'acetylcholine',
    name: 'Acetylcholine',
    abbreviation: 'ACh',
    origin: 'Basal Forebrain/PPT',
    function: 'Attention & REM',
    color: '#10b981',
    icon: <Brain className="h-4 w-4" />,
    peakTimes: [8, 14, 2], // Also active during REM
    sleepRole: 'wake-promoting',
  },
  {
    id: 'orexin',
    name: 'Orexin',
    abbreviation: 'ORX',
    origin: 'Lateral Hypothalamus',
    function: 'Wake Stabilizer',
    color: '#a78bfa',
    icon: <Shield className="h-4 w-4" />,
    peakTimes: [7, 11, 15, 19],
    sleepRole: 'stabilizing',
  },
  {
    id: 'gaba',
    name: 'GABA',
    abbreviation: 'GABA',
    origin: 'VLPO/MPOA',
    function: 'Sleep Switch',
    color: '#3b82f6',
    icon: <Activity className="h-4 w-4" />,
    peakTimes: [22, 23, 1, 2],
    sleepRole: 'sleep-promoting',
  },
  {
    id: 'adenosine',
    name: 'Adenosine',
    abbreviation: 'ADO',
    origin: 'Metabolic Byproduct',
    function: 'Sleep Pressure',
    color: '#06b6d4',
    icon: <Coffee className="h-4 w-4" />,
    peakTimes: [21, 22, 23],
    sleepRole: 'sleep-promoting',
  },
];

/**
 * Calculate neurotransmitter level based on time, stage, and circadian patterns
 */
export const calculateNTLevel = (
  system: NeurotransmitterSystem,
  currentTime: number,
  sleepStage: SleepStage,
  processS: number,
  processC: number
): number => {
  // Base level from circadian pattern
  const circadianLevel = (() => {
    const hoursSincePeak = system.peakTimes.map(peak =>
      Math.min(Math.abs(currentTime - peak), Math.abs(currentTime - peak + 24), Math.abs(currentTime - peak - 24))
    );
    const closestPeak = Math.min(...hoursSincePeak);
    return Math.max(0.1, 1 - (closestPeak / 6)); // Peak within 6 hours
  })();

  // Sleep stage modulation
  const stageModulation = (() => {
    switch (system.sleepRole) {
      case 'wake-promoting':
        switch (sleepStage) {
          case 'wake': return 1;
          case 'drowsy': return 0.7;
          case 'n1': return 0.4;
          case 'n2': return 0.2;
          case 'n3': return 0.1;
          case 'rem': return system.id === 'acetylcholine' ? 0.8 : 0.3;
          default: return 0.5;
        }
      case 'sleep-promoting':
        switch (sleepStage) {
          case 'wake': return 0.2;
          case 'drowsy': return 0.6;
          case 'n1': return 0.8;
          case 'n2': return 0.9;
          case 'n3': return 1;
          case 'rem': return 0.7;
          default: return 0.5;
        }
      case 'stabilizing':
        return sleepStage === 'wake' ? 1 : 0.1;
      case 'gating':
        return sleepStage === 'wake' ? 0.3 : 0.8;
      default:
        return 0.5;
    }
  })();

  // Process-specific adjustments
  const processAdjustment = (() => {
    if (system.id === 'adenosine') {
      return processS / 100; // Direct relationship with Process S
    }
    if (system.sleepRole === 'wake-promoting') {
      return 1 - (processS / 200); // Inverse relationship
    }
    return 1;
  })();

  return Math.max(0.05, Math.min(1, circadianLevel * stageModulation * processAdjustment));
};

export default function NeurotransmitterPanel({
  currentTime,
  sleepStage,
  processS,
  processC,
  className = "",
  variant = "default",
}: NeurotransmitterPanelProps) {
  // Calculate levels for all systems
  const systemLevels = useMemo(() => {
    return NEUROTRANSMITTER_SYSTEMS.reduce((acc, system) => {
      acc[system.id] = calculateNTLevel(system, currentTime, sleepStage, processS, processC);
      return acc;
    }, {} as Record<string, number>);
  }, [currentTime, sleepStage, processS, processC]);

  // Group systems by role
  const groupedSystems = useMemo(() => {
    return {
      'Wake-Promoting': NEUROTRANSMITTER_SYSTEMS.filter(s => s.sleepRole === 'wake-promoting'),
      'Stabilizing': NEUROTRANSMITTER_SYSTEMS.filter(s => s.sleepRole === 'stabilizing'),
      'Sleep-Promoting': NEUROTRANSMITTER_SYSTEMS.filter(s => s.sleepRole === 'sleep-promoting'),
    };
  }, []);

  const containerGapClass = variant === "compact" ? "gap-3" : "gap-4";
  const rootClasses = [
    "flex",
    "h-full",
    "flex-col",
    containerGapClass,
    className,
  ].filter(Boolean).join(" ");
  const contentSpacingClass = variant === "compact" ? "space-y-3" : "space-y-4";
  const cardPaddingClass = variant === "compact" ? "p-3" : "p-4";
  const headingClass = variant === "compact" ? "text-xs font-semibold tracking-wide uppercase mb-2" : "text-sm font-semibold mb-3";
  const systemsWrapperClass = variant === "compact" ? "grid grid-cols-1 sm:grid-cols-2 gap-3" : "space-y-3";
  const itemGapClass = variant === "compact" ? "gap-2" : "gap-3";
  const iconSizeClass = variant === "compact" ? "h-7 w-7" : "h-8 w-8";
  const abbreviationClass = variant === "compact" ? "text-sm" : "text-sm";
  const originClass = variant === "compact" ? "text-[11px]" : "text-xs";
  const descriptionTextClass = variant === "compact" ? "text-[11px]" : "text-xs";

  return (
    <div className={rootClasses}>
      <div className={`flex-1 overflow-y-auto pr-1 ${contentSpacingClass}`}>
        {Object.entries(groupedSystems).map(([groupName, systems]) => (
          <motion.div
            key={groupName}
            className={`rounded-xl border ${cardPaddingClass}`}
            style={{
              backgroundColor: "var(--card)",
              borderColor: "var(--border)",
            }}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <h4
              className={headingClass}
              style={{
                color: groupName === 'Wake-Promoting'
                  ? 'var(--color-golden-yellow)'
                  : groupName === 'Stabilizing'
                    ? 'var(--color-soft-lavender)'
                    : 'var(--color-soft-blue)',
              }}
            >
              {groupName} Systems
            </h4>

            <div className={systemsWrapperClass}>
              {systems.map((system) => {
                const level = systemLevels[system.id];
                const isHighlyActive = level > 0.7;

                return (
                  <motion.div
                    key={system.id}
                    className={`flex items-center ${itemGapClass}`}
                    animate={{ opacity: level > 0.1 ? 1 : 0.5 }}
                    transition={{ duration: 0.3 }}
                  >
                    <motion.div
                      className={`flex items-center justify-center rounded-full ${iconSizeClass}`}
                      style={{
                        backgroundColor: `${system.color}20`,
                        color: system.color,
                      }}
                      animate={{
                        scale: isHighlyActive ? 1.1 : 1,
                        boxShadow: isHighlyActive
                          ? `0 0 12px ${system.color}40`
                          : '0 0 0 rgba(0,0,0,0)',
                      }}
                      transition={{ duration: 0.3 }}
                    >
                      {system.icon}
                    </motion.div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className={`${abbreviationClass} font-medium`}
                          style={{ color: system.color }}
                        >
                          {system.abbreviation}
                        </span>
                        <span
                          className={originClass}
                          style={{ color: "var(--foreground)", opacity: 0.6 }}
                        >
                          {system.origin}
                        </span>
                      </div>

                      <div
                        className="h-2 rounded-full overflow-hidden"
                        style={{ backgroundColor: "var(--border)" }}
                      >
                        <motion.div
                          className="h-full rounded-full"
                          style={{ backgroundColor: system.color }}
                          initial={{ width: 0 }}
                          animate={{ width: `${level * 100}%` }}
                          transition={{ type: "spring", stiffness: 300, damping: 30 }}
                        />
                      </div>

                      <p
                        className={`${descriptionTextClass} mt-1`}
                        style={{ color: "var(--foreground)", opacity: 0.6 }}
                      >
                        {system.function}
                      </p>
                    </div>

                    <motion.div
                      className={`${descriptionTextClass} font-mono px-2 py-1 rounded text-center`}
                      style={{
                        backgroundColor: `${system.color}15`,
                        color: system.color,
                        minWidth: "40px",
                      }}
                      animate={{ opacity: level > 0.1 ? 1 : 0.5 }}
                    >
                      {Math.round(level * 100)}%
                    </motion.div>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        ))}
      </div>

    </div>
  );

}
