"use client";

import { Card, Text, Stack, Group } from "@mantine/core";
import { motion } from "framer-motion";
import { forwardRef, ReactNode } from "react";
import {
  ANIMATION_VARIANTS,
  STANDARD_CSS_TRANSITION,
} from "@/lib/animation-utils";

/**
 * Props for the FeatureCard component
 * Matches the light blue/gray gradient aesthetic from the reference
 */
export interface FeatureCardProps {
  /** Card title */
  title: string;
  /** Card description */
  description: string;
  /** Visual content (logos, images, etc.) */
  visual?: ReactNode;
  /** Background gradient variant */
  variant?: "blue" | "gray" | "purple" | "teal";
  /** Enable hover lift animation */
  hoverLift?: boolean;
  /** Additional content to render in the card */
  children?: ReactNode;
  /** Click handler */
  onClick?: () => void;
  /** Custom className */
  className?: string;
}

/**
 * Background gradient variants matching the reference aesthetic
 */
const gradientVariants = {
  blue: "var(--gradient-education)",
  gray: "var(--gradient-contact)",
  purple: "var(--gradient-hero)",
  teal: "var(--gradient-innovation)",
};

/**
 * FeatureCard component with light gradient background
 *
 * Features:
 * - Light blue/gray gradient backgrounds
 * - Clean, minimal text-focused design
 * - Generous whitespace and padding
 * - Soft rounded corners
 * - Visual content integration
 * - Muted, professional color palette
 *
 * @example
 * ```tsx
 * <FeatureCard
 *   title="Built for Enterprise Security"
 *   description="Comprehensive security framework meeting SOC 2, ISO 27001, GDPR, and stringent AI compliance standards."
 *   variant="blue"
 *   visual={<SecurityBadges />}
 *   hoverLift
 * />
 * ```
 */
export const FeatureCard = forwardRef<HTMLDivElement, FeatureCardProps>(
  (
    {
      title,
      description,
      visual,
      variant = "blue",
      hoverLift = false,
      children,
      onClick,
      className,
      ...props
    },
    ref
  ) => {
    const CardContent = (
      <Card
        ref={ref}
        className={`${className} transition-all duration-300`}
        onClick={onClick}
        styles={{
          root: {
            background: gradientVariants[variant],
            border: "1px solid rgba(255, 255, 255, 0.2)",
            borderRadius: "1.5rem", // 24px for soft, modern appearance
            padding: "2.5rem", // 40px generous padding
            boxShadow: "0 4px 16px rgba(0, 0, 0, 0.04)", // Very subtle shadow
            transition: STANDARD_CSS_TRANSITION,
            cursor: onClick ? "pointer" : "default",
            minHeight: "280px", // Ensure consistent card height
            display: "flex",
            flexDirection: "column",
            "&:hover": {
              boxShadow: hoverLift
                ? "0 12px 32px rgba(0, 0, 0, 0.08)"
                : "0 4px 16px rgba(0, 0, 0, 0.04)",
              borderColor: "rgba(255, 255, 255, 0.3)",
              transform: "none !important", // Let Framer Motion handle transforms
            },
          },
        }}
        {...props}
      >
        <Stack gap="xl" style={{ height: "100%" }}>
          {/* Content Section */}
          <Stack gap="md" style={{ flex: 1 }}>
            <Text
              size="xl"
              fw={600}
              style={{
                color: "var(--foreground)",
                lineHeight: 1.3,
                fontSize: "1.375rem", // 22px
              }}
            >
              {title}
            </Text>

            <Text
              size="md"
              style={{
                color: "var(--muted-foreground)",
                lineHeight: 1.6,
                fontSize: "0.95rem", // 15px
                opacity: 0.8,
              }}
            >
              {description}
            </Text>
          </Stack>

          {/* Visual Section */}
          {visual && (
            <div
              style={{
                marginTop: "auto",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                minHeight: "80px",
              }}
            >
              {visual}
            </div>
          )}

          {/* Additional Content */}
          {children}
        </Stack>
      </Card>
    );

    // Wrap with motion.div if hoverLift is enabled
    if (hoverLift) {
      return (
        <motion.div {...ANIMATION_VARIANTS.cardHover}>{CardContent}</motion.div>
      );
    }

    return CardContent;
  }
);

FeatureCard.displayName = "FeatureCard";
