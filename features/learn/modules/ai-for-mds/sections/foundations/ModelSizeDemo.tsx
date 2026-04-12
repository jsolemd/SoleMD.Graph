"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { SegmentedControl, Text, Title, Stack } from "@mantine/core";
import { ChatBubble } from "@/features/learn/primitives/ChatBubble";
import { DemoStage } from "@/features/learn/interactions";
import { prefersReducedMotion, smooth } from "@/features/learn/motion";

const MODELS = [
  {
    value: "small",
    label: "Small (7B)",
    response:
      "Catatonia is a condition where people stop moving. Treatment includes benzodiazepines.",
    quality: 25,
    qualityLabel: "Misses differential, scoring, and nuance",
  },
  {
    value: "medium",
    label: "Medium (70B)",
    response:
      "Catatonia involves psychomotor disturbance including stupor, mutism, and posturing. Bush-Francis scale quantifies severity. First-line is lorazepam challenge.",
    quality: 60,
    qualityLabel: "Hits key points but omits important context",
  },
  {
    value: "large",
    label: "Large (400B+)",
    response:
      "Catatonia is a neuropsychiatric syndrome with motor, behavioral, and autonomic features. The Bush-Francis Catatonia Rating Scale screens (14 items) and rates severity (23 items). Differential includes NMS, serotonin syndrome, and anti-NMDAR encephalitis. First-line: lorazepam 1-2mg challenge with response in minutes to hours. ECT for malignant or refractory cases.",
    quality: 95,
    qualityLabel: "Comprehensive: differential, scoring, treatment algorithm",
  },
];

export function ModelSizeDemo() {
  const [size, setSize] = useState("small");
  const model = MODELS.find((m) => m.value === size)!;
  const reduced = prefersReducedMotion();

  return (
    <Stack gap="md">
      <Title order={3}>Model Size</Title>
      <Text size="sm" style={{ color: "var(--text-secondary)" }}>
        Model capacity - measured in billions of parameters - determines how well
        an LLM handles complex medical reasoning.
      </Text>

      <SegmentedControl
        value={size}
        onChange={setSize}
        data={MODELS.map((m) => ({ value: m.value, label: m.label }))}
        fullWidth
      />

      {/* Chat exchange */}
      <ChatBubble role="user">
        Summarize catatonia features for a medical team.
      </ChatBubble>

      <AnimatePresence mode="wait">
        <motion.div
          key={size}
          initial={reduced ? { opacity: 0 } : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduced ? { opacity: 0 } : { opacity: 0, y: -8 }}
          transition={{
            y: smooth,
            opacity: { duration: 0.15, ease: "easeOut" },
          }}
        >
          <ChatBubble role="ai">
            <Text size="sm">{model.response}</Text>
          </ChatBubble>
        </motion.div>
      </AnimatePresence>

      {/* Quality indicator - animated progress bar */}
      <div className="flex items-center gap-3 mt-2">
        <Text
          size="xs"
          fw={600}
          style={{ color: "var(--text-secondary)", whiteSpace: "nowrap" }}
        >
          Output Quality
        </Text>
        <div
          className="flex-1 h-2 rounded-full overflow-hidden"
          style={{ background: "var(--border-default)" }}
        >
          <motion.div
            initial={false}
            animate={{ width: `${model.quality}%` }}
            transition={
              reduced
                ? { duration: 0.15 }
                : { type: "spring", stiffness: 80, damping: 22 }
            }
            className="h-full rounded-full"
            style={{ background: "var(--module-accent)" }}
          />
        </div>
      </div>
      <Text size="xs" style={{ color: "var(--text-tertiary)" }}>
        {model.qualityLabel}
      </Text>

      {/* Teaching point annotation */}
      <DemoStage.Annotation>
        For a quick progress note, a small model works fine. For a grand rounds
        presentation, you need the depth of a large model.
      </DemoStage.Annotation>
    </Stack>
  );
}
