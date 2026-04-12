"use client";

import { Text, Title, Stack } from "@mantine/core";
import { ChatThread } from "@/features/learn/interactions";
import { DemoStage } from "@/features/learn/interactions";

/* ── Reasoning chain data ── */

const STEPS = [
  {
    label: "Step 1: Gather",
    content:
      "Patient is 72yo male, post-op day 3, new-onset agitation, pulling at lines, inattentive on CAM-ICU.",
  },
  {
    label: "Step 2: Interpret",
    content:
      "Acute onset + inattention + fluctuating course meets DSM-5 criteria for delirium. Post-operative timing suggests multifactorial etiology.",
  },
  {
    label: "Step 3: Differentiate",
    content:
      "Consider medication-induced (opioids, anticholinergics), metabolic (electrolytes, glucose), infectious (UTI, pneumonia), and withdrawal etiologies.",
  },
  {
    label: "Step 4: Conclude",
    content:
      "Recommend: CBC, CMP, UA, blood cultures, medication reconciliation focused on anticholinergic burden. Non-pharmacologic interventions first; low-dose haloperidol if severe agitation.",
  },
];

const MESSAGE_COUNT = 1 + STEPS.length; // 1 user + 4 AI

/* ── Main ── */

export function ChainOfThoughtDemo() {
  return (
    <Stack gap="md">
      <Title order={3}>Chain-of-Thought Reasoning</Title>
      <Text size="sm" style={{ color: "var(--text-secondary)" }}>
        Prompting the model to &quot;think step by step&quot; produces
        inspectable reasoning chains. Press Next to reveal each reasoning step.
      </Text>

      <ChatThread messageCount={MESSAGE_COUNT}>
        <ChatThread.Message index={0} role="user">
          A 72-year-old man, post-op day 3, is suddenly agitated and pulling at
          his IV lines. Nursing reports he was calm yesterday. Think through
          this step by step.
        </ChatThread.Message>

        {STEPS.map((step, i) => (
          <ChatThread.Message key={step.label} index={i + 1} role="ai">
            <div>
              <Text
                component="span"
                size="sm"
                fw={700}
                style={{ color: "var(--module-accent)" }}
              >
                {step.label}
              </Text>
              <Text
                component="span"
                size="sm"
                style={{ color: "var(--text-primary)" }}
              >
                {" "}
                {step.content}
              </Text>
            </div>
          </ChatThread.Message>
        ))}

        <ChatThread.Controls nextLabel="Next step" />
      </ChatThread>

      <DemoStage.Annotation>
        Each step is inspectable - but verify the logic independently. The model
        can produce confident-sounding reasoning chains that contain subtle
        errors.
      </DemoStage.Annotation>
    </Stack>
  );
}
