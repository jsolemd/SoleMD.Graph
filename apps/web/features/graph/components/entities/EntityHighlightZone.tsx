"use client";

import { useRef } from "react";
import {
  useDomEntityHighlights,
  type UseDomEntityHighlightsOptions,
} from "./use-dom-entity-highlights";

interface EntityHighlightZoneProps extends UseDomEntityHighlightsOptions {
  children: React.ReactNode;
}

/**
 * Wraps arbitrary React content and annotates rendered text with entity
 * highlights at the DOM level. Works on any surface — module content,
 * RAG output, AI-generated text — without requiring a remark pipeline.
 *
 * Uses the same `.wiki-entity-mention[data-entity-type]` CSS contract
 * and `useEntityHover()` context as the markdown pipeline.
 */
export function EntityHighlightZone({
  children,
  enabled,
  matchLimit,
  debounceMs,
}: EntityHighlightZoneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  useDomEntityHighlights(containerRef, { enabled, matchLimit, debounceMs });

  return <div ref={containerRef}>{children}</div>;
}
