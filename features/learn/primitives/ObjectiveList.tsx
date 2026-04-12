"use client";

import { useRef } from "react";
import { motion, useInView } from "framer-motion";
import { Paper, Title, Text } from "@mantine/core";
import {
  prefersReducedMotion,
  cardReveal,
  cardRevealReduced,
  staggerChildren,
} from "@/features/learn/motion";

interface ObjectiveListProps {
  objectives: string[];
  title?: string;
}

export function ObjectiveList({
  objectives,
  title = "Learning Objectives",
}: ObjectiveListProps) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-10% 0px" });
  const reduced = prefersReducedMotion();
  const itemVariants = reduced ? cardRevealReduced : cardReveal;

  return (
    <Paper
      ref={ref}
      radius="lg"
      p="xl"
      style={{
        borderLeft: "3px solid var(--module-accent)",
        background: "var(--surface)",
      }}
    >
      <Title order={3} className="mb-4" style={{ color: "var(--text-primary)" }}>
        {title}
      </Title>
      <motion.ol
        className="m-0 list-none p-0"
        initial="hidden"
        animate={isInView ? "visible" : "hidden"}
        transition={staggerChildren}
      >
        {objectives.map((objective, i) => (
          <motion.li
            key={i}
            variants={itemVariants}
            className="flex gap-3 py-2"
          >
            <Text
              fw={700}
              className="shrink-0"
              style={{ color: "var(--module-accent)", minWidth: "1.5rem" }}
            >
              {i + 1}.
            </Text>
            <Text style={{ color: "var(--text-primary)" }}>{objective}</Text>
          </motion.li>
        ))}
      </motion.ol>
    </Paper>
  );
}
