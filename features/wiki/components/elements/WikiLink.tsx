"use client";

import { useCallback, useRef } from "react";
import type { WikiLinkProps } from "@/features/wiki/lib/markdown-pipeline";
import { useEntityHover } from "@/features/graph/components/entities/use-entity-hover";

/**
 * Inline wiki link — navigates within the panel.
 * Entity links show a hover card via the shared EntityHoverCardProvider
 * and get data-entity-type for CSS accent coloring.
 */
export function WikiLink({ slug, children, onNavigate, entityType, conceptId }: WikiLinkProps) {
  const ref = useRef<HTMLButtonElement>(null);
  const { show, hide } = useEntityHover();
  const isEntity = entityType != null && conceptId != null;

  const handlePointerEnter = useCallback(() => {
    if (!isEntity || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    show({
      entity: {
        entityType: entityType!,
        conceptNamespace: conceptId!.includes(":") ? conceptId!.split(":")[0] : null,
        conceptId: conceptId!,
        sourceIdentifier: conceptId!,
        canonicalName: ref.current.textContent ?? slug,
      },
      x: rect.left,
      y: rect.top,
    });
  }, [isEntity, entityType, conceptId, slug, show]);

  const handlePointerLeave = useCallback(() => {
    if (isEntity) hide();
  }, [isEntity, hide]);

  return (
    <button
      ref={ref}
      type="button"
      className="wiki-link"
      onClick={() => onNavigate(slug)}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      title={slug}
      data-entity-type={entityType?.toLowerCase() ?? undefined}
    >
      {children}
    </button>
  );
}
