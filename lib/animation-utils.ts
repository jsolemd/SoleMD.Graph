/**
 * Standardized Animation Utilities for SoleMD
 *
 * This module provides consistent animation patterns across all components
 * following the refined design system standards established in the landing page.
 */

/**
 * Standard easing curve used throughout the application
 * Provides smooth, professional animations
 */
export const STANDARD_EASING = [0.4, 0, 0.2, 1] as const;

/**
 * Standard animation durations in milliseconds
 */
export const ANIMATION_DURATIONS = {
  /** Quick hover effects and micro-interactions */
  hover: 200,
  /** Tap feedback and button presses */
  tap: 100,
  /** Theme transitions and color changes */
  theme: 300,
  /** Entrance animations and scroll reveals */
  entrance: 800,
  /** Complex animations and orchestrated sequences */
  complex: 500,
} as const;

/**
 * Standard hover animation for cards and interactive elements
 * Uses refined y: -4 lift pattern without scaling
 */
export const STANDARD_HOVER_ANIMATION = {
  y: -4,
  transition: {
    duration: ANIMATION_DURATIONS.hover / 1000,
    ease: STANDARD_EASING,
  },
} as const;

/**
 * Standard tap animation for buttons and clickable elements
 */
export const STANDARD_TAP_ANIMATION = {
  scale: 0.98,
  transition: {
    duration: ANIMATION_DURATIONS.tap / 1000,
    ease: STANDARD_EASING,
  },
} as const;

/**
 * Button hover animation with minimal scale and gentle lift
 */
export const BUTTON_HOVER_ANIMATION = {
  scale: 1.02,
  y: -1,
  transition: {
    duration: ANIMATION_DURATIONS.hover / 1000,
    ease: STANDARD_EASING,
  },
} as const;

/**
 * Icon hover animation with scale and subtle rotation
 */
export const ICON_HOVER_ANIMATION = {
  scale: 1.1,
  rotate: 3,
  transition: {
    duration: ANIMATION_DURATIONS.hover / 1000,
    ease: STANDARD_EASING,
  },
} as const;

/**
 * Standard entrance animation for scroll-based reveals
 */
export const ENTRANCE_ANIMATION = {
  initial: { opacity: 0, y: 30 },
  animate: { opacity: 1, y: 0 },
  transition: {
    duration: ANIMATION_DURATIONS.entrance / 1000,
    ease: "easeOut",
  },
} as const;

/**
 * Staggered entrance animation with delay
 */
export const createStaggeredEntrance = (delay: number = 0.1) => ({
  initial: { opacity: 0, y: 30 },
  animate: { opacity: 1, y: 0 },
  transition: {
    duration: ANIMATION_DURATIONS.entrance / 1000,
    delay,
    ease: "easeOut",
  },
});

/**
 * Standard CSS transition for theme-aware elements
 * Used in Mantine component styles
 */
export const STANDARD_CSS_TRANSITION = `all ${ANIMATION_DURATIONS.theme}ms ease`;

/**
 * Hover transition for theme-aware elements
 * Used in Mantine component styles
 */
export const HOVER_CSS_TRANSITION = `all ${ANIMATION_DURATIONS.hover}ms ease`;

/**
 * Animation variants for different interaction types
 */
export const ANIMATION_VARIANTS = {
  /** Standard card hover with lift */
  cardHover: {
    whileHover: STANDARD_HOVER_ANIMATION,
    whileTap: STANDARD_TAP_ANIMATION,
  },

  /** Button hover with minimal scale */
  buttonHover: {
    whileHover: BUTTON_HOVER_ANIMATION,
    whileTap: STANDARD_TAP_ANIMATION,
  },

  /** Icon hover with scale and rotation */
  iconHover: {
    whileHover: ICON_HOVER_ANIMATION,
    whileTap: {
      scale: 0.95,
      transition: { duration: 0.1, ease: STANDARD_EASING },
    },
  },

  /** Tag/chip hover with subtle scale */
  tagHover: {
    whileHover: {
      scale: 1.05,
      transition: {
        duration: ANIMATION_DURATIONS.hover / 1000,
        ease: STANDARD_EASING,
      },
    },
    whileTap: STANDARD_TAP_ANIMATION,
  },
} as const;

/**
 * Mantine component style overrides to prevent transform conflicts
 * Always use this pattern when combining Framer Motion with Mantine
 */
export const MANTINE_MOTION_STYLES = {
  root: {
    transition: HOVER_CSS_TRANSITION,
    "&:hover": {
      transform: "none !important", // Critical: Let Framer Motion handle transforms
    },
  },
} as const;

/**
 * Creates a standardized Mantine button style with theme awareness
 */
export const createThemeAwareButtonStyle = (color: string) => ({
  root: {
    backgroundColor: color,
    color: "white",
    border: "none",
    fontWeight: 600,
    transition: HOVER_CSS_TRANSITION,
    "&:hover": {
      backgroundColor: color,
      opacity: 0.8,
      transform: "none !important",
    },
  },
});

/**
 * Creates a standardized floating card style
 */
export const createFloatingCardStyle = () => ({
  backgroundColor: "var(--card)",
  borderColor: "var(--border)",
  transition: STANDARD_CSS_TRANSITION,
});

/**
 * Intersection Observer options for scroll-based animations
 */
export const SCROLL_ANIMATION_OPTIONS = {
  threshold: 0.1,
  rootMargin: "0px 0px -50px 0px",
} as const;

/**
 * Hook for creating consistent scroll-based animations
 * Use this pattern across all pages for entrance animations
 */
export const createScrollAnimationHook = () => {
  return {
    observerOptions: SCROLL_ANIMATION_OPTIONS,
    entranceAnimation: ENTRANCE_ANIMATION,
    createStaggered: createStaggeredEntrance,
  };
};
