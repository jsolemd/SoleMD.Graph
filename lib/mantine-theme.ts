/**
 * SoleMD Mantine Theme Configuration
 * Integrates with the brand color system and CSS custom properties
 * Implements dynamic light/dark mode gradient switching
 */

import {
  createTheme,
  MantineColorsTuple,
  CSSVariablesResolver,
} from "@mantine/core";

// SoleMD Brand Color System - Mantine Color Tuples
// Aligned with the comprehensive brand color system in globals.css

const brand: MantineColorsTuple = [
  "#eef3f9", // Lightest Blue
  "#dce7f4", // Lighter Blue
  "#c9dcef", // Light Blue
  "#a8c5e9", // Soft Blue - Primary brand color
  "#92b3d7", // Medium Blue
  "#7c9fc5", // Darker Blue
  "#668bb3", // Dark Blue
  "#5077a1", // Very Dark Blue
  "#3a638f", // Darkest Blue
  "#244f7d", // Deepest Blue
];

const innovation: MantineColorsTuple = [
  "#fff8e1", // Light background (innovation-50)
  "#fff3c4", // Very light (innovation-100)
  "#ffed9f", // Light (innovation-200)
  "#ffe775", // Medium light (innovation-300)
  "#fbb44e", // Golden Yellow - Innovation accent (innovation-400)
  "#f5a623", // Medium (innovation-500)
  "#e09900", // Medium dark (innovation-600)
  "#cc8800", // Dark (innovation-700)
  "#b37700", // Darker (innovation-800)
  "#996600", // Darkest (innovation-900)
];

const education: MantineColorsTuple = [
  "#f0f9e8", // Light background (education-50)
  "#e1f3d1", // Very light (education-100)
  "#d2edba", // Light (education-200)
  "#c3e7a3", // Medium light (education-300)
  "#aedc93", // Fresh Green - Education accent (education-400)
  "#9bd082", // Medium (education-500)
  "#88c471", // Medium dark (education-600)
  "#75b860", // Dark (education-700)
  "#62ac4f", // Darker (education-800)
  "#4fa03e", // Darkest (education-900)
];

const action: MantineColorsTuple = [
  "#fff5f5", // Light background (action-50)
  "#ffe3e3", // Very light (action-100)
  "#ffd1d1", // Light (action-200)
  "#ffbfbf", // Medium light (action-300)
  "#ffada4", // Warm Coral - Action accent (action-400)
  "#ff9b92", // Medium (action-500)
  "#ff8980", // Medium dark (action-600)
  "#ff776e", // Dark (action-700)
  "#ff655c", // Darker (action-800)
  "#ff534a", // Darkest (action-900)
];

const contact: MantineColorsTuple = [
  "#fdf2f8", // Light background (contact-50)
  "#fce7f3", // Very light (contact-100)
  "#fbdcee", // Light (contact-200)
  "#f9d1e9", // Medium light (contact-300)
  "#eda8c4", // Soft Pink - Contact accent (contact-400)
  "#e79db9", // Medium (contact-500)
  "#e192ae", // Medium dark (contact-600)
  "#db87a3", // Dark (contact-700)
  "#d57c98", // Darker (contact-800)
  "#cf718d", // Darkest (contact-900)
];

const neutral: MantineColorsTuple = [
  "#fafafa", // Background canvas (neutral-50)
  "#f5f5f5", // Very light (neutral-100)
  "#e5e5e5", // Light border (neutral-200)
  "#d1d5db", // Medium light (neutral-300)
  "#9ca3af", // Medium (neutral-400)
  "#747caa", // Muted Indigo - Primary text (neutral-500)
  "#6b7280", // Medium dark (neutral-600)
  "#4b5563", // Dark (neutral-700)
  "#374151", // Darker (neutral-800)
  "#1f2937", // Darkest (neutral-900)
];

/**
 * SoleMD Mantine Theme Configuration
 * Implements brand color palettes with Inter font family
 * Optimized for Tailwind CSS v4 + Mantine v8.1.3 integration
 * Uses CSS custom properties for seamless theme synchronization
 */
export const theme = createTheme({
  // Primary brand color configuration
  primaryColor: "brand",
  primaryShade: { light: 3, dark: 3 }, // Soft Blue in both light and dark modes

  // Complete Brand Color System Integration
  colors: {
    // Primary Brand Colors - Soft Lavender system
    brand,

    // Semantic Theme Colors for different sections
    innovation, // Golden Yellow system for innovation/consulting
    education, // Fresh Green system for learning/education
    action, // Warm Coral system for engagement/CTAs
    contact, // Soft Pink system for contact/personal touch

    // Neutral system for text and UI elements
    neutral,

    // Legacy compatibility - mapped to new brand system
    solemPurple: brand,
    solemOrange: innovation,
    solemGreen: education,

    // Additional utility colors
    solemTeal: [
      "var(--color-accent-teal-green)",
      "var(--color-accent-teal-green)",
      "var(--color-accent-teal-green)",
      "var(--color-accent-teal-green)",
      "var(--color-accent-teal-green)",
      "var(--color-accent-teal-green)",
      "var(--color-accent-teal-green)",
      "var(--color-accent-teal-green)",
      "var(--color-accent-teal-green)",
      "var(--color-accent-teal-green)",
    ],
    solemBlue: [
      "var(--color-soft-blue)",
      "var(--color-soft-blue)",
      "var(--color-soft-blue)",
      "var(--color-soft-blue)",
      "var(--color-soft-blue)",
      "var(--color-soft-blue)",
      "var(--color-soft-blue)",
      "var(--color-soft-blue)",
      "var(--color-soft-blue)",
      "var(--color-soft-blue)",
    ],
    solemCyan: [
      "var(--color-accent-sky-blue)",
      "var(--color-accent-sky-blue)",
      "var(--color-accent-sky-blue)",
      "var(--color-accent-sky-blue)",
      "var(--color-accent-sky-blue)",
      "var(--color-accent-sky-blue)",
      "var(--color-accent-sky-blue)",
      "var(--color-accent-sky-blue)",
      "var(--color-accent-sky-blue)",
      "var(--color-accent-sky-blue)",
    ],

    // Gray system using brand neutral colors
    gray: neutral,
  },

  // Typography System - Inter font family integration
  fontFamily:
    "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  headings: {
    fontFamily:
      "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
    fontWeight: "500", // Medium weight for headings
    sizes: {
      h1: { fontSize: "2.5rem", lineHeight: "1.2" },
      h2: { fontSize: "2rem", lineHeight: "1.25" },
      h3: { fontSize: "1.75rem", lineHeight: "1.3" },
      h4: { fontSize: "1.5rem", lineHeight: "1.35" },
      h5: { fontSize: "1.25rem", lineHeight: "1.4" },
      h6: { fontSize: "1.125rem", lineHeight: "1.45" },
    },
  },

  // Universal Rounded Corner System
  radius: {
    xs: "0.25rem", // 4px
    sm: "0.5rem", // 8px
    md: "0.75rem", // 12px
    lg: "1rem", // 16px
    xl: "1.5rem", // 24px
    "2xl": "2rem", // 32px - Brand standard for cards and buttons
  },
  defaultRadius: "2xl", // Universal 32px rounded corners

  // Spacing System
  spacing: {
    xs: "0.5rem", // 8px
    sm: "0.75rem", // 12px
    md: "1rem", // 16px
    lg: "1.25rem", // 20px
    xl: "1.5rem", // 24px
    "2xl": "2rem", // 32px
    "3xl": "3rem", // 48px
    "4xl": "4rem", // 64px
    "5xl": "5rem", // 80px
    "6xl": "6rem", // 96px - Section spacing
  },

  // Brand Floating Depth System
  shadows: {
    xs: "0 2px 8px rgba(116, 124, 170, 0.08)", // Subtle
    sm: "0 4px 16px rgba(116, 124, 170, 0.10)", // Medium
    md: "0 8px 32px rgba(116, 124, 170, 0.12)", // Floating
    lg: "0 16px 48px rgba(116, 124, 170, 0.18)", // Floating hover
    xl: "0 12px 40px rgba(116, 124, 170, 0.15)", // Strong
  },

  // Component Defaults - Brand Standards
  components: {
    Button: {
      defaultProps: {
        radius: "2xl",
        size: "md",
      },
      styles: {
        root: {
          fontWeight: 400,
          transition: "all 200ms ease",
        },
      },
    },
    Card: {
      defaultProps: {
        radius: "2xl",
        shadow: "md",
        padding: "xl",
      },
    },
    TextInput: {
      defaultProps: {
        radius: "2xl",
        size: "md",
      },
    },
    Select: {
      defaultProps: {
        radius: "2xl",
        size: "md",
      },
    },
    Textarea: {
      defaultProps: {
        radius: "2xl",
        size: "md",
      },
    },
    Modal: {
      defaultProps: {
        radius: "2xl",
        shadow: "xl",
      },
    },
    Paper: {
      defaultProps: {
        radius: "2xl",
        shadow: "sm",
        padding: "md",
      },
    },
    ActionIcon: {
      defaultProps: {
        radius: "2xl",
        size: "md",
      },
    },
    Notification: {
      defaultProps: {
        radius: "2xl",
      },
    },
    Badge: {
      defaultProps: {
        radius: "2xl",
      },
    },
  },

  // Responsive Breakpoints - Mobile-first approach
  breakpoints: {
    xs: "30em", // 480px
    sm: "48em", // 768px
    md: "64em", // 1024px
    lg: "74em", // 1184px
    xl: "90em", // 1440px
  },

  // Other theme properties
  white: "#ffffff",
  black: "#000000",
  defaultGradient: {
    from: "brand.3",
    to: "brand.5",
    deg: 135,
  },
});

/**
 * CSS Variables Resolver for Dynamic Light/Dark Mode Gradient Switching
 * Provides seamless integration between Mantine and Tailwind CSS v4
 * Implements the complete SoleMD brand color system with CSS custom properties
 */
export const cssVariablesResolver: CSSVariablesResolver = (theme) => ({
  variables: {
    // Core Layout System
    "--section-spacing": "6rem",
    "--card-spacing": "3rem",
    "--container-max-width": "1200px",

    // Brand Color System - Core Colors
    "--brand-primary": "#a8c5e9", // Soft Blue
    "--brand-secondary": "#747caa", // Muted Indigo
    "--brand-core": "#a8c5e9", // Soft Blue
    "--brand-gray": "#777c7e", // Core Gray

    // Semantic Theme Colors
    "--accent-innovation": "#fbb44e", // Golden Yellow
    "--accent-education": "#aedc93", // Fresh Green
    "--accent-action": "#ffada4", // Warm Coral
    "--accent-contact": "#eda8c4", // Soft Pink

    // Typography System Integration
    "--font-family": theme.fontFamily,
    "--font-family-headings": theme.headings.fontFamily,
    "--font-weight-normal": "400",
    "--font-weight-medium": "500",
    "--font-weight-semibold": "600",

    // Universal Rounded Corner System
    "--border-radius-card": theme.radius["2xl"],
    "--border-radius-button": theme.radius["2xl"],
    "--border-radius-input": theme.radius["2xl"],
    "--border-radius-modal": theme.radius["2xl"],

    // Spacing System
    "--spacing-xs": theme.spacing.xs,
    "--spacing-sm": theme.spacing.sm,
    "--spacing-md": theme.spacing.md,
    "--spacing-lg": theme.spacing.lg,
    "--spacing-xl": theme.spacing.xl,
    "--spacing-2xl": theme.spacing["2xl"],
    "--spacing-3xl": theme.spacing["3xl"],
    "--spacing-6xl": theme.spacing["6xl"],

    // Shadow System Base
    "--shadow-color-base": "116, 124, 170",
  },
  light: {
    // Light Mode Brand Gradients - Dynamic switching
    "--gradient-hero": "linear-gradient(135deg, #fafafa 0%, #a8c5e9 100%)",
    "--gradient-innovation":
      "linear-gradient(135deg, #fbb44e 0%, #ffc245 100%)",
    "--gradient-education": "linear-gradient(135deg, #aedc93 0%, #a7eac4 100%)",
    "--gradient-action": "linear-gradient(135deg, #ffada4 0%, #f4a7a3 100%)",
    "--gradient-contact": "linear-gradient(135deg, #eda8c4 0%, #e38ddd 100%)",

    // Light Mode Semantic Colors
    "--background-canvas": "#fafafa",
    "--foreground-primary": "#000000",
    "--foreground-secondary": "#747caa",
    "--card-background": "#ffffff",
    "--border-color": "#e5e5e5",
    "--border-color-hover": "#a8c5e9",

    // Light Mode Shadows
    "--shadow-floating": "0 8px 32px rgba(var(--shadow-color-base), 0.12)",
    "--shadow-floating-hover":
      "0 16px 48px rgba(var(--shadow-color-base), 0.18)",
    "--shadow-subtle": "0 2px 8px rgba(var(--shadow-color-base), 0.08)",
    "--shadow-medium": "0 4px 16px rgba(var(--shadow-color-base), 0.10)",
    "--shadow-strong": "0 12px 40px rgba(var(--shadow-color-base), 0.15)",

    // Light Mode Brand Color Variants
    "--brand-primary-hover": "#c8a5e0",
    "--accent-innovation-hover": "#f5a623",
    "--accent-education-hover": "#9bd082",
    "--accent-action-hover": "#ff9b92",
    "--accent-contact-hover": "#e79db9",
  },
  dark: {
    // Dark Mode Brand Gradients - Dynamic switching
    "--gradient-hero": "linear-gradient(135deg, #1c1c1f 0%, #89a3bf 100%)",
    "--gradient-innovation":
      "linear-gradient(135deg, #b68e45 0%, #b99736 100%)",
    "--gradient-education": "linear-gradient(135deg, #7f9f70 0%, #73b28e 100%)",
    "--gradient-action": "linear-gradient(135deg, #b77e78 0%, #b97672 100%)",
    "--gradient-contact": "linear-gradient(135deg, #a87490 0%, #b873b6 100%)",

    // Dark Mode Semantic Colors
    "--background-canvas": "#1c1c1f",
    "--foreground-primary": "#cacaca",
    "--foreground-secondary": "#616789",
    "--card-background": "#2a2a2f",
    "--border-color": "#3a3a3f",
    "--border-color-hover": "#89a3bf",

    // Dark Mode Shadows
    "--shadow-floating": "0 8px 32px rgba(0, 0, 0, 0.8)",
    "--shadow-floating-hover": "0 16px 48px rgba(0, 0, 0, 0.9)",
    "--shadow-subtle": "0 2px 8px rgba(0, 0, 0, 0.6)",
    "--shadow-medium": "0 4px 16px rgba(0, 0, 0, 0.7)",
    "--shadow-strong": "0 12px 40px rgba(0, 0, 0, 0.8)",

    // Dark Mode Brand Color Variants
    "--brand-primary-hover": "#a896b5",
    "--accent-innovation-hover": "#c19a52",
    "--accent-education-hover": "#8ba87c",
    "--accent-action-hover": "#c28a84",
    "--accent-contact-hover": "#b3809c",
  },
});

/**
 * Type definition for the SoleMD theme
 * Provides type safety for theme customization and component styling
 *
 * @example
 * ```tsx
 * import { SoleMDTheme } from '@/lib/mantine-theme';
 *
 * const customStyles = (theme: SoleMDTheme) => ({
 *   root: {
 *     backgroundColor: theme.colors.brand[4],
 *     color: theme.colors.gray[0],
 *   }
 * });
 * ```
 */
export type SoleMDTheme = typeof theme;

/**
 * Legacy export for backward compatibility
 * @deprecated Use `theme` export instead
 */
export const solemTheme = theme;
