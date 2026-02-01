"use client";

import { useEffect, useRef, useState } from "react";

interface PerformanceMetrics {
  frameRate: number;
  averageFrameTime: number;
  droppedFrames: number;
  isPerformant: boolean;
}

/**
 * Hook to monitor scroll animation performance
 * Tracks frame rate, dropped frames, and overall performance health
 */
export const useScrollPerformance = (isActive: boolean = true) => {
  const [metrics, setMetrics] = useState<PerformanceMetrics>({
    frameRate: 60,
    averageFrameTime: 16.67,
    droppedFrames: 0,
    isPerformant: true,
  });

  const frameCountRef = useRef(0);
  // Time of the previous frame for calculating per-frame delta
  const lastFrameTimeRef = useRef(performance.now());
  // Time of the last metrics update for FPS calculations
  const lastMetricsTimeRef = useRef(performance.now());
  const frameTimesRef = useRef<number[]>([]);
  const droppedFramesRef = useRef(0);
  const animationIdRef = useRef<number>();

  useEffect(() => {
    if (!isActive) return;

    // Reset timing references when monitoring starts
    lastFrameTimeRef.current = performance.now();
    lastMetricsTimeRef.current = lastFrameTimeRef.current;

    const monitorPerformance = (currentTime: number) => {
      const deltaTime = currentTime - lastFrameTimeRef.current;
      lastFrameTimeRef.current = currentTime;

      // Track frame times for average calculation
      frameTimesRef.current.push(deltaTime);
      if (frameTimesRef.current.length > 60) {
        frameTimesRef.current.shift();
      }

      // Detect dropped frames (frame time > 20ms indicates dropped frame)
      if (deltaTime > 20) {
        droppedFramesRef.current++;
      }

      frameCountRef.current++;

      // Update metrics every second
      if (currentTime - lastMetricsTimeRef.current >= 1000) {
        const fps = Math.round(
          (frameCountRef.current * 1000) /
            (currentTime - lastMetricsTimeRef.current)
        );

        const averageFrameTime =
          frameTimesRef.current.length > 0
            ? frameTimesRef.current.reduce((a, b) => a + b, 0) /
              frameTimesRef.current.length
            : 16.67;

        const newMetrics: PerformanceMetrics = {
          frameRate: fps,
          averageFrameTime: Math.round(averageFrameTime * 100) / 100,
          droppedFrames: droppedFramesRef.current,
          isPerformant: fps >= 30 && averageFrameTime <= 33.33,
        };

        setMetrics(newMetrics);

        // Log performance warnings
        if (fps < 30) {
          console.warn(`Scroll animation performance degraded: ${fps}fps`);
        }
        if (droppedFramesRef.current > 5) {
          console.warn(`High dropped frame count: ${droppedFramesRef.current}`);
        }

        // Reset counters
        frameCountRef.current = 0;
        droppedFramesRef.current = 0;
        lastMetricsTimeRef.current = currentTime;
      }

      animationIdRef.current = requestAnimationFrame(monitorPerformance);
    };

    animationIdRef.current = requestAnimationFrame(monitorPerformance);

    return () => {
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current);
      }
    };
  }, [isActive]);

  return metrics;
};

/**
 * Utility to get optimal animation settings based on device performance
 */
export const getOptimalAnimationSettings = (metrics: PerformanceMetrics) => {
  if (!metrics.isPerformant) {
    return {
      duration: 0.3, // Shorter duration for low-end devices
      distance: 25, // Reduced distance
      staggerDelay: 0.05, // Faster stagger
      shouldSimplify: true,
    };
  }

  return {
    duration: 0.6,
    distance: 50,
    staggerDelay: 0.1,
    shouldSimplify: false,
  };
};
