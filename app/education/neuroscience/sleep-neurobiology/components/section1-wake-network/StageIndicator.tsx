"use client";

import React from "react";
import { motion } from "framer-motion";
import { Sun, Moon, Brain, Activity } from "lucide-react";
import type { SleepStage } from "../shared/TimelineScrollOrchestrator";

/**
 * StageIndicator Component
 *
 * Displays the current sleep stage with visual indicators and descriptions
 * following the script.md narrative structure.
 *
 * Features:
 * - Visual stage representation with icons
 * - Smooth transitions between stages
 * - Script-based descriptions
 * - Color-coded stage indicators
 */

interface StageIndicatorProps {
  currentStage: SleepStage;
  processS: number;
  processC: number;
  className?: string;
  variant?: "default" | "compact";
}

const STAGE_INFO: Record<SleepStage, {
  title: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
}> = {
  wake: {
    title: "Wake Network Active",
    description: "Five neurotransmitter systems ascend from brainstem to cortex. Orexin stabilizes arousal centers so wake is sustained.",
    icon: <Sun className="h-6 w-6" />,
    color: "var(--color-golden-yellow)",
    bgColor: "rgba(251, 180, 78, 0.15)",
  },
  drowsy: {
    title: "Adenosine Loading",
    description: "Process S pressure builds. Caffeine can push back against this homeostatic drive by blocking adenosine receptors.",
    icon: <Brain className="h-6 w-6" />,
    color: "var(--color-orange)",
    bgColor: "rgba(249, 115, 22, 0.15)",
  },
  n1: {
    title: "Sleep Onset (N1)",
    description: "VLPO GABA-galanin neurons start inhibiting arousal hubs. TRN begins closing the sensory gate.",
    icon: <Moon className="h-6 w-6" />,
    color: "var(--color-soft-blue)",
    bgColor: "rgba(104, 188, 232, 0.15)",
  },
  n2: {
    title: "Light Sleep (N2)",
    description: "TRN generates 11-16 Hz spindles via rhythmic inhibition. Spindles gate sensory input while coupling with hippocampal ripples.",
    icon: <Activity className="h-6 w-6" />,
    color: "var(--color-blue)",
    bgColor: "rgba(59, 130, 246, 0.15)",
  },
  n3: {
    title: "Deep Sleep (N3)",
    description: "Cortex settles into slow oscillations (0.5-4 Hz). Delta power reflects local use - heavily recruited regions show stronger slow waves.",
    icon: <Brain className="h-6 w-6" />,
    color: "var(--color-indigo)",
    bgColor: "rgba(99, 102, 241, 0.15)",
  },
  rem: {
    title: "REM Sleep",
    description: "SLD switches on, enforcing atonia while cortex reactivates. Hippocampal theta coordinates with cortical activation for memory consolidation.",
    icon: <Activity className="h-6 w-6" />,
    color: "var(--color-soft-lavender)",
    bgColor: "rgba(168, 162, 158, 0.15)",
  },
};

export default function StageIndicator({
  currentStage,
  processS,
  processC,
  className = "",
  variant = "default",
}: StageIndicatorProps) {
  const stageInfo = STAGE_INFO[currentStage];
  const paddingClass = variant === "compact" ? "p-4 sm:p-5" : "p-6";
  const rootClasses = [
    "relative",
    "rounded-2xl",
    "border",
    paddingClass,
    variant === "compact" ? "flex h-full flex-col" : "",
    className,
  ].filter(Boolean).join(" ");
  const iconWrapperClass = variant === "compact" ? "h-10 w-10" : "h-12 w-12";
  const titleClass = variant === "compact" ? "text-lg sm:text-xl" : "text-xl";
  const descriptionClass = variant === "compact" ? "text-sm sm:text-base" : "text-base";
  const badgeTextClass = variant === "compact" ? "text-[11px]" : "text-xs";
  const dotSizeClass = variant === "compact" ? "w-2.5 h-2.5" : "w-3 h-3";
  const connectorWidthClass = variant === "compact" ? "w-3" : "w-4";
  const headerGapClass = variant === "compact" ? "gap-3 mb-3" : "gap-4 mb-4";


  return (
    <motion.div
      className={rootClasses}
      style={{
        backgroundColor: stageInfo.bgColor,
        borderColor: stageInfo.color,
      }}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4 }}
      layout
    >
      {/* Header */}
      <div className={`flex flex-none items-center ${headerGapClass}`}>
        <motion.div
          className={`flex items-center justify-center rounded-full ${iconWrapperClass}`}
          style={{
            backgroundColor: stageInfo.color,
            color: "white",
          }}
          animate={{ rotate: currentStage === 'rem' ? 360 : 0 }}
          transition={{ duration: 2, repeat: currentStage === 'rem' ? Infinity : 0 }}
        >
          {stageInfo.icon}
        </motion.div>

        <div className="min-w-0 flex-1">
          <motion.h3
            className={`${titleClass} font-bold`}
            style={{ color: stageInfo.color }}
            key={currentStage}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            {stageInfo.title}
          </motion.h3>

          {/* Process indicators */}
          <div className="flex items-center gap-4 mt-1">
            <div className="flex items-center gap-1">
              <div
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: "#a78bfa" }}
              />
              <span className="text-sm font-medium" style={{ color: "var(--foreground)", opacity: 0.7 }}>
                S: {processS.toFixed(0)}%
              </span>
            </div>
            <div className="flex items-center gap-1">
              <div
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: "#06b6d4" }}
              />
              <span className="text-sm font-medium" style={{ color: "var(--foreground)", opacity: 0.7 }}>
                C: {processC > 0 ? 'Alert' : 'Sleepy'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Description */}
      <motion.p
        className={`${descriptionClass} leading-relaxed flex-1 overflow-y-auto pr-1`}
        style={{ color: "var(--foreground)", opacity: 0.85 }}
        key={currentStage}
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 0.85, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
      >
        {stageInfo.description}
      </motion.p>

      {/* Stage progression indicator */}
      <div className="mt-4 flex flex-none items-center gap-2">
        {(['wake', 'drowsy', 'n1', 'n2', 'n3', 'rem'] as SleepStage[]).map((stage, index) => {
          const isActive = stage === currentStage;
          const stageOrder = ['wake', 'drowsy', 'n1', 'n2', 'n3', 'rem'];
          const currentIndex = stageOrder.indexOf(currentStage);
          const isPast = index < currentIndex;
          const isFuture = index > currentIndex;

          return (
            <motion.div
              key={stage}
              className="relative"
              animate={{
                scale: isActive ? 1.3 : 1,
                opacity: isActive ? 1 : isPast ? 0.6 : 0.3
              }}
              transition={{ duration: 0.3 }}
            >
              <div
                className={`${dotSizeClass} rounded-full`}
                style={{
                  backgroundColor: isActive
                    ? stageInfo.color
                    : isPast
                      ? STAGE_INFO[stage].color
                      : "var(--border)",
                }}
              />

              {/* Connection line */}
              {index < stageOrder.length - 1 && (
                <div
                  className={`absolute top-1/2 -translate-y-1/2 left-3 ${connectorWidthClass} h-0.5`}
                  style={{
                    backgroundColor: isPast ? STAGE_INFO[stage].color : "var(--border)",
                    opacity: isPast ? 0.6 : 0.3
                  }}
                />
              )}
            </motion.div>
          );
        })}
      </div>

      {/* Special indicators for key transitions */}
      {currentStage === 'drowsy' && (
        <motion.div
          className={`absolute top-4 right-4 px-3 py-1 rounded-full font-semibold ${badgeTextClass}`}
          style={{
            backgroundColor: "var(--color-orange)",
            color: "white",
          }}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3, delay: 0.2 }}
        >
          First Switch Loading
        </motion.div>
      )}

      {(currentStage === 'n1' || currentStage === 'n2' || currentStage === 'n3') && (
        <motion.div
          className={`absolute top-4 right-4 px-3 py-1 rounded-full font-semibold ${badgeTextClass}`}
          style={{
            backgroundColor: "var(--color-soft-blue)",
            color: "white",
          }}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3, delay: 0.2 }}
        >
          NREM Workshop
        </motion.div>
      )}

      {currentStage === 'rem' && (
        <motion.div
          className={`absolute top-4 right-4 px-3 py-1 rounded-full font-semibold ${badgeTextClass}`}
          style={{
            backgroundColor: "var(--color-soft-lavender)",
            color: "white",
          }}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3, delay: 0.2 }}
        >
          Second Switch
        </motion.div>
      )}
    </motion.div>
  );
}