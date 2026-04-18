"use client";

import { useCallback, useRef } from "react";
import { useEntityHover } from "@/features/graph/components/entities/use-entity-hover";
import type { WikiBodyEntityMatch } from "@solemd/api-client/shared/wiki-types";
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

  const showAt = useCallback(
    (pinned: boolean) => {
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
        pinned,
      });
    },
    [entityMatch, show],
  );

  // Mouse uses the fluent hover path; touch pins the card on click and
  // dismisses via the provider's outside-click listener. We latch the
  // pointer type at pointerdown and consume it on click — the click
  // event itself isn't reliably a PointerEvent across browsers.
  const lastPointerTypeRef = useRef<string>("mouse");

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLSpanElement>) => {
      lastPointerTypeRef.current = e.pointerType || "mouse";
    },
    [],
  );

  const handlePointerEnter = useCallback(
    (e: React.PointerEvent<HTMLSpanElement>) => {
      if (e.pointerType === "touch") return;
      showAt(false);
    },
    [showAt],
  );

  const handlePointerLeave = useCallback(
    (e: React.PointerEvent<HTMLSpanElement>) => {
      if (e.pointerType === "touch") return;
      hide();
    },
    [hide],
  );

  const handleClick = useCallback(() => {
    if (lastPointerTypeRef.current !== "touch") return;
    showAt(true);
  }, [showAt]);

  return (
    <span
      ref={ref}
      className="wiki-entity-mention"
      onPointerDown={handlePointerDown}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      onClick={handleClick}
      data-entity-type={entityMatch.entity_type.toLowerCase()}
    >
      {children}
    </span>
  );
}
