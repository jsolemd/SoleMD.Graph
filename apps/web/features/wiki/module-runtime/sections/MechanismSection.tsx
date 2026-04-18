"use client";

import { useRef } from "react";
import { motion, useInView } from "framer-motion";
import { Stack, Text, Title } from "@mantine/core";
import type { MechanismSectionProps } from "@/features/wiki/module-runtime/types";
import { SceneSection } from "@/features/wiki/module-runtime/primitives/SceneSection";
import { AnimationStage } from "@/features/wiki/module-runtime/primitives/AnimationStage";
import {
  usePrefersReducedMotion,
  cardReveal,
  cardRevealReduced,
  staggerChildren,
} from "@/features/wiki/module-runtime/motion";
import { moduleAccentCssVar } from "@/lib/theme/pastel-tokens";

export function MechanismSection({
  stages,
  title = "Mechanism",
  sectionId,
}: MechanismSectionProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const inView = useInView(containerRef, { once: true, margin: "-10%" });
  const reduced = usePrefersReducedMotion();

  return (
    <SceneSection id={sectionId ?? "mechanism"} title={title}>
      <motion.div
        ref={containerRef}
        initial="hidden"
        animate={inView ? "visible" : "hidden"}
        transition={staggerChildren}
      >
        <Stack gap={0} style={{ position: "relative" }}>
          {stages.map((stage, i) => (
            <motion.div
              key={stage.id}
              variants={reduced ? cardRevealReduced : cardReveal}
              style={{ display: "flex", gap: "var(--mantine-spacing-md)" }}
            >
              {/* Numbered circle + vertical line */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  flexShrink: 0,
                }}
              >
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: "50%",
                    background: moduleAccentCssVar,
                    color: "white",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 700,
                    fontSize: 14,
                    flexShrink: 0,
                  }}
                >
                  {i + 1}
                </div>
                {i < stages.length - 1 && (
                  <div
                    style={{
                      width: 2,
                      flex: 1,
                      minHeight: 24,
                      background: "var(--border-default)",
                    }}
                  />
                )}
              </div>

              {/* Content */}
              <div style={{ paddingBottom: "var(--mantine-spacing-xl)" }}>
                <Title order={4} fw={700} mb={4}>
                  {stage.title}
                </Title>
                <Text size="sm" c="dimmed" mb="sm">
                  {stage.description}
                </Text>
                {stage.animationName && (
                  <AnimationStage name={stage.animationName} />
                )}
              </div>
            </motion.div>
          ))}
        </Stack>
      </motion.div>
    </SceneSection>
  );
}
