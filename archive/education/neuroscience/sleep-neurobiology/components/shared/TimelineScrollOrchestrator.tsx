"use client";

import React, { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

/**
 * TimelineScrollOrchestrator Component
 *
 * Master scroll controller using GSAP ScrollTrigger for smooth timeline animation
 * following the sleep neurobiology narrative. Maps scroll position to time progression
 * through a 16-hour cycle (7am to 11pm), keeping content centered in viewport.
 *
 * Features:
 * - GSAP ScrollTrigger with pinned section for centered animation
 * - Scroll position → time mapping (7am to 11pm over scroll distance)
 * - Smooth scrubbing with 1-second catch-up for fluid experience
 * - Single source of truth for current time and sleep states
 * - Visual progress indicators and time display
 * - Proper React cleanup with gsap.context()
 */

export interface TimelineState {
  currentTime: number;           // Current time in 24h format (7-23)
  scrollProgress: number;        // Scroll progress (0-1)
  sleepStage: SleepStage;       // Current sleep stage
  processS: number;             // Process S level (0-100)
  processC: number;             // Process C phase (-1 to 1)
  isAnimationComplete: boolean; // Whether timeline animation is done
}

export type SleepStage = 'wake' | 'drowsy' | 'n1' | 'n2' | 'n3' | 'rem';

interface TimelineScrollOrchestratorProps {
  children: (state: TimelineState) => React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Determines sleep stage based on time and processes
 */
export const getSleepStage = (time: number, processS: number, processC: number): SleepStage => {
  // Wake hours (7am - 10pm)
  if (time >= 7 && time <= 22) {
    if (processS > 75 && processC < -0.3) {
      return 'drowsy'; // High adenosine + circadian dip
    }
    return 'wake';
  }

  // Sleep hours (10pm - 7am) - simplified staging
  if (time > 22 || time < 7) {
    const sleepHours = time > 22 ? time - 22 : time + 2; // Hours since sleep onset

    if (sleepHours < 0.5) return 'n1';      // Sleep onset
    if (sleepHours < 1.5) return 'n2';      // Light sleep
    if (sleepHours < 4) return 'n3';        // Deep sleep (first half)
    if (sleepHours < 6) return 'rem';       // REM periods
    return 'n2';                            // Light sleep before wake
  }

  return 'wake';
};

/**
 * Calculate Process S (homeostatic pressure)
 */
export const calculateProcessS = (time: number): number => {
  if (time < 7) {
    // Sleep period - exponential decay
    return 80 * Math.exp(-0.15 * time);
  } else if (time < 23) {
    // Wake period - exponential accumulation
    const wakeHours = time - 7;
    return 20 + 60 * (1 - Math.exp(-0.12 * wakeHours));
  } else {
    // Evening peak
    return 75 + 5 * (time - 23);
  }
};

/**
 * Calculate Process C (circadian rhythm)
 */
export const calculateProcessC = (time: number): number => {
  // Sine wave with peak alertness around 2pm
  return Math.sin((time - 8) * (Math.PI / 12));
};


export default function TimelineScrollOrchestrator({
  children,
  className = "",
  style = {},
}: TimelineScrollOrchestratorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const initialTime = 13;
  const [state, setState] = useState<TimelineState>({
    currentTime: initialTime,
    scrollProgress: 0,
    sleepStage: getSleepStage(initialTime, calculateProcessS(initialTime), calculateProcessC(initialTime)),
    processS: calculateProcessS(initialTime),
    processC: calculateProcessC(initialTime),
    isAnimationComplete: false,
  });

  // Track hold state for completion pause
  const holdScrollsRef = useRef(0);
  const isHoldingRef = useRef(false);

  // GSAP ScrollTrigger setup with proper React lifecycle management
  useEffect(() => {
    if (typeof window === "undefined") return;

    // Register GSAP plugin
    gsap.registerPlugin(ScrollTrigger);

    // Development override for testing animations (set to true to test with reduced motion enabled)
    const FORCE_ANIMATIONS = true; // Toggle this to false for production

    // Check for reduced motion preference
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion && !FORCE_ANIMATIONS) {
      // Simplified experience for reduced motion users
      setState(prev => ({ ...prev, currentTime: 12, sleepStage: 'wake' }));
      return;
    }

    const ctx = gsap.context(() => {
      // Create ScrollTrigger for timeline progression
      const scrollTrigger = ScrollTrigger.create({
        trigger: containerRef.current,
        start: "top top",
        end: "+=800%", // Full 24-hour cycle (7am to 7am next day)
        pin: true,
        pinSpacing: true, // Explicit pin spacing
        scrub: 1.5, // Smooth scrubbing with slight delay for longer scroll
        anticipatePin: 1, // Prevent layout jumps
        invalidateOnRefresh: true,
        refreshPriority: 1, // Higher priority to load before other triggers
        onUpdate: (self) => {
          const progress = self.progress;
          const time = 13 + progress * 24; // 1pm + 24 hours = 1pm next day (13-37)
          const normalizedTime = time > 24 ? time - 24 : time; // Normalize to 0-24 for calculations
          const processS = calculateProcessS(normalizedTime);
          const processC = calculateProcessC(normalizedTime);
          const sleepStage = getSleepStage(normalizedTime, processS, processC);
          const isComplete = progress >= 0.95;

          // Detect when we hit completion
          if (isComplete && !isHoldingRef.current) {
            isHoldingRef.current = true;
            holdScrollsRef.current = 2; // Hold for 2 scroll events
          }

          setState({
            currentTime: normalizedTime, // Use normalized time so graph wraps correctly at midnight
            scrollProgress: progress,
            sleepStage,
            processS,
            processC,
            isAnimationComplete: isComplete,
          });

        },
      });

      // Wheel event handler to create hold effect at completion
      const handleWheel = (e: WheelEvent) => {
        if (isHoldingRef.current && holdScrollsRef.current > 0) {
          e.preventDefault();
          e.stopPropagation();
          holdScrollsRef.current--;

          if (holdScrollsRef.current <= 0) {
            isHoldingRef.current = false;
          }
        }
      };

      // Add wheel listener with capture to intercept before ScrollTrigger
      window.addEventListener('wheel', handleWheel, { passive: false, capture: true });

      return () => {
        window.removeEventListener('wheel', handleWheel, { capture: true });
      };
    }, containerRef);

    return () => {
      ctx.revert(); // Cleanup all GSAP animations and ScrollTriggers
    };
  }, []);

  return (
    <section
      ref={containerRef}
      className={`relative isolate ${className}`}
      style={{
        minHeight: "100vh",
        ...style,
      }}
    >
      <div className="relative">
        <div className="relative mx-auto flex h-screen w-full items-center justify-center px-4 sm:px-6 lg:px-12">
          <motion.div
            className="w-full"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          >
            {children(state)}
          </motion.div>
        </div>
      </div>
    </section>
  );
}
