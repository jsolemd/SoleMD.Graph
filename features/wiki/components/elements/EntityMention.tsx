"use client";

import { useCallback, useRef } from "react";
import { useEntityHover } from "@/features/graph/components/entities/use-entity-hover";
import type { WikiBodyEntityMatch } from "@/lib/engine/wiki-types";
import type { ReactNode } from "react";

export interface EntityMentionProps {
  entityMatch: WikiBodyEntityMatch;
  children: ReactNode;
}

/**
 * Inline entity mention in wiki body text — shows hover card on pointer enter.
 * Renders as a <span> (not a button) since there is no navigation action.
 */
export function EntityMention({ entityMatch, children }: EntityMentionProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const { show, hide } = useEntityHover();

  const handlePointerEnter = useCallback(() => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    show({
      entity: {
        entityType: entityMatch.entity_type,
        conceptNamespace: entityMatch.concept_namespace,
        conceptId: entityMatch.concept_id,
        sourceIdentifier: entityMatch.source_identifier,
        canonicalName: entityMatch.canonical_name,
      },
      x: rect.left,
      y: rect.top,
    });
  }, [entityMatch, show]);

  const handlePointerLeave = useCallback(() => {
    hide();
  }, [hide]);

  return (
    <span
      ref={ref}
      className="wiki-entity-mention"
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      data-entity-type={entityMatch.entity_type.toLowerCase()}
    >
      {children}
    </span>
  );
}
