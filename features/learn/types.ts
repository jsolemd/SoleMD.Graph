import type { AnimationRef } from "@/features/animations/manifest";

export type ModuleAccent =
  | "soft-blue"
  | "muted-indigo"
  | "golden-yellow"
  | "fresh-green"
  | "warm-coral"
  | "soft-pink"
  | "soft-lavender"
  | "paper";

export interface GlossaryEntry {
  term: string;
  definition: string;
  aliases?: string[];
  sources?: string[];
  related?: string[];
}

export interface ModuleCitation {
  id: string;
  text: string;
  url?: string;
  pmid?: number;
}

export interface ModuleSection {
  id: string;
  title: string;
  subtitle?: string;
  accent?: ModuleAccent;
}

export interface ModuleManifest {
  slug: string;
  title: string;
  accent: ModuleAccent;
  audience: string;
  estimatedMinutes: number;
  version: string;
  lastUpdated: string;
  authors: string[];
  objectives: string[];
  sections: ModuleSection[];
  citations: ModuleCitation[];
  glossaryTerms: string[];
  animations: string[];
  wikiSlug?: string;
}

export interface KeyFact {
  label: string;
  description: string;
  icon?: string;
}

export interface MechanismStage {
  id: string;
  title: string;
  description: string;
  animationName?: string;
}

export interface BeforeAfterItem {
  label: string;
  before: string;
  after: string;
}

export interface DefinitionItem {
  term: string;
  definition: string;
  detail?: string;
}

export interface CaseVignetteData {
  title: string;
  scenario: string;
  reveals: CaseReveal[];
}

export interface CaseReveal {
  label: string;
  content: string;
}

export interface ResourceItem {
  title: string;
  description: string;
  url?: string;
  category?: string;
}

export interface KeyFactsSectionProps {
  facts: KeyFact[];
  title?: string;
  columns?: 2 | 3;
  sectionId?: string;
}

export interface MechanismSectionProps {
  stages: MechanismStage[];
  title?: string;
  sectionId?: string;
}

export interface BeforeAfterSectionProps {
  items: BeforeAfterItem[];
  title?: string;
  beforeLabel?: string;
  afterLabel?: string;
  sectionId?: string;
}

export interface DefinitionStackSectionProps {
  items: DefinitionItem[];
  title?: string;
  sectionId?: string;
}

export interface CaseVignetteSectionProps {
  data: CaseVignetteData;
  sectionId?: string;
}

export interface ResourcesSectionProps {
  items: ResourceItem[];
  title?: string;
  categories?: string[];
  sectionId?: string;
}
