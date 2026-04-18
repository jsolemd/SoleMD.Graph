import { hasCurrentPointScopeSql } from "@/features/graph/lib/selection-query-state";
import type {
  GraphBundleQueries,
  GraphPointRecord,
} from "@solemd/graph";

export interface PromptScopeRequest {
  selectionGraphPaperRefs: string[] | null;
  scopeMode: "selection_only" | null;
}

interface ResolvePromptScopeRequestArgs {
  selectionScopeEnabled: boolean;
  currentPointScopeSql: string | null;
  queries: GraphBundleQueries | null;
  selectedNode: GraphPointRecord | null;
}

export function getPromptScopeCacheKey({
  selectionScopeEnabled,
  currentPointScopeSql,
  selectedNode,
}: {
  selectionScopeEnabled: boolean;
  currentPointScopeSql: string | null;
  selectedNode: GraphPointRecord | null;
}): string {
  if (!selectionScopeEnabled) {
    return "global";
  }

  return JSON.stringify({
    selectionScopeEnabled,
    currentPointScopeSql: currentPointScopeSql ?? null,
    selectedGraphPaperRef:
      selectedNode?.paperId ?? selectedNode?.id ?? null,
  });
}

export async function resolvePromptScopeRequest({
  selectionScopeEnabled,
  currentPointScopeSql,
  queries,
  selectedNode,
}: ResolvePromptScopeRequestArgs): Promise<PromptScopeRequest> {
  if (!selectionScopeEnabled) {
    return {
      selectionGraphPaperRefs: null,
      scopeMode: null,
    };
  }

  const hasCurrentScope = hasCurrentPointScopeSql(currentPointScopeSql);
  const selectionGraphPaperRefs = queries
    ? Array.from(
        new Set(
          (
            await queries.getSelectionScopeGraphPaperRefs({
              currentPointScopeSql,
            })
          ).filter((graphPaperRef) => graphPaperRef.trim().length > 0),
        ),
      )
    : [];
  const fallbackGraphPaperRef = !hasCurrentScope
    ? (selectedNode?.paperId ?? selectedNode?.id ?? null)
    : null;

  if (selectionGraphPaperRefs.length > 0) {
    return {
      selectionGraphPaperRefs,
      scopeMode: "selection_only",
    };
  }

  if (fallbackGraphPaperRef) {
    return {
      selectionGraphPaperRefs: [fallbackGraphPaperRef],
      scopeMode: "selection_only",
    };
  }

  throw new Error(
    "Selection scope is enabled, but no graph papers are available in the current graph selection.",
  );
}
