"use client";

import { motion } from "framer-motion";
import { LucideIcon } from "lucide-react";
import { forwardRef } from "react";
import {
  ANIMATION_VARIANTS,
  HOVER_CSS_TRANSITION,
} from "@/lib/animation-utils";

/**
 * Semantic color options for FeatureIcon
 * Maps to SoleMD's content categories and design system
 */
export type FeatureIconColor =
  | "teal" // Research content, scientific authority, neuroscience topics
  | "purple" // Primary brand identity, SoleMD mentions, primary CTAs
  | "blue" // General actions, about sections, informational content
  | "green" // Medical expertise, success states, clinical content
  | "orange" // Neural circuits, energy themes, dynamic content
  | "cyan"; // AI/technology themes, artificial intelligence mentions

/**
 * Size variants for FeatureIcon
 */
export type FeatureIconSize = "sm" | "md" | "lg";

/**
 * Props for the FeatureIcon component
 */
export interface FeatureIconProps {
  /** Lucide icon component to render */
  icon: LucideIcon;
  /** Semantic color theme */
  color?: FeatureIconColor;
  /** Size variant */
  size?: FeatureIconSize;
  /** Enable hover effects with rotation and scale */
  hoverEffects?: boolean;
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
  sm: { container: 40, icon: 20, borderRadius: "0.75rem" },
  md: { container: 48, icon: 24, borderRadius: "1rem" },
  lg: { container: 56, icon: 28, borderRadius: "1.25rem" },
};

/**
 * FeatureIcon component - High-emphasis colored icon squares
 *
 * Primary visual anchors for feature cards with solid colored backgrounds
 * and white icon graphics. Uses semantic color system for content categorization.
 *
 * Features:
 * - Solid colored square container with rounded corners
 * - White Lucide icon centered within container
 * - Semantic color mapping for different content types
 * - Optional hover effects with subtle rotation and scale
 * - Three size variants (sm, md, lg)
 * - Full accessibility support
 *
 * @example
 * ```tsx
 * <FeatureIcon
 *   icon={Brain}
 *   color="teal"
 *   size="md"
 *   hoverEffects
 *   aria-label="Neuroscience research"
 * />
 * ```
 */
export const FeatureIcon = forwardRef<HTMLDivElement, FeatureIconProps>(
  (
    {
      icon: Icon,
      color = "purple",
      size = "md",
      hoverEffects = false,
      className = "",
      onClick,
      "aria-label": ariaLabel,
      ...props
    },
    ref
  ) => {
    const config = sizeConfig[size];

    const containerStyle = {
      width: config.container,
      height: config.container,
      backgroundColor: `var(--c-${color}-border)`,
      borderRadius: config.borderRadius,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      transition: HOVER_CSS_TRANSITION,
      cursor: onClick ? "pointer" : "default",
      // Ensure proper contrast for accessibility
      boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
    };

    const IconContent = (
      <div
        ref={ref}
        style={containerStyle}
        className={className}
        onClick={onClick}
        role={onClick ? "button" : undefined}
        tabIndex={onClick ? 0 : undefined}
        aria-label={ariaLabel}
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
        <Icon
          size={config.icon}
          color="white"
          strokeWidth={2}
          aria-hidden="true"
        />
      </div>
    );

    // Wrap with motion.div if hover effects are enabled
    if (hoverEffects) {
      return (
        <motion.div {...ANIMATION_VARIANTS.iconHover}>{IconContent}</motion.div>
      );
    }

    return IconContent;
  }
);

FeatureIcon.displayName = "FeatureIcon";
