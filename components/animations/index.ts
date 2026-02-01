/**
 * Animation Components Export
 *
 * Centralized exports for all animation-related components and utilities
 */

export { default as ScrollReveal } from "./ScrollReveal";

// Re-export performance utilities
export {
  useScrollPerformance,
  getOptimalAnimationSettings,
} from "@/hooks/use-scroll-performance";

// Type exports for better TypeScript support
// export type { ScrollRevealProps } from "./ScrollReveal";
