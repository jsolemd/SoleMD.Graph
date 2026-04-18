"use client";

import { lazy, Suspense } from "react";
import type {
  WikiPageResponse,
  WikiPageContextResponse,
  WikiBodyEntityMatch,
} from "@/lib/engine/wiki-types";

// ---------------------------------------------------------------------------
// Shared props contract for all entity profile cards
// ---------------------------------------------------------------------------

export interface EntityProfileProps {
  page: WikiPageResponse;
  pageContext: WikiPageContextResponse | null;
  bodyMatches: WikiBodyEntityMatch[];
  onNavigate: (slug: string) => void;
}

// ---------------------------------------------------------------------------
// Lazy-loaded profile components (only loaded when entity type matches)
// ---------------------------------------------------------------------------

const ChemicalProfile = lazy(() => import("./ChemicalProfile"));
const DiseaseProfile = lazy(() => import("./DiseaseProfile"));
const GeneReceptorProfile = lazy(() => import("./GeneReceptorProfile"));
const AnatomyProfile = lazy(() => import("./AnatomyProfile"));
const NetworkProfile = lazy(() => import("./NetworkProfile"));

// ---------------------------------------------------------------------------
// Dispatcher — renders the correct profile card based on entity_type
// ---------------------------------------------------------------------------

export function EntityVisualCard(props: EntityProfileProps) {
  const entityType = props.page.entity_type?.toLowerCase();
  if (!entityType) return null;

  let Profile: React.LazyExoticComponent<React.ComponentType<EntityProfileProps>> | null = null;

  switch (entityType) {
    case "chemical":
      Profile = ChemicalProfile;
      break;
    case "disease":
      Profile = DiseaseProfile;
      break;
    case "gene":
    case "receptor":
      Profile = GeneReceptorProfile;
      break;
    case "anatomy":
      Profile = AnatomyProfile;
      break;
    case "network":
    case "biological process":
      Profile = NetworkProfile;
      break;
    default:
      return null;
  }

  return (
    <Suspense fallback={null}>
      <Profile {...props} />
    </Suspense>
  );
}
