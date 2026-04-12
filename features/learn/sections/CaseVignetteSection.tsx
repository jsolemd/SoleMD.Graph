"use client";

import { useRef } from "react";
import { motion, useInView } from "framer-motion";
import { Stack } from "@mantine/core";
import type { CaseVignetteSectionProps } from "@/features/learn/types";
import { SceneSection } from "@/features/learn/primitives/SceneSection";
import { ProseBlock } from "@/features/learn/primitives/ProseBlock";
import { RevealCard } from "@/features/learn/primitives/RevealCard";
import {
  prefersReducedMotion,
  cardReveal,
  cardRevealReduced,
  staggerChildren,
} from "@/features/learn/motion";

export function CaseVignetteSection({ data, sectionId }: CaseVignetteSectionProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const inView = useInView(containerRef, { once: true, margin: "-10%" });
  const reduced = prefersReducedMotion();

  return (
    <SceneSection id={sectionId ?? "case-vignette"} title={data.title}>
      <ProseBlock size="md">{data.scenario}</ProseBlock>

      <motion.div
        ref={containerRef}
        initial="hidden"
        animate={inView ? "visible" : "hidden"}
        transition={staggerChildren}
        style={{ marginTop: "var(--mantine-spacing-xl)" }}
      >
        <Stack gap="md">
          {data.reveals.map((reveal) => (
            <motion.div
              key={reveal.label}
              variants={reduced ? cardRevealReduced : cardReveal}
            >
              <RevealCard label={reveal.label} content={reveal.content} />
            </motion.div>
          ))}
        </Stack>
      </motion.div>
    </SceneSection>
  );
}
