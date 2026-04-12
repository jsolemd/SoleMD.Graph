"use client";

import { KeyFactsSection } from "@/features/wiki/module-runtime/sections/KeyFactsSection";
import { MechanismSection } from "@/features/wiki/module-runtime/sections/MechanismSection";
import { BeforeAfterSection } from "@/features/wiki/module-runtime/sections/BeforeAfterSection";
import { DefinitionStackSection } from "@/features/wiki/module-runtime/sections/DefinitionStackSection";
import { ResourcesSection } from "@/features/wiki/module-runtime/sections/ResourcesSection";
import { CaseVignetteSection } from "@/features/wiki/module-runtime/sections/CaseVignetteSection";
import { SceneSection } from "@/features/wiki/module-runtime/primitives/SceneSection";
import { ProseBlock } from "@/features/wiki/module-runtime/primitives/ProseBlock";
import { FoundationsSection } from "./sections/foundations";
import {
  introFacts,
  guideIntroContent,
  promptingStages,
  expertComparisons,
  saferSteps,
  toolkitItems,
  toolkitCategories,
  workflowStages,
  clinicalCase,
  conclusionFacts,
} from "./data";

export default function AiForMdsContent() {
  return (
    <>
      {/* 1. Introduction — 6 learning journey tiles */}
      <KeyFactsSection
        sectionId="introduction"
        facts={introFacts}
        title="Your Learning Journey"
        columns={3}
      />

      {/* 2. Guide Intro — orientation prose */}
      <SceneSection id="guide-intro" title="How This Module Works">
        <ProseBlock>{guideIntroContent}</ProseBlock>
      </SceneSection>

      {/* 3. Foundations — bespoke 7-topic section */}
      <FoundationsSection />

      {/* 4. Precision Prompting — 6-part builder as stages */}
      <MechanismSection
        sectionId="prompting"
        stages={promptingStages}
        title="Precision Prompting"
      />

      {/* 5. Expert vs Novice — before/after comparison */}
      <BeforeAfterSection
        sectionId="expert"
        items={expertComparisons}
        title="From Novice to Expert"
        beforeLabel="Novice Prompt"
        afterLabel="Expert Prompt"
      />

      {/* 6. S.A.F.E.R. Framework — 5 steps */}
      <DefinitionStackSection
        sectionId="safer"
        items={saferSteps}
        title="The S.A.F.E.R. Framework"
      />

      {/* 7. Research Toolkit — 24 tools with categories */}
      <ResourcesSection
        sectionId="toolkit"
        items={toolkitItems}
        title="Research Toolkit"
        categories={toolkitCategories}
      />

      {/* 8. AI-Augmented Workflow — 5 research stages */}
      <MechanismSection
        sectionId="workflow"
        stages={workflowStages}
        title="From Idea to Manuscript"
      />

      {/* 9. Clinical Case — Ms. K */}
      <CaseVignetteSection sectionId="clinical-case" data={clinicalCase} />

      {/* 10. Conclusion — key takeaways */}
      <KeyFactsSection
        sectionId="conclusion"
        facts={conclusionFacts}
        title="Key Takeaways"
        columns={2}
      />
    </>
  );
}
