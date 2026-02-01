/**
 * Design System Integration Patterns for Education Modules
 *
 * This file establishes standardized patterns for integrating education modules
 * with the SoleMD design system. These patterns ensure consistency across
 * all education modules and provide reusable styling utilities.
 */

// =============================================================================
// TYPOGRAPHY PATTERNS
// =============================================================================

/**
 * Typography Classes
 *
 * Standardized typography classes that align with SoleMD design system.
 * These classes ensure consistent text styling across all education modules.
 */
export const TypographyClasses = {
  // Hero and Main Titles
  heroTitle: "text-hero-title",
  heroSubtitle: "text-hero-subtitle",

  // Section Headings
  sectionTitle: "text-section-title",
  cardTitle: "text-card-title",

  // Body Text
  bodyLarge: "text-body-large",
  bodySmall: "text-body-small",

  // Utility Classes
  textFlowNatural: "text-flow-natural", // Prevents word stacking
} as const;

/**
 * Typography Utilities
 *
 * Helper functions for applying typography styles programmatically.
 */
export const TypographyUtils = {
  /**
   * Get typography class for a given text type
   */
  getClass: (type: keyof typeof TypographyClasses): string => {
    return TypographyClasses[type];
  },

  /**
   * Combine multiple typography classes
   */
  combine: (...types: (keyof typeof TypographyClasses)[]): string => {
    return types.map((type) => TypographyClasses[type]).join(" ");
  },

  /**
   * Apply text flow prevention (critical for preventing word stacking)
   */
  preventTextStacking: (element: HTMLElement): void => {
    element.style.wordBreak = "normal";
    element.style.overflowWrap = "normal";
    element.style.whiteSpace = "normal";
    element.style.hyphens = "none";
  },
};

// =============================================================================
// COLOR SYSTEM PATTERNS
// =============================================================================

/**
 * Education Color Palette
 *
 * Defines the color system for education modules using CSS variables
 * that automatically adapt to light/dark themes.
 */
export const EducationColors = {
  // Primary Education Color (Fresh Green)
  primary: "var(--color-fresh-green)",
  primaryLight: "var(--color-fresh-green)20", // 20% opacity
  primaryDark: "var(--color-fresh-green)80", // 80% opacity

  // Theme-aware Colors
  background: "var(--background)",
  foreground: "var(--foreground)",
  card: "var(--card)",
  border: "var(--border)",

  // Semantic Colors
  success: "var(--color-fresh-green)",
  warning: "var(--color-golden-yellow)",
  error: "var(--color-warm-coral)",
  info: "var(--color-soft-blue)",

  // Opacity Variants
  opacity: {
    subtle: "0.6",
    muted: "0.7",
    secondary: "0.8",
    primary: "1.0",
  },
} as const;

/**
 * Color Utilities
 *
 * Helper functions for working with the education color system.
 */
export const ColorUtils = {
  /**
   * Get education color with optional opacity
   */
  getEducationColor: (opacity?: string): string => {
    return opacity
      ? `${EducationColors.primary}${opacity}`
      : EducationColors.primary;
  },

  /**
   * Get theme-aware color
   */
  getThemeColor: (colorKey: keyof typeof EducationColors): string => {
    return EducationColors[colorKey] as string;
  },

  /**
   * Create color style object for React components
   */
  createColorStyle: (color: string, opacity?: string): React.CSSProperties => {
    return {
      color: opacity ? `${color}${opacity}` : color,
    };
  },

  /**
   * Create background color style object
   */
  createBackgroundStyle: (
    color: string,
    opacity?: string
  ): React.CSSProperties => {
    return {
      backgroundColor: opacity ? `${color}${opacity}` : color,
    };
  },
};

// =============================================================================
// LAYOUT PATTERNS
// =============================================================================

/**
 * Container Classes
 *
 * Standardized container classes for consistent layout patterns.
 */
export const ContainerClasses = {
  // Main Containers
  contentContainer: "content-container",
  heroContainer: "hero-container",

  // Grid Systems
  gridTwoColumn: "grid grid-cols-1 md:grid-cols-2 gap-8 sm:gap-12 lg:gap-16",
  gridThreeColumn:
    "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-8 sm:gap-12 lg:gap-16",

  // Spacing
  sectionPadding: "py-20",
  heroPadding: "pt-32 pb-32",
  cardPadding: "p-8",

  // Responsive Gaps
  responsiveGap: "gap-8 sm:gap-12 lg:gap-16",
} as const;

/**
 * Layout Utilities
 *
 * Helper functions for creating consistent layouts.
 */
export const LayoutUtils = {
  /**
   * Get container class for a given layout type
   */
  getContainerClass: (type: keyof typeof ContainerClasses): string => {
    return ContainerClasses[type];
  },

  /**
   * Create responsive grid classes
   */
  createGridClass: (columns: 1 | 2 | 3 | 4): string => {
    const gridMap = {
      1: "grid grid-cols-1 gap-8",
      2: ContainerClasses.gridTwoColumn,
      3: ContainerClasses.gridThreeColumn,
      4: "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 sm:gap-12 lg:gap-16",
    };
    return gridMap[columns];
  },

  /**
   * Create section wrapper with standard padding
   */
  createSectionWrapper: (
    id?: string
  ): React.HTMLAttributes<HTMLElement> & { "data-animate"?: boolean } => {
    return {
      className: ContainerClasses.sectionPadding,
      id,
      "data-animate": true,
    };
  },
};

// =============================================================================
// FLOATING CARD SYSTEM
// =============================================================================

/**
 * Floating Card Patterns
 *
 * Standardized patterns for the floating card system used throughout
 * SoleMD education modules.
 */
export const FloatingCardPatterns = {
  /**
   * Base floating card styles
   */
  base: {
    className: "floating-card",
    style: {
      backgroundColor: EducationColors.card,
      borderColor: EducationColors.border,
      transition: "all 300ms ease",
    },
  },

  /**
   * Interactive floating card with hover effects
   */
  interactive: {
    className: "floating-card cursor-pointer",
    style: {
      backgroundColor: EducationColors.card,
      borderColor: EducationColors.border,
      transition: "all 300ms ease",
    },
    whileHover: {
      y: -4,
      transition: { duration: 0.2, ease: [0.4, 0, 0.2, 1] },
    },
  },

  /**
   * Highlighted card with education theme
   */
  highlighted: {
    className: "floating-card",
    style: {
      backgroundColor: `${EducationColors.primary}15`,
      borderColor: `${EducationColors.primary}30`,
      transition: "all 300ms ease",
    },
  },
};

/**
 * Card Utilities
 *
 * Helper functions for creating consistent card components.
 */
export const CardUtils = {
  /**
   * Get floating card props for a given pattern
   */
  getCardProps: (pattern: keyof typeof FloatingCardPatterns) => {
    return FloatingCardPatterns[pattern];
  },

  /**
   * Create custom card props with education theme
   */
  createEducationCard: (highlighted = false) => {
    return highlighted
      ? FloatingCardPatterns.highlighted
      : FloatingCardPatterns.base;
  },

  /**
   * Create interactive card props with hover effects
   */
  createInteractiveCard: () => {
    return FloatingCardPatterns.interactive;
  },
};

// =============================================================================
// ANIMATION PATTERNS
// =============================================================================

/**
 * Animation Patterns
 *
 * Standardized Framer Motion animation patterns for education modules.
 */
export const AnimationPatterns = {
  /**
   * Standard entrance animation
   */
  entrance: {
    initial: { opacity: 0, y: 30 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.8, ease: "easeOut" },
  },

  /**
   * Staggered entrance for multiple elements
   */
  staggeredEntrance: {
    initial: { opacity: 0, y: 30 },
    animate: { opacity: 1, y: 0 },
    transition: (index: number) => ({
      duration: 0.8,
      delay: 0.1 * index,
      ease: "easeOut",
    }),
  },

  /**
   * Gentle hover effect for cards
   */
  cardHover: {
    whileHover: {
      y: -4,
      transition: { duration: 0.2, ease: [0.4, 0, 0.2, 1] },
    },
  },

  /**
   * Button hover effect
   */
  buttonHover: {
    whileHover: {
      scale: 1.02,
      y: -1,
      transition: { duration: 0.2, ease: [0.4, 0, 0.2, 1] },
    },
    whileTap: {
      scale: 0.98,
    },
  },

  /**
   * Progress bar animation
   */
  progressBar: (percentage: number) => ({
    initial: { width: 0 },
    animate: { width: `${percentage}%` },
    transition: { duration: 1, ease: "easeOut" },
  }),

  /**
   * Fade in from left
   */
  fadeInLeft: {
    initial: { opacity: 0, x: -30 },
    animate: { opacity: 1, x: 0 },
    transition: { duration: 0.8, ease: "easeOut" },
  },

  /**
   * Fade in from right
   */
  fadeInRight: {
    initial: { opacity: 0, x: 30 },
    animate: { opacity: 1, x: 0 },
    transition: { duration: 0.8, ease: "easeOut" },
  },
};

/**
 * Animation Utilities
 *
 * Helper functions for applying consistent animations.
 */
export const AnimationUtils = {
  /**
   * Get animation props for a given pattern
   */
  getAnimationProps: (pattern: keyof typeof AnimationPatterns) => {
    return AnimationPatterns[pattern];
  },

  /**
   * Create staggered animation with custom delay
   */
  createStaggered: (index: number, baseDelay = 0.1) => ({
    ...AnimationPatterns.entrance,
    transition: {
      ...AnimationPatterns.entrance.transition,
      delay: baseDelay * index,
    },
  }),

  /**
   * Create conditional animation based on visibility
   */
  createConditionalAnimation: (
    isVisible: boolean,
    pattern: keyof typeof AnimationPatterns
  ) => {
    const animationProps = AnimationPatterns[pattern];
    // Handle function patterns like progressBar
    if (typeof animationProps === "function") {
      return animationProps;
    }
    return {
      ...animationProps,
      animate: isVisible ? animationProps.animate : animationProps.initial,
    };
  },
};

// =============================================================================
// ICON PATTERNS
// =============================================================================

/**
 * Icon Patterns
 *
 * Standardized patterns for using icons in education modules.
 */
export const IconPatterns = {
  /**
   * Standard icon sizes
   */
  sizes: {
    small: "h-4 w-4",
    medium: "h-5 w-5",
    large: "h-6 w-6",
    xlarge: "h-8 w-8",
  },

  /**
   * Icon container patterns
   */
  containers: {
    circular: (size = "h-10 w-10") => ({
      className: `${size} rounded-full flex items-center justify-center`,
      style: {
        backgroundColor: `${EducationColors.primary}20`,
      },
    }),

    rounded: (size = "h-10 w-10") => ({
      className: `${size} rounded-lg flex items-center justify-center`,
      style: {
        backgroundColor: `${EducationColors.primary}20`,
      },
    }),

    badge: (size = "h-6 w-6") => ({
      className: `${size} rounded-full flex items-center justify-center`,
      style: {
        backgroundColor: EducationColors.primary,
      },
    }),
  },
};

/**
 * Icon Utilities
 *
 * Helper functions for consistent icon usage.
 */
export const IconUtils = {
  /**
   * Get icon size class
   */
  getSize: (size: keyof typeof IconPatterns.sizes): string => {
    return IconPatterns.sizes[size];
  },

  /**
   * Create icon container props
   */
  createContainer: (
    type: keyof typeof IconPatterns.containers,
    size?: string
  ) => {
    return IconPatterns.containers[type](size);
  },

  /**
   * Create education-themed icon style
   */
  createEducationIconStyle: (opacity = "1"): React.CSSProperties => {
    return {
      color: EducationColors.primary,
      opacity,
    };
  },
};

// =============================================================================
// RESPONSIVE PATTERNS
// =============================================================================

/**
 * Responsive Breakpoints
 *
 * Standardized responsive breakpoints for education modules.
 */
export const ResponsivePatterns = {
  /**
   * Breakpoint classes
   */
  breakpoints: {
    mobile: "block sm:hidden",
    tablet: "hidden sm:block lg:hidden",
    desktop: "hidden lg:block",
    mobileTablet: "block lg:hidden",
    tabletDesktop: "hidden sm:block",
  },

  /**
   * Responsive text sizes
   */
  textSizes: {
    heroTitle: "text-4xl sm:text-5xl lg:text-6xl",
    sectionTitle: "text-2xl sm:text-3xl lg:text-4xl",
    cardTitle: "text-lg sm:text-xl",
    body: "text-base sm:text-lg",
  },

  /**
   * Responsive spacing
   */
  spacing: {
    section: "py-12 sm:py-16 lg:py-20",
    hero: "py-20 sm:py-24 lg:py-32",
    card: "p-4 sm:p-6 lg:p-8",
  },
};

// =============================================================================
// ACCESSIBILITY PATTERNS
// =============================================================================

/**
 * Accessibility Patterns
 *
 * Standardized accessibility patterns for education modules.
 */
export const AccessibilityPatterns = {
  /**
   * Focus management
   */
  focus: {
    outline: "2px solid var(--color-fresh-green)",
    outlineOffset: "2px",
    borderRadius: "0.375rem",
  },

  /**
   * Screen reader utilities
   */
  screenReader: {
    srOnly: "sr-only",
    skipLink:
      "sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-white focus:text-black focus:rounded",
  },

  /**
   * ARIA patterns
   */
  aria: {
    button: {
      role: "button",
      tabIndex: 0,
    },
    navigation: {
      role: "navigation",
      "aria-label": "Module navigation",
    },
    progressbar: (value: number, max: number) => ({
      role: "progressbar",
      "aria-valuenow": value,
      "aria-valuemin": 0,
      "aria-valuemax": max,
      "aria-label": `Progress: ${value} of ${max}`,
    }),
  },
};

// =============================================================================
// EXPORT ALL PATTERNS
// =============================================================================

// All exports are already declared inline above with 'export const'
// No need for additional export statement
