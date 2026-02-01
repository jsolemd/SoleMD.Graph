"use client";

import { motion, useInView, useReducedMotion, Variants } from "framer-motion";
import { useRef, ReactNode, useEffect, useState } from "react";

interface ScrollRevealProps {
  children: ReactNode;
  direction?: "up" | "down" | "left" | "right";
  delay?: number;
  duration?: number;
  distance?: number;
  stagger?: boolean;
  staggerDelay?: number;
  threshold?: number;
  margin?: string;
  once?: boolean;
  className?: string;
  onAnimationStart?: () => void;
  onAnimationComplete?: () => void;
}

/**
 * ScrollReveal component that animates elements into view when they enter the viewport
 *
 * @param children - React nodes to animate
 * @param direction - Animation direction: up, down, left, right
 * @param delay - Initial delay before animation starts (seconds)
 * @param duration - Animation duration (seconds)
 * @param distance - Distance to animate from (pixels)
 * @param stagger - Enable staggered animation for child elements
 * @param staggerDelay - Delay between staggered animations (seconds)
 * @param threshold - Intersection threshold (0-1)
 * @param margin - Root margin for intersection observer
 * @param once - Whether animation should only happen once
 * @param className - Additional CSS classes
 * @param onAnimationStart - Callback when animation starts
 * @param onAnimationComplete - Callback when animation completes
 */
const ScrollReveal = ({
  children,
  direction = "up",
  delay = 0,
  duration = 0.6,
  distance = 50,
  stagger = false,
  staggerDelay = 0.1,
  threshold = 0.1,
  margin = "-100px",
  once = true,
  className = "",
  onAnimationStart,
  onAnimationComplete,
}: ScrollRevealProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, {
    once,
    margin: margin as any, // Fix for margin type issue
    amount: threshold,
  });
  const shouldReduceMotion = useReducedMotion();

  // Performance monitoring state
  const [frameRate, setFrameRate] = useState<number>(60);
  const frameCountRef = useRef(0);
  const lastTimeRef = useRef(performance.now());

  // Performance monitoring effect
  useEffect(() => {
    if (!isInView) return;

    let animationId: number;

    const monitorPerformance = () => {
      const currentTime = performance.now();
      frameCountRef.current++;

      if (currentTime - lastTimeRef.current >= 1000) {
        const fps = Math.round(
          (frameCountRef.current * 1000) / (currentTime - lastTimeRef.current)
        );
        setFrameRate(fps);

        // Log performance warnings
        if (fps < 30) {
          console.warn(`ScrollReveal performance degraded: ${fps}fps`);
        }

        frameCountRef.current = 0;
        lastTimeRef.current = currentTime;
      }

      animationId = requestAnimationFrame(monitorPerformance);
    };

    // Start monitoring when animation begins
    const timeoutId = setTimeout(() => {
      monitorPerformance();
    }, delay * 1000);

    return () => {
      clearTimeout(timeoutId);
      if (animationId) {
        cancelAnimationFrame(animationId);
      }
    };
  }, [isInView, delay]);

  // Direction offset calculations
  const getDirectionOffset = () => {
    if (shouldReduceMotion) {
      return { x: 0, y: 0, opacity: 0.3 };
    }

    switch (direction) {
      case "up":
        return { x: 0, y: distance, opacity: 0 };
      case "down":
        return { x: 0, y: -distance, opacity: 0 };
      case "left":
        return { x: distance, y: 0, opacity: 0 };
      case "right":
        return { x: -distance, y: 0, opacity: 0 };
      default:
        return { x: 0, y: distance, opacity: 0 };
    }
  };

  // Animation variants for staggered children
  const containerVariants: Variants = {
    hidden: {},
    visible: {
      transition: {
        staggerChildren: stagger ? staggerDelay : 0,
        delayChildren: delay,
      },
    },
  };

  const itemVariants: Variants = {
    hidden: getDirectionOffset(),
    visible: {
      x: 0,
      y: 0,
      opacity: 1,
      transition: {
        duration: shouldReduceMotion ? 0.2 : duration,
        ease: [0.4, 0, 0.2, 1] as const,
      },
    },
  };

  // Handle animation callbacks
  useEffect(() => {
    if (isInView && onAnimationStart) {
      const timeoutId = setTimeout(onAnimationStart, delay * 1000);
      return () => clearTimeout(timeoutId);
    }
  }, [isInView, onAnimationStart, delay]);

  const handleAnimationComplete = () => {
    if (onAnimationComplete) {
      onAnimationComplete();
    }
  };

  // If stagger is enabled, wrap children in motion.div elements
  if (stagger && Array.isArray(children)) {
    return (
      <motion.div
        ref={ref}
        className={className}
        variants={containerVariants}
        initial="hidden"
        animate={isInView ? "visible" : "hidden"}
        onAnimationComplete={handleAnimationComplete}
        data-testid="scroll-reveal-container"
        data-frame-rate={frameRate}
      >
        {children.map((child, index) => (
          <motion.div
            key={index}
            variants={itemVariants}
            data-testid={`scroll-reveal-item-${index}`}
          >
            {child}
          </motion.div>
        ))}
      </motion.div>
    );
  }

  // Single element animation
  return (
    <motion.div
      ref={ref}
      className={className}
      initial={getDirectionOffset()}
      animate={
        isInView
          ? {
              x: 0,
              y: 0,
              opacity: 1,
            }
          : getDirectionOffset()
      }
      transition={{
        duration: shouldReduceMotion ? 0.2 : duration,
        delay: delay,
        ease: [0.4, 0, 0.2, 1],
      }}
      onAnimationComplete={handleAnimationComplete}
      data-testid="scroll-reveal"
      data-frame-rate={frameRate}
    >
      {children}
    </motion.div>
  );
};

export default ScrollReveal;
