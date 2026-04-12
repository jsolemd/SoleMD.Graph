"use client";

import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { Slider, Text, Title, Stack } from "@mantine/core";
import { Group } from "@visx/group";
import { scaleBand, scaleLinear } from "@visx/scale";
import { ChatBubble } from "@/features/wiki/module-runtime/primitives/ChatBubble";
import { DemoStage } from "@/features/wiki/module-runtime/interactions";
import { smooth, usePrefersReducedMotion } from "@/features/wiki/module-runtime/motion";

/* ── Data ── */

const TOKENS = [
  "Benzodiazepines",
  "Lorazepam",
  "GABA",
  "Medications",
  "Treatment",
  "The",
  "Consider",
  "Perhaps",
];

const BASE_LOGITS = [3.2, 2.8, 1.5, 1.0, 0.8, 0.3, 0.1, -0.5];

function softmax(logits: number[], temperature: number): number[] {
  const t = Math.max(temperature, 0.01);
  const scaled = logits.map((l) => l / t);
  const maxVal = Math.max(...scaled);
  const exps = scaled.map((s) => Math.exp(s - maxVal));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / sum);
}

const RESPONSES = [
  {
    max: 0.3,
    text: "Benzodiazepines are first-line for catatonia per APA guidelines. Lorazepam 1-2mg IV/IM is the standard challenge dose.",
  },
  {
    max: 1.2,
    text: "Benzodiazepines work in catatonia likely through GABA-A modulation in cortico-striatal circuits. The lorazepam challenge both diagnoses and initiates treatment.",
  },
  {
    max: 2.0,
    text: "Perhaps catatonia is the brain's emergency brake - a phylogenetic freeze response. Benzodiazepines release the brake. What if we combined sub-anesthetic ketamine with lorazepam?",
  },
];

function getResponse(temp: number): string {
  for (const r of RESPONSES) {
    if (temp <= r.max) return r.text;
  }
  return RESPONSES[RESPONSES.length - 1].text;
}

function getTeachingPoint(temp: number): string {
  if (temp <= 0.3)
    return "Low temperature: the model almost always picks the highest-probability token. Safe, predictable, but potentially repetitive.";
  if (temp <= 1.2)
    return "Moderate temperature: tokens are sampled more evenly. Good balance of accuracy and expressiveness for clinical use.";
  return "High temperature: the distribution flattens toward uniform. Creative but unreliable - never use this for clinical decisions.";
}

/* ── Chart ── */

const CHART_WIDTH = 420;
const CHART_HEIGHT = 240;
const MARGIN = { top: 8, right: 16, bottom: 8, left: 110 };

function ProbabilityChart({ probs }: { probs: number[] }) {
  const reduced = usePrefersReducedMotion();
  const innerWidth = CHART_WIDTH - MARGIN.left - MARGIN.right;
  const innerHeight = CHART_HEIGHT - MARGIN.top - MARGIN.bottom;

  const yScale = scaleBand<string>({
    domain: TOKENS,
    range: [0, innerHeight],
    padding: 0.3,
  });

  const xScale = scaleLinear<number>({
    domain: [0, 1],
    range: [0, innerWidth],
  });

  return (
    <svg
      viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
      className="w-full max-w-md"
      role="img"
      aria-label="Token probability distribution"
    >
      <Group top={MARGIN.top} left={MARGIN.left}>
        {TOKENS.map((token, i) => {
          const y = yScale(token) ?? 0;
          const barHeight = yScale.bandwidth();
          const barWidth = xScale(probs[i]);

          return (
            <g key={token}>
              <text
                x={-8}
                y={y + barHeight / 2}
                textAnchor="end"
                dominantBaseline="central"
                fill="var(--text-secondary)"
                fontSize={11}
              >
                {token}
              </text>
              <motion.rect
                y={y}
                x={0}
                height={barHeight}
                rx={3}
                fill="var(--module-accent)"
                fillOpacity={0.2 + probs[i] * 0.8}
                initial={false}
                animate={{ width: Math.max(barWidth, 2) }}
                transition={
                  reduced
                    ? { duration: 0.15 }
                    : smooth
                }
              />
              <motion.text
                y={y + barHeight / 2}
                dominantBaseline="central"
                fill="var(--text-tertiary)"
                fontSize={10}
                initial={false}
                animate={{ x: Math.max(barWidth, 2) + 6 }}
                transition={
                  reduced
                    ? { duration: 0.15 }
                    : smooth
                }
              >
                {(probs[i] * 100).toFixed(1)}%
              </motion.text>
            </g>
          );
        })}
      </Group>
    </svg>
  );
}

/* ── Main ── */

export function TemperatureDemo() {
  const [temperature, setTemperature] = useState(0.7);
  const probs = useMemo(
    () => softmax(BASE_LOGITS, temperature),
    [temperature],
  );

  return (
    <Stack gap="md">
      <Title order={3}>Temperature</Title>
      <Text size="sm" style={{ color: "var(--text-secondary)" }}>
        Temperature controls how &quot;creative&quot; vs. deterministic the model
        is by reshaping the probability distribution over next tokens.
      </Text>

      <DemoStage layout="vertical">
        <DemoStage.Controls className="md:w-full">
          <Text size="sm" fw={600} style={{ color: "var(--text-primary)" }}>
            Temperature: {temperature.toFixed(1)}
          </Text>
          <Slider
            min={0}
            max={2}
            step={0.1}
            value={temperature}
            onChange={setTemperature}
            label={(v) => v.toFixed(1)}
            color="var(--module-accent)"
            marks={[
              { value: 0, label: "0.0" },
              { value: 1, label: "1.0" },
              { value: 2, label: "2.0" },
            ]}
          />
        </DemoStage.Controls>

        <DemoStage.Visualization>
          <ProbabilityChart probs={probs} />

          <div className="mt-4">
            <ChatBubble role="ai">{getResponse(temperature)}</ChatBubble>
          </div>
        </DemoStage.Visualization>

        <DemoStage.Annotation>{getTeachingPoint(temperature)}</DemoStage.Annotation>
      </DemoStage>
    </Stack>
  );
}
