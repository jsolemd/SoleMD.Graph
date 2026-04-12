"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { SegmentedControl, Text, Title, Stack } from "@mantine/core";
import { DemoStage } from "@/features/learn/interactions";
import { prefersReducedMotion, crisp } from "@/features/learn/motion";

const MEDICAL_TOKENS = [
  { text: "anti", color: "var(--color-fresh-green, #4caf50)" },
  { text: "NMDAR", color: "var(--color-fresh-green, #4caf50)" },
  { text: "encephalitis", color: "var(--color-fresh-green, #4caf50)" },
];

const GENERAL_TOKENS = [
  { text: "anti", color: "var(--color-warm-coral, #ff7043)" },
  { text: "-NM", color: "var(--color-warm-coral, #ff7043)" },
  { text: "DAR", color: "var(--color-warm-coral, #ff7043)" },
  { text: "enc", color: "var(--color-warm-coral, #ff7043)" },
  { text: "eph", color: "var(--color-warm-coral, #ff7043)" },
  { text: "alitis", color: "var(--color-warm-coral, #ff7043)" },
];

interface TokenBoxProps {
  text: string;
  color: string;
  index: number;
}

function TokenBox({ text, color, index }: TokenBoxProps) {
  const reduced = prefersReducedMotion();
  return (
    <motion.div
      initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.8, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.8 }}
      transition={{
        delay: index * 0.08,
        scale: crisp,
        opacity: { duration: 0.15 },
      }}
      className="inline-flex items-center px-3 py-1.5 rounded-lg font-mono text-sm font-medium"
      style={{
        background: `color-mix(in srgb, ${color} 15%, var(--surface))`,
        border: `1.5px solid ${color}`,
        color: "var(--text-primary)",
      }}
    >
      {text}
    </motion.div>
  );
}

export function TokenDemo() {
  const [model, setModel] = useState<"medical" | "general">("medical");
  const tokens = model === "medical" ? MEDICAL_TOKENS : GENERAL_TOKENS;

  return (
    <Stack gap="md">
      <Title order={3}>Tokens and Probability</Title>
      <Text size="sm" style={{ color: "var(--text-secondary)" }}>
        LLMs don't read words - they process tokens (sub-word fragments). Medical
        terminology tokenizes very differently across models.
      </Text>

      <SegmentedControl
        value={model}
        onChange={(v) => setModel(v as "medical" | "general")}
        data={[
          { value: "medical", label: "Medical Model" },
          { value: "general", label: "General Model" },
        ]}
        fullWidth
      />

      {/* Source text */}
      <Text size="sm" fw={600} style={{ color: "var(--text-secondary)" }}>
        Input: &quot;anti-NMDAR encephalitis&quot;
      </Text>

      {/* Animated token visualization */}
      <div
        className="flex flex-wrap gap-2 p-4 rounded-xl min-h-[60px]"
        style={{ background: "var(--surface)" }}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={model}
            className="flex flex-wrap gap-2"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            {tokens.map((token, i) => (
              <TokenBox
                key={`${model}-${i}`}
                text={token.text}
                color={token.color}
                index={i}
              />
            ))}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Token count comparison */}
      <Text size="sm" style={{ color: "var(--text-secondary)" }}>
        {tokens.length} tokens -{" "}
        {model === "medical"
          ? "preserves medical semantics"
          : "fragmentation can introduce errors"}
      </Text>

      <DemoStage.Annotation>
        When a model splits &quot;encephalitis&quot; into fragments, it must
        reassemble the meaning from pieces - sometimes incorrectly. Medical-tuned
        models keep clinical terms intact.
      </DemoStage.Annotation>
    </Stack>
  );
}
