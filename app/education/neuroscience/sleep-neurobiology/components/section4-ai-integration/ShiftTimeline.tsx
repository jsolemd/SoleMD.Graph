"use client";

import React, { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { gsap } from "gsap";
import { Clock, Moon, Sun, Activity, Users, Zap } from "lucide-react";

interface SleepStage {
  name: string;
  duration: number;
  color: string;
  icon: React.ReactNode;
  activity: string;
}

/**
 * ShiftTimeline Component
 *
 * Visualizes the three acts of sleep as a horizontal timeline
 * showing different worker crews and their activities.
 *
 * Features:
 * - Interactive timeline with stage progression
 * - Animated worker transitions
 * - Stage-specific activity indicators
 * - Real-time progress tracking
 */
export default function ShiftTimeline() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [currentTime, setCurrentTime] = useState(0); // 0-480 minutes (8 hours)
  const [activeStage, setActiveStage] = useState(0);

  const sleepStages: SleepStage[] = [
    {
      name: "Act I: Setup & Light Sleep",
      duration: 120, // 2 hours
      color: "var(--color-soft-blue)",
      icon: <Users className="h-5 w-5" />,
      activity: "Transition crew prepares workspace, light maintenance begins",
    },
    {
      name: "Act II: Deep Restoration",
      duration: 240, // 4 hours
      color: "var(--color-accent-navy-blue)",
      icon: <Activity className="h-5 w-5" />,
      activity: "Heavy restoration, memory consolidation, waste clearance",
    },
    {
      name: "Act III: Morning Prep",
      duration: 120, // 2 hours
      color: "var(--color-soft-lavender)",
      icon: <Zap className="h-5 w-5" />,
      activity: "REM rehearsals, final cleanup, handover preparation",
    },
  ];

  useEffect(() => {
    if (typeof window === "undefined") return;

    const ctx = gsap.context(() => {
      // Animate timeline bars
      gsap.to("#timeline-bars .timeline-bar", {
        scaleX: 1,
        duration: 1.5,
        ease: "power2.out",
        stagger: 0.3,
      });

      // Animate progress indicator
      gsap.to("#progress-indicator", {
        x: `${(currentTime / 480) * 100}%`,
        duration: 1,
        ease: "power2.out",
      });

      // Animate worker activities
      gsap.to(`.stage-${activeStage} .worker-icon`, {
        y: [0, -10, 0],
        duration: 2,
        ease: "sine.inOut",
        repeat: -1,
      });

    }, containerRef);

    return () => {
      ctx.revert();
    };
  }, [currentTime, activeStage]);

  // Auto-progress timeline
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(prev => {
        const newTime = (prev + 5) % 480; // 5-minute increments, reset after 8 hours

        // Determine active stage
        let cumulativeTime = 0;
        let newActiveStage = 0;

        for (let i = 0; i < sleepStages.length; i++) {
          cumulativeTime += sleepStages[i].duration;
          if (newTime < cumulativeTime) {
            newActiveStage = i;
            break;
          }
        }

        setActiveStage(newActiveStage);
        return newTime;
      });
    }, 200); // Fast demo - in real app would be much slower

    return () => clearInterval(interval);
  }, [sleepStages]);

  const formatTime = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}:${mins.toString().padStart(2, '0')}`;
  };

  const getStageProgress = (stageIndex: number) => {
    let stageStart = 0;
    for (let i = 0; i < stageIndex; i++) {
      stageStart += sleepStages[i].duration;
    }

    if (currentTime < stageStart) return 0;
    if (currentTime >= stageStart + sleepStages[stageIndex].duration) return 100;

    return ((currentTime - stageStart) / sleepStages[stageIndex].duration) * 100;
  };

  return (
    <div
      ref={containerRef}
      className="min-h-screen flex items-center justify-center relative"
      style={{ backgroundColor: "var(--background)" }}
    >
      <div id="timeline-content" className="opacity-0 translate-y-10">
        <div className="content-container">
          <div className="max-w-6xl mx-auto">
            {/* Section Title */}
            <motion.div
              className="text-center mb-16"
              data-animate
            >
              <h2
                className="text-section-title mb-6"
                style={{ color: "var(--foreground)" }}
              >
                The Three{" "}
                <span style={{ color: "var(--color-fresh-green)" }}>
                  Acts of Sleep
                </span>
              </h2>
              <p
                className="text-body-large max-w-3xl mx-auto"
                style={{ color: "var(--foreground)", opacity: 0.7 }}
              >
                Like a well-orchestrated play, sleep unfolds in three distinct acts.
                Each act has its own crew, responsibilities, and timing, working together
                to restore and maintain your brain throughout the night.
              </p>
            </motion.div>

            {/* Current Time Display */}
            <motion.div
              className="text-center mb-12"
              data-animate
            >
              <div
                className="inline-flex items-center gap-4 px-6 py-3 rounded-full"
                style={{
                  backgroundColor: "var(--card)",
                  borderColor: "var(--border)",
                  border: "2px solid",
                }}
              >
                <Clock className="h-6 w-6" style={{ color: "var(--color-fresh-green)" }} />
                <div>
                  <div
                    className="text-2xl font-bold"
                    style={{ color: "var(--foreground)" }}
                  >
                    {formatTime(currentTime)} / 8:00
                  </div>
                  <div
                    className="text-sm"
                    style={{ color: "var(--foreground)", opacity: 0.7 }}
                  >
                    Sleep Progress
                  </div>
                </div>
                {currentTime < 240 ? (
                  <Moon className="h-6 w-6" style={{ color: "var(--color-soft-blue)" }} />
                ) : (
                  <Sun className="h-6 w-6" style={{ color: "var(--color-golden-yellow)" }} />
                )}
              </div>
            </motion.div>

            {/* Main Timeline */}
            <div id="timeline-bars" className="mb-16">
              <div className="relative">
                {/* Timeline Track */}
                <div className="h-4 bg-gray-200 rounded-full relative overflow-hidden">
                  {/* Progress Indicator */}
                  <div
                    id="progress-indicator"
                    className="absolute top-0 left-0 w-1 h-full z-20"
                    style={{
                      backgroundColor: "var(--color-fresh-green)",
                      transform: `translateX(${(currentTime / 480) * 100}%)`,
                      boxShadow: "0 0 10px var(--color-fresh-green)",
                    }}
                  />

                  {/* Stage Bars */}
                  {sleepStages.map((stage, index) => {
                    const startPercent = sleepStages.slice(0, index).reduce((sum, s) => sum + s.duration, 0) / 480 * 100;
                    const widthPercent = stage.duration / 480 * 100;

                    return (
                      <div
                        key={index}
                        className={`timeline-bar absolute top-0 h-full transition-all duration-300 ${
                          index === activeStage ? 'ring-2 ring-offset-2' : ''
                        }`}
                        style={{
                          left: `${startPercent}%`,
                          width: `${widthPercent}%`,
                          backgroundColor: stage.color,
                          opacity: index === activeStage ? 1 : 0.6,
                          transform: "scaleX(0)",
                          transformOrigin: "left",
                          ringColor: stage.color,
                        }}
                      />
                    );
                  })}
                </div>

                {/* Stage Labels */}
                <div className="flex justify-between mt-4">
                  {sleepStages.map((stage, index) => {
                    const startPercent = sleepStages.slice(0, index).reduce((sum, s) => sum + s.duration, 0) / 480 * 100;

                    return (
                      <div
                        key={index}
                        className="text-center"
                        style={{ marginLeft: `${startPercent}%` }}
                      >
                        <div
                          className="text-sm font-medium"
                          style={{
                            color: index === activeStage ? stage.color : "var(--foreground)",
                            opacity: index === activeStage ? 1 : 0.7,
                          }}
                        >
                          Act {index + 1}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Stage Details */}
            <div className="grid lg:grid-cols-3 gap-8">
              {sleepStages.map((stage, index) => (
                <motion.div
                  key={index}
                  className={`stage-${index} relative`}
                  data-animate
                >
                  <div
                    className={`floating-card p-6 h-full transition-all duration-500 ${
                      index === activeStage ? 'ring-4 transform scale-105' : ''
                    }`}
                    style={{
                      backgroundColor: index === activeStage ? `${stage.color}15` : "var(--card)",
                      borderColor: index === activeStage ? stage.color : "var(--border)",
                      ringColor: index === activeStage ? `${stage.color}30` : "transparent",
                    }}
                  >
                    {/* Stage Header */}
                    <div className="flex items-center gap-3 mb-4">
                      <div
                        className={`worker-icon w-12 h-12 rounded-full flex items-center justify-center ${
                          index === activeStage ? 'animate-pulse' : ''
                        }`}
                        style={{
                          backgroundColor: index === activeStage ? stage.color : "var(--color-gray)",
                        }}
                      >
                        <div style={{ color: "white" }}>
                          {stage.icon}
                        </div>
                      </div>
                      <div>
                        <h3
                          className="text-lg font-semibold"
                          style={{
                            color: index === activeStage ? stage.color : "var(--foreground)",
                          }}
                        >
                          {stage.name}
                        </h3>
                        <p
                          className="text-sm"
                          style={{ color: "var(--foreground)", opacity: 0.7 }}
                        >
                          {stage.duration / 60} hours
                        </p>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="mb-4">
                      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                        <motion.div
                          className="h-full rounded-full"
                          style={{ backgroundColor: stage.color }}
                          initial={{ width: "0%" }}
                          animate={{ width: `${getStageProgress(index)}%` }}
                          transition={{ duration: 0.5 }}
                        />
                      </div>
                      <div className="flex justify-between mt-1">
                        <span
                          className="text-xs"
                          style={{ color: "var(--foreground)", opacity: 0.6 }}
                        >
                          0%
                        </span>
                        <span
                          className="text-xs font-medium"
                          style={{ color: stage.color }}
                        >
                          {Math.round(getStageProgress(index))}%
                        </span>
                      </div>
                    </div>

                    {/* Activity Description */}
                    <p
                      className="text-body-small"
                      style={{ color: "var(--foreground)", opacity: 0.7 }}
                    >
                      {stage.activity}
                    </p>

                    {/* Active Indicator */}
                    {index === activeStage && (
                      <motion.div
                        className="absolute -top-2 -right-2"
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: "spring", stiffness: 500, damping: 30 }}
                      >
                        <div
                          className="w-6 h-6 rounded-full flex items-center justify-center"
                          style={{ backgroundColor: stage.color }}
                        >
                          <Activity className="h-3 w-3 text-white" />
                        </div>
                      </motion.div>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Educational Note */}
            <motion.div
              className="mt-16 text-center max-w-4xl mx-auto"
              data-animate
            >
              <div
                className="floating-card p-6"
                style={{
                  backgroundColor: "var(--card)",
                  borderColor: "var(--border)",
                }}
              >
                <h4
                  className="text-lg font-semibold mb-4"
                  style={{ color: "var(--foreground)" }}
                >
                  The Night Shift Schedule
                </h4>
                <p
                  className="text-body-small"
                  style={{ color: "var(--foreground)", opacity: 0.7 }}
                >
                  Each act of sleep has its specialized crew and timing. Act I focuses on
                  transition and light maintenance, Act II handles heavy restoration during
                  slow-wave sleep, and Act III prepares for the handover back to consciousness
                  with REM rehearsals and final cleanup.
                </p>
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
}