"use client";

import React from "react";
import { motion } from "framer-motion";
import { usePathname } from "next/navigation";
import { getCurrentPageColor } from "@/lib/utils";
import { ANIMATION_VARIANTS } from "@/lib/animation-utils";

export interface FloatingCardBaseProps {
  title: string;
  description: string;
  /** Icon component to render */
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  className?: string;
  children?: React.ReactNode;
  /** Use dynamic page color for icon background */
  usePageColor?: boolean;
  /** Provide custom icon background color */
  customIconColor?: string;
  /** Additional element rendered inside the card container */
  extra?: React.ReactNode;
}

/**
 * Shared floating card markup used by FloatingCard and FloatingCardArrow.
 */
export default function FloatingCardBase({
  title,
  description,
  icon: Icon,
  className = "",
  children,
  usePageColor = true,
  customIconColor,
  extra,
}: FloatingCardBaseProps) {
  const pathname = usePathname();

  const iconBackgroundColor =
    customIconColor ||
    (usePageColor ? getCurrentPageColor(pathname) : "var(--color-soft-blue)");

  return (
    <motion.div
      {...ANIMATION_VARIANTS.cardHover}
      className={`h-full ${className}`}
    >
      <div
        className="floating-card p-8 h-full relative"
        style={{
          backgroundColor: "var(--card)",
          borderColor: "var(--border)",
          transition: "all 300ms ease",
        }}
      >
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center mb-6"
          style={{ backgroundColor: iconBackgroundColor }}
        >
          <Icon className="h-6 w-6 text-white" />
        </div>
        {extra}
        <div className="flex flex-col h-full text-flow-natural">
          <h3 className="text-card-title mb-3" style={{ color: "var(--foreground)" }}>
            {title}
          </h3>
          <p
            className="text-body-small text-opacity-muted flex-1"
            style={{ color: "var(--foreground)" }}
          >
            {description}
          </p>
          {children && <div className="mt-4">{children}</div>}
        </div>
      </div>
    </motion.div>
  );
}
