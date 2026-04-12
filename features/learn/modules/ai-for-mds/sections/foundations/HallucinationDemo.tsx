"use client";

import { motion } from "framer-motion";
import { SegmentedControl, Text, Title, Stack, Paper } from "@mantine/core";
import { ToggleCompare } from "@/features/learn/interactions";
import { useToggleCompareContext } from "@/features/learn/interactions/ToggleCompare/ToggleCompare";
import { DemoStage } from "@/features/learn/interactions";
import { prefersReducedMotion } from "@/features/learn/motion";

/* ── Citation Badge ── */

function CitationBadge({
  citation,
  index,
}: {
  citation: string;
  index: number;
}) {
  const reduced = prefersReducedMotion();

  return (
    <motion.span
      initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={
        reduced
          ? { duration: 0.15, delay: index * 0.05 }
          : {
              delay: 0.3 + index * 0.1,
              type: "spring",
              stiffness: 300,
              damping: 28,
            }
      }
      className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium mx-0.5"
      style={{
        background:
          "color-mix(in srgb, var(--module-accent) 15%, var(--surface))",
        color: "var(--module-accent)",
      }}
    >
      {citation}
    </motion.span>
  );
}

/* ── Warning Badge ── */

function WarningBadge() {
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium"
      style={{
        background: "color-mix(in srgb, #e53e3e 12%, var(--surface))",
        color: "#e53e3e",
      }}
    >
      <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
        <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm0 10.5a.75.75 0 110-1.5.75.75 0 010 1.5zM8.75 4.5v4a.75.75 0 01-1.5 0v-4a.75.75 0 011.5 0z" />
      </svg>
      Unverified
    </span>
  );
}

/* ── Segmented Control Wrapper ── */

function ToggleControl() {
  const { active, setActive } = useToggleCompareContext();

  return (
    <SegmentedControl
      value={active}
      onChange={setActive}
      data={[
        { value: "ungrounded", label: "Ungrounded" },
        { value: "grounded", label: "Grounded (RAG)" },
      ]}
      fullWidth
    />
  );
}

/* ── Ungrounded Response ── */

function UngroundedResponse() {
  return (
    <Paper
      radius="md"
      p="md"
      style={{
        background: "var(--surface)",
        border: "1px solid color-mix(in srgb, #e53e3e 25%, var(--border-default))",
      }}
    >
      <div className="flex items-center gap-2 mb-3">
        <Text size="xs" fw={600} style={{ color: "var(--text-tertiary)" }}>
          AI Response
        </Text>
        <WarningBadge />
      </div>
      <Text size="sm" style={{ color: "var(--text-primary)", lineHeight: 1.7 }}>
        Quetiapine is the gold-standard treatment for ICU delirium, with
        multiple RCTs showing 40% reduction in delirium duration. The MIND-USA
        trial confirmed superiority over placebo. Standard dosing is 50mg BID,
        titrated to 200mg BID. It is FDA-approved for delirium.
      </Text>
      <Text
        size="xs"
        mt="sm"
        style={{ color: "#e53e3e", fontStyle: "italic" }}
      >
        Multiple factual errors: MIND-USA showed no benefit for antipsychotics.
        Quetiapine is not FDA-approved for delirium. The 40% figure is
        fabricated.
      </Text>
    </Paper>
  );
}

/* ── Grounded Response ── */

function GroundedResponse() {
  return (
    <Paper
      radius="md"
      p="md"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border-default)",
      }}
    >
      <div className="flex items-center gap-2 mb-3">
        <Text size="xs" fw={600} style={{ color: "var(--text-tertiary)" }}>
          AI Response (with retrieval)
        </Text>
      </div>
      <Text
        size="sm"
        component="div"
        style={{ color: "var(--text-primary)", lineHeight: 1.7 }}
      >
        <span>
          Antipsychotics for ICU delirium remain controversial. The MIND-USA
          trial
        </span>
        <CitationBadge citation="Girard 2018" index={0} />
        <span>
          found no significant difference between haloperidol, ziprasidone, and
          placebo for delirium duration. The APA guidelines
        </span>
        <CitationBadge citation="APA 2023" index={1} />
        <span>
          recommend non-pharmacologic interventions first. More recently, the
          HOPE-ICU trial
        </span>
        <CitationBadge citation="Page 2013" index={2} />
        <span>
          similarly showed no benefit for haloperidol prophylaxis. Current
          evidence supports reserving antipsychotics for severe agitation only
        </span>
        <CitationBadge citation="Devlin 2018" index={3} />
        <span>.</span>
      </Text>
    </Paper>
  );
}

/* ── Main ── */

export function HallucinationDemo() {
  return (
    <Stack gap="md">
      <Title order={3}>Hallucination vs. Grounding</Title>
      <Text size="sm" style={{ color: "var(--text-secondary)" }}>
        Without retrieval, LLMs generate plausible-sounding text that may
        contain fabricated facts. Retrieval-augmented generation (RAG) grounds
        responses in real sources.
      </Text>

      <ToggleCompare options={["ungrounded", "grounded"]}>
        <ToggleCompare.Control>
          <ToggleControl />
        </ToggleCompare.Control>

        <ToggleCompare.Display>
          <ToggleCompare.Option value="ungrounded">
            <UngroundedResponse />
          </ToggleCompare.Option>
          <ToggleCompare.Option value="grounded">
            <GroundedResponse />
          </ToggleCompare.Option>
        </ToggleCompare.Display>
      </ToggleCompare>

      <DemoStage.Annotation>
        The citations are not just decoration - each one is a verifiable claim
        you can check. This is the difference between trusting AI and verifying
        AI.
      </DemoStage.Annotation>
    </Stack>
  );
}
