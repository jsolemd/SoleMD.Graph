"use client";

import { useRef } from "react";
import { motion, useInView } from "framer-motion";
import { Text, Title } from "@mantine/core";
import type { ModuleAccent } from "@/features/wiki/module-runtime/types";
import {
  usePrefersReducedMotion,
  sectionReveal,
  sectionRevealReduced,
} from "@/features/wiki/module-runtime/motion";
import { accentCssVar } from "@/features/wiki/module-runtime/tokens";

interface SceneSectionProps {
  id: string;
  title?: string;
  subtitle?: string;
  accent?: ModuleAccent;
  children: React.ReactNode;
  className?: string;
}

export function SceneSection({
  id,
  title,
  subtitle,
  accent,
  children,
  className,
}: SceneSectionProps) {
  const ref = useRef<HTMLElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-10% 0px" });
  const reduced = usePrefersReducedMotion();
  const variants = reduced ? sectionRevealReduced : sectionReveal;

  return (
    <motion.section
      ref={ref}
      id={`section-${id}`}
      className={`w-full py-16 md:py-24 ${className ?? ""}`}
      style={accent ? { "--module-accent": accentCssVar(accent) } as React.CSSProperties : undefined}
      variants={variants}
      initial="hidden"
      animate={isInView ? "visible" : "hidden"}
    >
      <div className="mx-auto max-w-5xl px-6 md:px-8">
        {title && (
          <Title order={2} className="mb-2" style={{ color: "var(--text-primary)" }}>
            {title}
          </Title>
        )}
        {subtitle && (
          <Text size="lg" className="mb-8" style={{ color: "var(--text-secondary)" }}>
            {subtitle}
          </Text>
        )}
        {children}
      </div>
    </motion.section>
  );
}
