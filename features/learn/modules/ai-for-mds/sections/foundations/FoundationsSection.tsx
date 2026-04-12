"use client";

import { Stack } from "@mantine/core";
import { SceneSection } from "@/features/learn/primitives/SceneSection";
import { ModelSizeDemo } from "./ModelSizeDemo";
import { TokenDemo } from "./TokenDemo";
import { ContextDemo } from "./ContextDemo";
import { TemperatureDemo } from "./TemperatureDemo";
import { HallucinationDemo } from "./HallucinationDemo";
import { PipelineDemo } from "./PipelineDemo";
import { ChainOfThoughtDemo } from "./ChainOfThoughtDemo";

export function FoundationsSection() {
  return (
    <SceneSection
      id="foundations"
      title="How LLMs Work"
      subtitle="Seven core concepts every physician should understand"
    >
      <Stack gap={48}>
        <ModelSizeDemo />
        <TokenDemo />
        <ContextDemo />
        <TemperatureDemo />
        <HallucinationDemo />
        <PipelineDemo />
        <ChainOfThoughtDemo />
      </Stack>
    </SceneSection>
  );
}
