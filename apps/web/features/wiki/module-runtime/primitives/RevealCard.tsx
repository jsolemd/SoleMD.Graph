"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, Text } from "@mantine/core";
import type { ModuleAccent } from "@/features/wiki/module-runtime/types";
import {
  usePrefersReducedMotion,
  cardReveal,
  cardRevealReduced,
} from "@/features/wiki/module-runtime/motion";
import { accentCssVar } from "@/features/wiki/module-runtime/tokens";

interface RevealCardProps {
  label: string;
  content: string;
  detail?: string;
  accent?: ModuleAccent;
}

export function RevealCard({ label, content, detail, accent }: RevealCardProps) {
  const [revealed, setRevealed] = useState(false);
  const reduced = usePrefersReducedMotion();
  const variants = reduced ? cardRevealReduced : cardReveal;

  const accentColor = accent ? accentCssVar(accent) : "var(--module-accent)";

  return (
    <Card
      radius="lg"
      shadow="sm"
      p="xl"
      onClick={() => setRevealed(true)}
      style={{
        borderLeft: `3px solid ${accentColor}`,
        cursor: revealed ? "default" : "pointer",
      }}
    >
      <Text fw={600} size="lg" style={{ color: "var(--text-primary)" }}>
        {label}
      </Text>

      <AnimatePresence mode="wait">
        {!revealed ? (
          <motion.div
            key="hint"
            initial={{ opacity: 1 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.12 }}
          >
            <Text size="sm" className="mt-2" style={{ color: "var(--text-tertiary)" }}>
              Tap to reveal
            </Text>
          </motion.div>
        ) : (
          <motion.div
            key="content"
            variants={variants}
            initial="hidden"
            animate="visible"
            className="mt-3"
          >
            <Text style={{ color: "var(--text-primary)" }}>{content}</Text>
            {detail && (
              <Text size="sm" className="mt-2" style={{ color: "var(--text-secondary)" }}>
                {detail}
              </Text>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}
