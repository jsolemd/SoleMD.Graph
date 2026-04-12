"use client";

import { useRef } from "react";
import { motion, useInView } from "framer-motion";
import { Card, SimpleGrid, Stack, Text, Title } from "@mantine/core";
import type { BeforeAfterSectionProps } from "@/features/learn/types";
import { SceneSection } from "@/features/learn/primitives/SceneSection";
import {
  prefersReducedMotion,
  cardReveal,
  cardRevealReduced,
  staggerChildren,
} from "@/features/learn/motion";

export function BeforeAfterSection({
  items,
  title = "Before & After",
  beforeLabel = "Before",
  afterLabel = "After",
  sectionId,
}: BeforeAfterSectionProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const inView = useInView(containerRef, { once: true, margin: "-10%" });
  const reduced = prefersReducedMotion();

  return (
    <SceneSection id={sectionId ?? "before-after"} title={title}>
      <motion.div
        ref={containerRef}
        initial="hidden"
        animate={inView ? "visible" : "hidden"}
        transition={staggerChildren}
      >
        {/* Column headers */}
        <SimpleGrid cols={2} mb="md">
          <Title order={5} c="dimmed">
            {beforeLabel}
          </Title>
          <Title order={5} style={{ color: "var(--module-accent)" }}>
            {afterLabel}
          </Title>
        </SimpleGrid>

        {/* Comparison rows */}
        <Stack gap="md">
          {items.map((item) => (
            <motion.div
              key={item.label}
              variants={reduced ? cardRevealReduced : cardReveal}
            >
              <Text fw={600} size="sm" mb="xs">
                {item.label}
              </Text>
              <SimpleGrid cols={2}>
                <Card
                  radius="lg"
                  shadow="sm"
                  padding="xl"
                  bg="var(--mantine-color-default-hover)"
                >
                  <Text size="sm" c="dimmed">
                    {item.before}
                  </Text>
                </Card>
                <Card
                  radius="lg"
                  shadow="sm"
                  padding="xl"
                  style={{
                    borderLeft: "3px solid var(--module-accent, var(--mantine-color-blue-6))",
                  }}
                >
                  <Text size="sm">{item.after}</Text>
                </Card>
              </SimpleGrid>
            </motion.div>
          ))}
        </Stack>
      </motion.div>
    </SceneSection>
  );
}
