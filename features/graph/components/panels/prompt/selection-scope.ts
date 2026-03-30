import { RAG_ANSWER_SELECTION_SOURCE_ID } from "@/features/graph/lib/overlay-producers";

export function isSelectionScopeAvailable(args: {
  hasQueries: boolean
  selectedPointCount: number
  hasSelectedNode: boolean
  activeSelectionSourceId?: string | null
}): boolean {
  const hasEligibleSelection =
    args.selectedPointCount > 0 &&
    args.activeSelectionSourceId !== RAG_ANSWER_SELECTION_SOURCE_ID
  return args.hasQueries && (hasEligibleSelection || args.hasSelectedNode)
}

export function isSelectionScopeEnabled(args: {
  available: boolean
  manuallyDisabled: boolean
}): boolean {
  return args.available && !args.manuallyDisabled
}

export function getSelectionScopeToggleLabel(args: {
  available: boolean
  selectedPointCount: number
  activeSelectionSourceId?: string | null
}): string {
  if (!args.available) {
    if (
      args.selectedPointCount > 0 &&
      args.activeSelectionSourceId === RAG_ANSWER_SELECTION_SOURCE_ID
    ) {
      return "Answer-linked studies are selected; click or lasso papers to scope a new query"
    }
    return "Select papers on the graph to enable selection scope"
  }

  if (args.selectedPointCount > 0) {
    return `Limit evidence to the current selection (${args.selectedPointCount} papers)`
  }

  return "Limit evidence to the focused paper"
}
