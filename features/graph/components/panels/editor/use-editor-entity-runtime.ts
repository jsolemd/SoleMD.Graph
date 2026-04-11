"use client";

import { useCallback, useMemo, useState } from "react";
import type { EntityTextScope } from "@/features/graph/components/entities/entity-text-runtime";
import { useEntityTextRuntime } from "@/features/graph/components/entities/use-entity-text-runtime";
import { useEntityHover } from "@/features/graph/components/entities/use-entity-hover";
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
  handleTextContextChange: (context: EntityTextScope | null) => void;
  handleEntityHoverChange: (hover: EntityHighlightHoverState | null) => void;
}

export function useEditorEntityRuntime({
  enabled,
  matchLimit = 24,
}: UseEditorEntityRuntimeArgs): UseEditorEntityRuntimeState {
  const [textScope, setTextScope] = useState<EntityTextScope | null>(null);
  const { show, hide } = useEntityHover();
  const {
    entityMatches,
    handleTextScopeChange,
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
        hide();
        return;
      }

      show({
        entity: hover.highlight.entity,
        paperCount: hover.highlight.paperCount,
        x: hover.x,
        y: hover.y,
      });
    },
    [show, hide],
  );

  return {
    entityHighlights,
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
