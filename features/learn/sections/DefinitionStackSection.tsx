"use client";

import { useRef } from "react";
import { motion, useInView } from "framer-motion";
import { Paper, Stack, Text } from "@mantine/core";
import type { DefinitionStackSectionProps } from "@/features/learn/types";
import { SceneSection } from "@/features/learn/primitives/SceneSection";
import {
  prefersReducedMotion,
  cardReveal,
  cardRevealReduced,
  staggerChildren,
} from "@/features/learn/motion";

export function DefinitionStackSection({
  items,
  title = "Definitions",
  sectionId,
}: DefinitionStackSectionProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const inView = useInView(containerRef, { once: true, margin: "-10%" });
  const reduced = prefersReducedMotion();

  return (
    <SceneSection id={sectionId ?? "definition-stack"} title={title}>
      <motion.div
        ref={containerRef}
        initial="hidden"
        animate={inView ? "visible" : "hidden"}
        transition={staggerChildren}
      >
        <Stack gap="md">
          {items.map((item, i) => (
            <motion.div
              key={item.term}
              variants={reduced ? cardRevealReduced : cardReveal}
            >
              <Paper radius="lg" shadow="sm" p="md">
                <Text fw={700} size="sm" mb={4}>
                  {i + 1}. {item.term}
                </Text>
                <Text size="sm">{item.definition}</Text>
                {item.detail && (
                  <Text size="xs" c="dimmed" mt="xs">
                    {item.detail}
                  </Text>
                )}
              </Paper>
            </motion.div>
          ))}
        </Stack>
      </motion.div>
    </SceneSection>
  );
}
