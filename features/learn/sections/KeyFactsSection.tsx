"use client";

import { useRef } from "react";
import { motion, useInView } from "framer-motion";
import { Card, SimpleGrid, Text, Title } from "@mantine/core";
import type { KeyFactsSectionProps } from "@/features/learn/types";
import { SceneSection } from "@/features/learn/primitives/SceneSection";
import {
  prefersReducedMotion,
  cardReveal,
  cardRevealReduced,
  staggerChildren,
} from "@/features/learn/motion";

export function KeyFactsSection({
  facts,
  title = "Key Facts",
  columns = 2,
  sectionId,
}: KeyFactsSectionProps) {
  const gridRef = useRef<HTMLDivElement>(null);
  const inView = useInView(gridRef, { once: true, margin: "-10%" });
  const reduced = prefersReducedMotion();

  return (
    <SceneSection id={sectionId ?? "key-facts"} title={title}>
      <motion.div
        ref={gridRef}
        initial="hidden"
        animate={inView ? "visible" : "hidden"}
        transition={staggerChildren}
      >
        <SimpleGrid cols={columns}>
          {facts.map((fact) => (
            <motion.div
              key={fact.label}
              variants={reduced ? cardRevealReduced : cardReveal}
            >
              <Card radius="lg" shadow="sm" padding="xl" h="100%">
                <Title order={4} fw={700} mb="xs">
                  {fact.label}
                </Title>
                <Text size="sm" c="dimmed">
                  {fact.description}
                </Text>
              </Card>
            </motion.div>
          ))}
        </SimpleGrid>
      </motion.div>
    </SceneSection>
  );
}
