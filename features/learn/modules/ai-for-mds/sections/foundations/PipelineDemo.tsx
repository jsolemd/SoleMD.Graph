"use client";

import { motion } from "framer-motion";
import { Text, Title, Stack } from "@mantine/core";
import { StepThrough } from "@/features/learn/interactions";
import { useStepThroughContext } from "@/features/learn/interactions/StepThrough/StepThrough";
import { prefersReducedMotion } from "@/features/learn/motion";

/* ── Pipeline SVG ── */

const STAGES = ["Encode", "Think", "Speak", "Ground"];

function PipelineSVG() {
  const { activeStep } = useStepThroughContext();
  const reduced = prefersReducedMotion();
  const width = 600;
  const height = 80;
  const spacing = width / (STAGES.length + 1);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full max-w-lg mx-auto mb-4"
      role="img"
      aria-label={`Pipeline stage ${activeStep + 1} of ${STAGES.length}: ${STAGES[activeStep]}`}
    >
      {/* Connection lines */}
      {STAGES.slice(0, -1).map((_, i) => (
        <motion.line
          key={`line-${i}`}
          x1={spacing * (i + 1) + 20}
          y1={height / 2 - 4}
          x2={spacing * (i + 2) - 20}
          y2={height / 2 - 4}
          strokeWidth={2}
          initial={false}
          animate={{
            stroke:
              i < activeStep
                ? "var(--module-accent)"
                : "var(--border-default)",
          }}
          transition={{ duration: 0.3 }}
        />
      ))}

      {/* Stage circles */}
      {STAGES.map((label, i) => {
        const cx = spacing * (i + 1);
        const cy = height / 2 - 4;
        const isActive = i === activeStep;
        const isPast = i < activeStep;
        const lit = isActive || isPast;

        return (
          <g key={label}>
            <motion.circle
              cx={cx}
              cy={cy}
              r={18}
              strokeWidth={2}
              initial={false}
              animate={{
                fill: lit ? "var(--module-accent)" : "var(--surface)",
                stroke: lit
                  ? "var(--module-accent)"
                  : "var(--border-default)",
              }}
              transition={{ duration: 0.3 }}
            />

            {/* Pulse ring on active */}
            {isActive && !reduced && (
              <motion.circle
                cx={cx}
                cy={cy}
                r={18}
                fill="none"
                stroke="var(--module-accent)"
                strokeWidth={2}
                initial={{ r: 18, opacity: 0.6 }}
                animate={{ r: 28, opacity: 0 }}
                transition={{ duration: 1.5, repeat: Infinity }}
              />
            )}

            <text
              x={cx}
              y={cy + 4}
              textAnchor="middle"
              fill={lit ? "white" : "var(--text-secondary)"}
              fontSize={10}
              fontWeight={600}
            >
              {i + 1}
            </text>
            <text
              x={cx}
              y={cy + 36}
              textAnchor="middle"
              fill="var(--text-secondary)"
              fontSize={11}
            >
              {label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/* ── Step content data ── */

const STEPS = [
  {
    title: "Encode",
    content:
      "Text is split into tokens, then converted to high-dimensional vectors. \"Chest pain\" and \"thoracic discomfort\" map to nearby regions in this vector space - the model already sees them as related before any reasoning begins.",
    detail: "chest pain  ->  [0.82, -0.14, 0.67, ...]  (768 dimensions)",
  },
  {
    title: "Think",
    content:
      "Attention layers let every token \"look at\" every other token. The model connects \"chest pain\" with \"recent travel\" to weigh pulmonary embolism. This is where clinical reasoning emerges - patterns across the entire context.",
    detail: "chest pain + recent flight + tachycardia  ->  PE probability rises",
  },
  {
    title: "Speak",
    content:
      "The model samples the next token from a probability distribution shaped by attention. Temperature controls whether it picks the most likely token or explores alternatives. One token at a time, the response takes shape.",
    detail: "P(\"Consider\") = 0.31, P(\"Evaluate\") = 0.28, P(\"The\") = 0.12 ...",
  },
  {
    title: "Ground",
    content:
      "Optional retrieval step: the system fetches relevant documents (guidelines, studies, patient records) and feeds them back into context. This is how RAG prevents hallucination - the model reasons over real evidence, not just training data.",
    detail: "Retrieved: Wells criteria, PERC rule, ACEP clinical policy 2023",
  },
];

/* ── Main ── */

export function PipelineDemo() {
  return (
    <Stack gap="md">
      <Title order={3}>How LLMs Process Text</Title>
      <Text size="sm" style={{ color: "var(--text-secondary)" }}>
        Four stages transform your clinical question into a response. Step
        through each to see what happens to &quot;chest pain&quot; at every
        stage.
      </Text>

      <StepThrough stepCount={STEPS.length}>
        <PipelineSVG />

        {STEPS.map((step, i) => (
          <StepThrough.Step key={step.title} index={i} title={step.title}>
            <Stack gap="sm">
              <Text
                size="sm"
                style={{ color: "var(--text-primary)", lineHeight: 1.6 }}
              >
                {step.content}
              </Text>
              <code
                className="block rounded-md px-3 py-2 text-xs"
                style={{
                  background:
                    "color-mix(in srgb, var(--module-accent) 6%, var(--surface))",
                  color: "var(--module-accent)",
                  border: "1px solid var(--border-default)",
                  fontFamily: "var(--mantine-font-family-monospace, monospace)",
                }}
              >
                {step.detail}
              </code>
            </Stack>
          </StepThrough.Step>
        ))}

        <div className="mt-2">
          <StepThrough.Nav />
        </div>
      </StepThrough>
    </Stack>
  );
}
