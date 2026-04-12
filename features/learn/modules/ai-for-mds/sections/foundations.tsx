"use client";

import { SceneSection } from "@/features/learn/primitives/SceneSection";
import { ProseBlock } from "@/features/learn/primitives/ProseBlock";
import { RevealCard } from "@/features/learn/primitives/RevealCard";
import { Title, Text, SimpleGrid, Stack, Paper, Slider, SegmentedControl } from "@mantine/core";
import { useState } from "react";

const MODEL_SIZES = [
  {
    value: "small",
    label: "Small (7B)",
    response:
      "Catatonia is a condition where people stop moving. Treatment includes benzodiazepines.",
    quality: "Misses differential, scoring, and nuance",
  },
  {
    value: "medium",
    label: "Medium (70B)",
    response:
      "Catatonia involves psychomotor disturbance including stupor, mutism, and posturing. Bush-Francis scale quantifies severity. First-line is lorazepam challenge.",
    quality: "Hits key points but omits important context",
  },
  {
    value: "large",
    label: "Large (400B+)",
    response:
      "Catatonia is a neuropsychiatric syndrome with motor, behavioral, and autonomic features. The Bush-Francis Catatonia Rating Scale screens (14 items) and rates severity (23 items). Differential includes NMS, serotonin syndrome, and anti-NMDAR encephalitis. First-line: lorazepam 1-2mg challenge with response in minutes to hours. ECT for malignant or refractory cases.",
    quality: "Comprehensive: differential, scoring, treatment algorithm",
  },
];

const TEMP_LABELS: Record<string, { style: string; sample: string }> = {
  low: {
    style: "Factual, deterministic, conservative",
    sample:
      "Benzodiazepines are first-line for catatonia per APA guidelines. Lorazepam 1-2mg IV/IM is the standard challenge dose.",
  },
  mid: {
    style: "Balanced, natural, clinically reasoned",
    sample:
      "Benzodiazepines work in catatonia likely through GABA-A modulation in cortico-striatal circuits. The lorazepam challenge both diagnoses and initiates treatment.",
  },
  high: {
    style: "Expansive, exploratory, potentially unreliable",
    sample:
      "Perhaps catatonia is the brain's emergency brake - a phylogenetic freeze response. Benzodiazepines release the brake. What if we combined sub-anesthetic ketamine with lorazepam?",
  },
};

function getTempBand(t: number) {
  if (t <= 0.3) return "low";
  if (t <= 1.2) return "mid";
  return "high";
}

export function FoundationsSection() {
  const [modelSize, setModelSize] = useState("small");
  const [temperature, setTemperature] = useState(0.7);

  const activeModel = MODEL_SIZES.find((m) => m.value === modelSize)!;
  const tempBand = getTempBand(temperature);
  const tempInfo = TEMP_LABELS[tempBand];

  return (
    <SceneSection
      id="foundations"
      title="How LLMs Work"
      subtitle="Seven core concepts every physician should understand"
    >
      <Stack gap="xl">
        {/* 1. Model Size */}
        <Paper radius="lg" p="xl" style={{ background: "var(--surface)" }}>
          <Title order={3} mb="xs">
            Model Size
          </Title>
          <ProseBlock size="sm">
            Model capacity - measured in billions of parameters - determines how
            well an LLM handles complex medical reasoning. Larger models capture
            more nuance, but cost more and run slower.
          </ProseBlock>
          <SegmentedControl
            value={modelSize}
            onChange={setModelSize}
            data={MODEL_SIZES.map((m) => ({
              value: m.value,
              label: m.label,
            }))}
            mt="md"
            mb="md"
            fullWidth
          />
          <RevealCard
            label={`Prompt: "Summarize catatonia features for a medical team"`}
            content={activeModel.response}
            detail={activeModel.quality}
          />
        </Paper>

        {/* 2. Tokens & Probability */}
        <Paper radius="lg" p="xl" style={{ background: "var(--surface)" }}>
          <Title order={3} mb="xs">
            Tokens and Probability
          </Title>
          <ProseBlock size="sm">
            LLMs don't read words - they process tokens (sub-word fragments).
            Each output token is sampled from a probability distribution, which
            is why the same prompt can yield different answers. Medical
            terminology tokenizes very differently across models.
          </ProseBlock>
          <SimpleGrid cols={{ base: 1, sm: 2 }} mt="md">
            <RevealCard
              label="Medical model tokenization"
              content={`"anti-NMDAR encephalitis" becomes 3 clean tokens: [anti] [NMDAR] [encephalitis] - the model understands each concept as a unit.`}
              detail="Preserves medical semantics"
            />
            <RevealCard
              label="General model tokenization"
              content={`"anti-NMDAR encephalitis" fragments into 5+ tokens: [anti] [-NM] [DAR] [enc] [ephalitis] - the model reassembles meaning from pieces, sometimes incorrectly.`}
              detail="Fragmentation can introduce errors"
            />
          </SimpleGrid>
        </Paper>

        {/* 3. Context Window */}
        <Paper radius="lg" p="xl" style={{ background: "var(--surface)" }}>
          <Title order={3} mb="xs">
            Context Window
          </Title>
          <ProseBlock size="sm">
            The context window is everything the model can "see" at once - your
            prompt, the conversation history, and any documents provided. Older
            or longer content that falls outside this window is invisible to the
            model. It will answer confidently even when working with incomplete
            information.
          </ProseBlock>
          <Paper
            radius="md"
            p="md"
            mt="md"
            withBorder
            style={{ fontFamily: "monospace", fontSize: 13, lineHeight: 1.8 }}
          >
            <Text size="sm" fw={600} mb="xs">
              EMR note (multi-page)
            </Text>
            <Text style={{ color: "var(--text-primary)" }}>
              <strong>Oct 15:</strong> Started quetiapine 25mg QHS for delirium.
              <br />
              <strong>Oct 12:</strong> Switched to haloperidol 0.5mg PRN.
            </Text>
            <Text
              style={{ color: "var(--text-primary)", opacity: 0.3 }}
              mt="xs"
            >
              <strong>Sep 28:</strong> Valproic acid 500mg BID started for
              seizure prophylaxis.
              <br />
              <strong>Sep 15:</strong> Admission. PMH: CVA, HTN, DM2.
              <br />
              <em>...12 more pages of documentation...</em>
            </Text>
            <Text size="xs" mt="xs" c="dimmed">
              Grayed text = outside a small context window. The model would say
              "I don't see valproic acid in this record."
            </Text>
          </Paper>
        </Paper>

        {/* 4. Temperature */}
        <Paper radius="lg" p="xl" style={{ background: "var(--surface)" }}>
          <Title order={3} mb="xs">
            Temperature
          </Title>
          <ProseBlock size="sm">
            Temperature controls how "creative" vs "deterministic" the model's
            output is. Low temperature (near 0) picks the most probable token
            every time - ideal for documentation and orders. High temperature
            explores less likely tokens - useful for brainstorming but risky for
            clinical accuracy.
          </ProseBlock>
          <Text size="sm" fw={600} mt="md" mb="xs">
            Temperature: {temperature.toFixed(1)}
          </Text>
          <Slider
            value={temperature}
            onChange={setTemperature}
            min={0}
            max={2}
            step={0.1}
            marks={[
              { value: 0, label: "0.0" },
              { value: 0.7, label: "0.7" },
              { value: 2, label: "2.0" },
            ]}
            mb="xl"
          />
          <Paper radius="md" p="md" withBorder>
            <Text size="xs" fw={600} tt="uppercase" c="dimmed" mb={4}>
              {tempInfo.style}
            </Text>
            <Text size="sm" style={{ color: "var(--text-primary)" }}>
              {tempInfo.sample}
            </Text>
          </Paper>
        </Paper>

        {/* 5. Hallucination vs Grounding */}
        <Paper radius="lg" p="xl" style={{ background: "var(--surface)" }}>
          <Title order={3} mb="xs">
            Hallucination vs Grounding
          </Title>
          <ProseBlock size="sm">
            LLMs can generate plausible-sounding content with no factual basis -
            this is hallucination. Grounding (retrieval-augmented generation)
            ties answers to verifiable documents. Always ask: is this output
            grounded in sources I can check?
          </ProseBlock>
          <SimpleGrid cols={{ base: 1, sm: 2 }} mt="md">
            <RevealCard
              label="Without grounding"
              content="Prophylactic haloperidol reduces ICU delirium incidence by 40% in elderly post-surgical patients, making it a reasonable default protocol."
              detail="Sounds authoritative but cites no source - unverifiable"
            />
            <RevealCard
              label="With grounding (RAG)"
              content="The APA Practice Guidelines (2023) found limited evidence for routine prophylactic antipsychotics. The HOPE-ICU trial showed no significant reduction in delirium incidence with haloperidol prophylaxis (RR 0.94, 95% CI 0.74-1.20)."
              detail="Each claim tied to a specific, verifiable source"
            />
          </SimpleGrid>
        </Paper>

        {/* 6. LLM Internal Flow */}
        <Paper radius="lg" p="xl" style={{ background: "var(--surface)" }}>
          <Title order={3} mb="xs">
            Inside the LLM: Four Stages
          </Title>
          <ProseBlock size="sm">
            Every response passes through four stages. Understanding this
            pipeline helps you evaluate AI tools and ask vendors the right
            questions: Where does retrieval happen? What logs are kept?
          </ProseBlock>
          <SimpleGrid cols={{ base: 1, sm: 2 }} mt="md">
            <RevealCard
              label="1. Encode"
              content="Text is split into tokens, then converted to high-dimensional vectors that capture semantic meaning. 'Chest pain' and 'thoracic discomfort' map to nearby regions."
            />
            <RevealCard
              label="2. Think"
              content="Attention layers let every token 'look at' every other token to build context. This is where the model connects 'chest pain' with 'recent travel' to consider PE."
            />
            <RevealCard
              label="3. Speak"
              content="The model samples the next token from a probability distribution shaped by attention. Temperature controls how adventurous this sampling is."
            />
            <RevealCard
              label="4. Ground"
              content="Optional retrieval step: the system fetches relevant documents (guidelines, notes) and feeds them back into the context. Without this, the model relies solely on pretraining."
            />
          </SimpleGrid>
        </Paper>

        {/* 7. Chain-of-Thought */}
        <Paper radius="lg" p="xl" style={{ background: "var(--surface)" }}>
          <Title order={3} mb="xs">
            Chain-of-Thought Reasoning
          </Title>
          <ProseBlock size="sm">
            Chain-of-thought prompts the model to show its reasoning steps
            before reaching a conclusion. This improves transparency but
            introduces a subtle risk: a fluent, well-structured chain of
            reasoning can inspire more confidence than it deserves. Treat it as
            an idea generator, not validated clinical logic.
          </ProseBlock>
          <Stack gap="sm" mt="md">
            <RevealCard
              label="Step 1: Gather"
              content="Patient is 72yo male, post-op day 3, new-onset agitation, pulling at lines, inattentive on CAM-ICU."
            />
            <RevealCard
              label="Step 2: Interpret"
              content="Acute onset + inattention + fluctuating course meets DSM-5 criteria for delirium. Post-operative timing suggests multifactorial etiology."
            />
            <RevealCard
              label="Step 3: Differentiate"
              content="Consider medication-induced (opioids, anticholinergics), metabolic (electrolytes, glucose), infectious (UTI, pneumonia), and withdrawal etiologies."
            />
            <RevealCard
              label="Step 4: Conclude"
              content="Recommend: CBC, CMP, UA, blood cultures, medication reconciliation focused on anticholinergic burden. Non-pharmacologic interventions first; low-dose haloperidol if severe agitation."
              detail="Each step is inspectable - but verify the logic independently"
            />
          </Stack>
        </Paper>
      </Stack>
    </SceneSection>
  );
}
