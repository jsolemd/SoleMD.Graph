"use client";

import { useCallback, useMemo, useState } from "react";
import type { EntityHoverCardModel } from "@/features/graph/components/entities/entity-hover-card";
import type { EntityTextScope } from "@/features/graph/components/entities/entity-text-runtime";
import { useEntityTextRuntime } from "@/features/graph/components/entities/use-entity-text-runtime";
import type { GraphEntityTextMatch } from "@/features/graph/types/entity-service";
import type {
  EntityHighlight,
  EntityHighlightHoverState,
} from "./entity-highlight-extension";

interface UseEditorEntityRuntimeArgs {
  enabled: boolean;
  matchLimit?: number;
}

interface UseEditorEntityRuntimeState {
  entityHighlights: readonly EntityHighlight[];
  entityHoverCard: EntityHoverCardModel | null;
  handleTextContextChange: (context: EntityTextScope | null) => void;
  handleEntityHoverChange: (hover: EntityHighlightHoverState | null) => void;
}

export function useEditorEntityRuntime({
  enabled,
  matchLimit = 24,
}: UseEditorEntityRuntimeArgs): UseEditorEntityRuntimeState {
  const [textScope, setTextScope] = useState<EntityTextScope | null>(null);
  const {
    entityMatches,
    entityHoverCard,
    handleTextScopeChange,
    handleEntityHoverTargetChange,
  } = useEntityTextRuntime({
    enabled,
    matchLimit,
  });

  const entityHighlights = useMemo(
    () =>
      Object.freeze(
        entityMatches.map((match) =>
          mapEntityMatchToHighlight(match, textScope?.textFrom ?? 0),
        ),
      ) as readonly EntityHighlight[],
    [entityMatches, textScope?.textFrom],
  );

  const handleTextContextChange = useCallback(
    (nextContext: EntityTextScope | null) => {
      setTextScope(nextContext);
      handleTextScopeChange(nextContext);
    },
    [handleTextScopeChange],
  );

  const handleEntityHoverChange = useCallback(
    (hover: EntityHighlightHoverState | null) => {
      if (!hover) {
        handleEntityHoverTargetChange(null);
        return;
      }

      handleEntityHoverTargetChange({
        entity: hover.highlight.entity,
        paperCount: hover.highlight.paperCount,
        x: hover.x,
        y: hover.y,
      });
    },
    [handleEntityHoverTargetChange],
  );

  return {
    entityHighlights,
    entityHoverCard,
    handleTextContextChange,
    handleEntityHoverChange,
  };
}

function mapEntityMatchToHighlight(
  match: GraphEntityTextMatch,
  textFrom: number,
): EntityHighlight {
  return {
    id: match.matchId,
    from: textFrom + match.startOffset,
    to: textFrom + match.endOffset,
    matchedText: match.matchedText,
    entity: {
      entityType: match.entityType,
      conceptNamespace: match.conceptNamespace,
      conceptId: match.conceptId,
      sourceIdentifier: match.sourceIdentifier,
      canonicalName: match.canonicalName,
    },
    paperCount: match.paperCount,
  };
}
