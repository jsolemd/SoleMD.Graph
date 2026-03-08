"use client";

import { Button, ButtonProps } from "@mantine/core";
import { motion } from "framer-motion";
import { forwardRef } from "react";
import {
  ANIMATION_VARIANTS,
  HOVER_CSS_TRANSITION,
} from "@/lib/animation-utils";

/**
 * PillButton variant types based on SoleMD brand system
 */
export type PillButtonVariant =
  | "primary"
  | "secondary"
  | "innovation"
  | "education"
  | "action"
  | "contact";

/**
 * PillButton size variants with appropriate padding and font sizes
 */
export type PillButtonSize = "sm" | "md" | "lg" | "xl";

/**
 * Props for the PillButton component
 * Extends Mantine's ButtonProps with brand-specific enhancements
 */
export interface PillButtonProps extends Omit<ButtonProps, "size" | "variant"> {
  /** Button variant determining background color and theme */
  variant?: PillButtonVariant;
  /** Button size with appropriate padding and font sizes */
  size?: PillButtonSize;
  /** Enable Framer Motion hover and tap animations */
  animated?: boolean;
  /** Reserve space for future Lottie animation integration */
  withLottieIcon?: boolean;
  /** Icon position for future Lottie integration */
  lottiePosition?: "left" | "right";
}

/**
 * Size configuration mapping for padding and font sizes
 */
const sizeConfig: Record<
  PillButtonSize,
  {
    padding: string;
    fontSize: string;
    height: string;
    minWidth: string;
  }
> = {
  sm: {
    padding: "0.25rem 0.75rem", // 4px 12px - tight like the black button
    fontSize: "0.875rem", // 14px
    height: "1.75rem", // 28px - minimal height
    minWidth: "2.5rem", // 40px - just enough
  },
  md: {
    padding: "0.375rem 1rem", // 6px 16px - tight like the black button
    fontSize: "1rem", // 16px
    height: "2rem", // 32px - much shorter
    minWidth: "3rem", // 48px - minimal
  },
  lg: {
    padding: "0.5rem 1.25rem", // 8px 20px - tight like the black button
    fontSize: "1.125rem", // 18px
    height: "2.25rem", // 36px - much shorter
    minWidth: "3.5rem", // 56px - minimal
  },
  xl: {
    padding: "0.625rem 1.5rem", // 10px 24px - tight like the black button
    fontSize: "1.25rem", // 20px
    height: "2.75rem", // 44px - much shorter, sleek
    minWidth: "4rem", // 64px - minimal
  },
};

/**
 * Variant styles mapping for background colors and hover states
 * Uses CSS custom properties from the SoleMD brand system
 */
const variantStyles: Record<
  PillButtonVariant,
  {
    backgroundColor: string;
    backgroundColorHover: string;
    color: string;
    colorHover?: string;
    borderColor?: string;
    borderColorHover?: string;
  }
> = {
  primary: {
    backgroundColor: "var(--color-soft-blue)",
    backgroundColorHover: "var(--color-accent-sky-blue)",
    color: "white",
  },
  secondary: {
    backgroundColor: "transparent",
    backgroundColorHover: "var(--color-soft-blue)",
    color: "var(--color-soft-blue)",
    colorHover: "white",
    borderColor: "var(--color-soft-blue)",
    borderColorHover: "var(--color-accent-sky-blue)",
  },
  innovation: {
    backgroundColor: "var(--color-golden-yellow)",
    backgroundColorHover: "var(--accent-innovation-hover)",
    color: "white",
  },
  education: {
    backgroundColor: "var(--color-fresh-green)",
    backgroundColorHover: "var(--accent-education-hover)",
    color: "white",
  },
  action: {
    backgroundColor: "var(--color-warm-coral)",
    backgroundColorHover: "var(--accent-action-hover)",
    color: "white",
  },
  contact: {
    backgroundColor: "var(--color-soft-pink)",
    backgroundColorHover: "var(--accent-contact-hover)",
    color: "white",
  },
};

/**
 * PillButton component implementing the SoleMD brand system
 *
 * Features:
 * - Pill-shaped design with 2rem border radius using Mantine UI
 * - Framer Motion hover effects (scale: 1.02, y: -1px) and tap feedback (scale: 0.98)
 * - Variant support for all brand themes using Tailwind CSS v4
 * - Size variants (sm, md, lg, xl) with appropriate padding and font sizes
 * - Accessibility features including focus states and reduced motion support
 * - Future-ready for Lottie animation CTA integration
 *
 * @example
 * ```tsx
 * <PillButton variant="innovation" size="lg" animated>
 *   Get Started
 * </PillButton>
 * ```
 */
export const PillButton = forwardRef<HTMLButtonElement, PillButtonProps>(
  (
    {
      variant = "primary",
      size = "md",
      animated = true,
      withLottieIcon = false,
      lottiePosition = "left",
      children,
      className = "",
      style,
      disabled,
      ...props
    },
    ref
  ) => {
    const sizeStyle = sizeConfig[size] || sizeConfig.md;
    const variantStyle = variantStyles[variant] || variantStyles.primary;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Framer Motion's motion() wrapper requires any for Mantine Button compatibility
    const MotionButton = motion(Button as any);

    return (
      <MotionButton
        ref={ref}
        className={className}
        disabled={disabled}
        {...(animated ? ANIMATION_VARIANTS.buttonHover : {})}
        whileHover={
          !disabled && animated
            ? ANIMATION_VARIANTS.buttonHover.whileHover
            : undefined
        }
        whileTap={
          !disabled && animated
            ? ANIMATION_VARIANTS.buttonHover.whileTap
            : undefined
        }
        style={{
          backgroundColor: variantStyle.backgroundColor,
          color: variantStyle.color,
          border: variantStyle.borderColor
            ? `1px solid ${variantStyle.borderColor}`
            : "none",
          borderRadius: "2rem", // Pill-shaped design
          padding: sizeStyle.padding,
          fontSize: sizeStyle.fontSize,
          height: sizeStyle.height,
          minWidth: sizeStyle.minWidth,
          fontWeight: 400,
          fontFamily: "var(--font-family)",
          boxShadow: "var(--shadow-subtle)",
          transition: animated ? HOVER_CSS_TRANSITION : undefined,
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.6 : 1,
          // Reserve space for future Lottie integration
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: withLottieIcon ? "0.5rem" : "0",
          ...style,
        }}
        onMouseEnter={(e: React.MouseEvent<HTMLButtonElement>) => {
          if (!disabled && animated) {
            const element = e.currentTarget;
            element.style.backgroundColor = variantStyle.backgroundColorHover;
            element.style.boxShadow = "var(--shadow-medium)";
            if (variantStyle.borderColorHover) {
              element.style.borderColor = variantStyle.borderColorHover;
            }
            if (variantStyle.colorHover) {
              element.style.color = variantStyle.colorHover;
            }
          }
        }}
        onMouseLeave={(e: React.MouseEvent<HTMLButtonElement>) => {
          if (!disabled && animated) {
            const element = e.currentTarget;
            element.style.backgroundColor = variantStyle.backgroundColor;
            element.style.boxShadow = "var(--shadow-subtle)";
            if (variantStyle.borderColor) {
              element.style.borderColor = variantStyle.borderColor;
            }
            if (variantStyle.colorHover) {
              element.style.color = variantStyle.color;
            }
          }
        }}
        styles={{
          root: {
            // Accessibility: Focus states
            "&:focus-visible": {
              outline: `2px solid ${variantStyle.backgroundColor}`,
              outlineOffset: "2px",
              boxShadow: `0 0 0 3px ${variantStyle.backgroundColor}33`,
            },
            // Reduced motion support
            "@media (prefers-reduced-motion: reduce)": {
              transition: "none",
            },
            // Ensure minimum touch target size (44px)
            minHeight: size === "sm" ? "44px" : sizeStyle.height,
            // Prevent transform conflicts with Framer Motion
            "&:hover": {
              transform: "none !important",
            },
            "&:active": {
              transform: "none !important",
            },
          },
        }}
        {...props}
      >
        {/* Future Lottie icon placeholder */}
        {withLottieIcon && lottiePosition === "left" && (
          <span
            style={{
              width: "1rem",
              height: "1rem",
              display: "inline-block",
              // Placeholder for future Lottie animation
            }}
          />
        )}

        {children}

        {/* Future Lottie icon placeholder */}
        {withLottieIcon && lottiePosition === "right" && (
          <span
            style={{
              width: "1rem",
              height: "1rem",
              display: "inline-block",
              // Placeholder for future Lottie animation
            }}
          />
        )}
      </MotionButton>
    );
  }
);

PillButton.displayName = "PillButton";
