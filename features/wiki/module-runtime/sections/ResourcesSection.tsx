"use client";

import { useMemo, useRef, useState } from "react";
import { motion, useInView } from "framer-motion";
import { Badge, Card, Group, Stack, Text, Title } from "@mantine/core";
import type { ResourcesSectionProps } from "@/features/wiki/module-runtime/types";
import { SceneSection } from "@/features/wiki/module-runtime/primitives/SceneSection";
import {
  usePrefersReducedMotion,
  cardReveal,
  cardRevealReduced,
  staggerChildren,
} from "@/features/wiki/module-runtime/motion";

export function ResourcesSection({
  items,
  title = "Resources & Further Reading",
  categories,
  sectionId,
}: ResourcesSectionProps) {
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inView = useInView(containerRef, { once: true, margin: "-10%" });
  const reduced = usePrefersReducedMotion();

  const filtered = useMemo(
    () =>
      activeCategory
        ? items.filter((item) => item.category === activeCategory)
        : items,
    [items, activeCategory],
  );

  return (
    <SceneSection id={sectionId ?? "resources"} title={title}>
      {categories && categories.length > 0 && (
        <Group gap="xs" mb="lg">
          <Badge
            radius="xl"
            variant={activeCategory === null ? "filled" : "light"}
            style={{ cursor: "pointer" }}
            onClick={() => setActiveCategory(null)}
          >
            All
          </Badge>
          {categories.map((cat) => (
            <Badge
              key={cat}
              radius="xl"
              variant={activeCategory === cat ? "filled" : "light"}
              style={{ cursor: "pointer" }}
              onClick={() => setActiveCategory(cat)}
            >
              {cat}
            </Badge>
          ))}
        </Group>
      )}

      <motion.div
        ref={containerRef}
        key={activeCategory ?? "all"}
        initial="hidden"
        animate={inView ? "visible" : "hidden"}
        transition={staggerChildren}
      >
        <Stack gap="md">
          {filtered.map((item) => (
            <motion.div
              key={item.title}
              variants={reduced ? cardRevealReduced : cardReveal}
            >
              <Card radius="lg" shadow="sm" padding="xl">
                <Group justify="space-between" align="flex-start" mb="xs">
                  {item.url ? (
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ textDecoration: "none", color: "inherit" }}
                    >
                      <Title order={5}>{item.title}</Title>
                    </a>
                  ) : (
                    <Title order={5}>{item.title}</Title>
                  )}
                  {item.category && (
                    <Badge radius="xl" variant="light" size="sm">
                      {item.category}
                    </Badge>
                  )}
                </Group>
                <Text size="sm" c="dimmed">
                  {item.description}
                </Text>
              </Card>
            </motion.div>
          ))}
        </Stack>
      </motion.div>
    </SceneSection>
  );
}
