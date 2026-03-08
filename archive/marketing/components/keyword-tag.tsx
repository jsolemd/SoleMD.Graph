"use client";

import { motion } from "framer-motion";
import { forwardRef } from "react";
import {
  ANIMATION_VARIANTS,
  HOVER_CSS_TRANSITION,
} from "@/lib/animation-utils";

/**
 * Semantic color options for KeywordTag
 * Maps to SoleMD's content categories and design system
 */
export type KeywordTagColor =
  | "teal" // Research content, scientific authority, neuroscience topics
  | "purple" // Primary brand identity, SoleMD mentions, primary CTAs
  | "blue" // General actions, about sections, informational content
  | "green" // Medical expertise, success states, clinical content
  | "orange" // Neural circuits, energy themes, dynamic content
  | "cyan"; // AI/technology themes, artificial intelligence mentions

/**
 * Size variants for KeywordTag
 */
export type KeywordTagSize = "sm" | "md";

/**
 * Props for the KeywordTag component
 */
export interface KeywordTagProps {
  /** Text content to display */
  text: string;
  /** Semantic color theme */
  color?: KeywordTagColor;
  /** Size variant */
  size?: KeywordTagSize;
  /** Enable subtle hover effects */
  hoverEffects?: boolean;
  /** Show optional border */
  withBorder?: boolean;
  /** Additional CSS class name */
  className?: string;
  /** Click handler */
  onClick?: () => void;
  /** ARIA label for accessibility */
  "aria-label"?: string;
}

/**
 * Size configurations for different variants
 */
const sizeConfig = {
  sm: {
    padding: "0.375rem 0.75rem",
    fontSize: "0.75rem",
    fontWeight: 500,
    borderRadius: "1rem",
  },
  md: {
    padding: "0.5rem 1rem",
    fontSize: "0.875rem",
    fontWeight: 500,
    borderRadius: "1.5rem",
  },
};

/**
 * KeywordTag component - Low-emphasis pastel badges
 *
 * Secondary scannable information with light pastel backgrounds
 * and darker text for high contrast readability.
 *
 * Features:
 * - Light pastel background using semantic color system
 * - High contrast text for readability
 * - Rounded pill shape design
 * - Optional border for additional definition
 * - Subtle hover effects
 * - Two size variants (sm, md)
 * - Full accessibility support
 *
 * @example
 * ```tsx
 * <KeywordTag
 *   text="Computational Psychiatry"
 *   color="teal"
 *   size="md"
 *   withBorder
 *   hoverEffects
 * />
 * ```
 */
export const KeywordTag = forwardRef<HTMLSpanElement, KeywordTagProps>(
  (
    {
      text,
      color = "purple",
      size = "md",
      hoverEffects = false,
      withBorder = false,
      className = "",
      onClick,
      "aria-label": ariaLabel,
      ...props
    },
    ref
  ) => {
    const config = sizeConfig[size];

    const tagStyle = {
      display: "inline-flex",
      alignItems: "center",
      padding: config.padding,
      backgroundColor: `var(--c-${color}-bg)`,
      color: `var(--c-${color}-text)`,
      fontSize: config.fontSize,
      fontWeight: config.fontWeight,
      borderRadius: config.borderRadius,
      border: withBorder ? `1px solid var(--c-${color}-border)` : "none",
      borderColor: withBorder ? `var(--c-${color}-border)` : "transparent",
      transition: HOVER_CSS_TRANSITION,
      cursor: onClick ? "pointer" : "default",
      userSelect: "none" as const,
      // Ensure proper line height for text
      lineHeight: 1.2,
    };

    const TagContent = (
      <span
        ref={ref}
        style={tagStyle}
        className={className}
        onClick={onClick}
        role={onClick ? "button" : undefined}
        tabIndex={onClick ? 0 : undefined}
        aria-label={ariaLabel || text}
        onKeyDown={
          onClick
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onClick();
                }
              }
            : undefined
        }
        {...props}
      >
        {text}
      </span>
    );

    // Wrap with motion.span if hover effects are enabled
    if (hoverEffects) {
      return (
        <motion.span {...ANIMATION_VARIANTS.tagHover}>{TagContent}</motion.span>
      );
    }

    return TagContent;
  }
);

KeywordTag.displayName = "KeywordTag";
