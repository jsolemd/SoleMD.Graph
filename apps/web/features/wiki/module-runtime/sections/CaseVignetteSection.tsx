"use client";

import { useRef } from "react";
import { motion, useInView } from "framer-motion";
import { Stack } from "@mantine/core";
import type { CaseVignetteSectionProps } from "@/features/wiki/module-runtime/types";
import { SceneSection } from "@/features/wiki/module-runtime/primitives/SceneSection";
import { ProseBlock } from "@/features/wiki/module-runtime/primitives/ProseBlock";
import { RevealCard } from "@/features/wiki/module-runtime/primitives/RevealCard";
import {
  usePrefersReducedMotion,
  cardReveal,
  cardRevealReduced,
  staggerChildren,
} from "@/features/wiki/module-runtime/motion";

export function CaseVignetteSection({ data, sectionId }: CaseVignetteSectionProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const inView = useInView(containerRef, { once: true, margin: "-10%" });
  const reduced = usePrefersReducedMotion();

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
