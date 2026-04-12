"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { SegmentedControl, Text, Title, Stack, Paper } from "@mantine/core";
import { ChatBubble } from "@/features/learn/primitives/ChatBubble";
import { DemoStage } from "@/features/learn/interactions";
import { prefersReducedMotion, smooth } from "@/features/learn/motion";

type WindowSize = "small" | "medium" | "large";

const EMR_ENTRIES = [
  {
    date: "Oct 15",
    text: "Started quetiapine 25mg QHS for delirium.",
    visible: ["small", "medium", "large"] as WindowSize[],
  },
  {
    date: "Oct 12",
    text: "Switched to haloperidol 0.5mg PRN.",
    visible: ["small", "medium", "large"] as WindowSize[],
  },
  {
    date: "Oct 5",
    text: "Lorazepam 0.5mg PRN for agitation. CAM-ICU positive.",
    visible: ["medium", "large"] as WindowSize[],
  },
  {
    date: "Sep 28",
    text: "Valproic acid 500mg BID started for seizure prophylaxis.",
    visible: ["large"] as WindowSize[],
  },
  {
    date: "Sep 15",
    text: "Admission. PMH: CVA, HTN, DM2. Baseline MMSE 24/30.",
    visible: ["large"] as WindowSize[],
  },
];

const AI_RESPONSES: Record<WindowSize, string> = {
  small:
    "Based on the available notes, the patient is on quetiapine for delirium and was previously on haloperidol. I don't see information about other medications or medical history.",
  medium:
    "The patient has delirium (CAM-ICU positive) being managed with quetiapine after a haloperidol trial. Lorazepam was used earlier for agitation. I don't have access to the full admission workup.",
  large:
    "The patient was admitted with CVA, HTN, and DM2 (baseline MMSE 24/30). Valproic acid was started for seizure prophylaxis. Subsequent delirium (CAM-ICU positive) was managed progressively: lorazepam, then haloperidol, then quetiapine. Note the potential VPA-quetiapine interaction affecting QTc.",
};

export function ContextDemo() {
  const [windowSize, setWindowSize] = useState<WindowSize>("small");
  const reduced = prefersReducedMotion();

  return (
    <Stack gap="md">
      <Title order={3}>Context Window</Title>
      <Text size="sm" style={{ color: "var(--text-secondary)" }}>
        The context window is everything the model can &quot;see&quot; at once.
        Information outside this window is invisible - the model will answer
        confidently even with incomplete information.
      </Text>

      <SegmentedControl
        value={windowSize}
        onChange={(v) => setWindowSize(v as WindowSize)}
        data={[
          { value: "small", label: "Small" },
          { value: "medium", label: "Medium" },
          { value: "large", label: "Large" },
        ]}
        fullWidth
      />

      {/* EMR Note visualization */}
      <Paper
        radius="lg"
        p="md"
        withBorder
        style={{ fontFamily: "monospace", fontSize: 13, lineHeight: 1.8 }}
      >
        <Text size="sm" fw={600} mb="xs" style={{ color: "var(--text-primary)" }}>
          EMR Note (multi-page)
        </Text>
        <Stack gap={4}>
          {EMR_ENTRIES.map((entry) => {
            const isVisible = entry.visible.includes(windowSize);
            return (
              <motion.div
                key={entry.date}
                animate={{ opacity: isVisible ? 1 : 0.15 }}
                transition={
                  reduced
                    ? { duration: 0.15 }
                    : { type: "spring", stiffness: 80, damping: 22 }
                }
              >
                <Text size="sm" style={{ color: "var(--text-primary)" }}>
                  <strong>{entry.date}:</strong> {entry.text}
                </Text>
              </motion.div>
            );
          })}
        </Stack>
      </Paper>

      {/* AI Response that changes with context */}
      <ChatBubble role="user">
        What medication was started in September?
      </ChatBubble>
      <AnimatePresence mode="wait">
        <motion.div
          key={windowSize}
          initial={reduced ? { opacity: 0 } : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduced ? { opacity: 0 } : { opacity: 0, y: -8 }}
          transition={{
            y: smooth,
            opacity: { duration: 0.15, ease: "easeOut" },
          }}
        >
          <ChatBubble role="ai">
            <Text size="sm">{AI_RESPONSES[windowSize]}</Text>
          </ChatBubble>
        </motion.div>
      </AnimatePresence>

      {/* Teaching annotation */}
      <DemoStage.Annotation>
        If you ask about a drug interaction on page 2 but the model's context only
        fits page 1, it cannot answer correctly. It is not being difficult - it is
        literally blind to the information.
      </DemoStage.Annotation>
    </Stack>
  );
}
