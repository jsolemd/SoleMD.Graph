import { RAG_ANSWER_SELECTION_SOURCE_ID } from "@/features/graph/lib/overlay-producers";

export type SelectionScopeSource =
  | "none"
  | "current"
  | "selected"
  | "focused"
  | "answer_linked";

function hasCurrentSelectionScope(currentPointScopeSql?: string | null): boolean {
  return (
    typeof currentPointScopeSql === "string" &&
    currentPointScopeSql.trim().length > 0
  );
}

export function getSelectionScopeSource(args: {
  hasQueries: boolean
  currentPointScopeSql?: string | null
  selectedPointCount: number
  hasSelectedNode: boolean
  activeSelectionSourceId?: string | null
}): SelectionScopeSource {
  if (!args.hasQueries) {
    return "none";
  }

  const answerLinkedSelection =
    args.selectedPointCount > 0 &&
    args.activeSelectionSourceId === RAG_ANSWER_SELECTION_SOURCE_ID;

  if (answerLinkedSelection) {
    return args.hasSelectedNode ? "focused" : "answer_linked";
  }

  if (hasCurrentSelectionScope(args.currentPointScopeSql)) {
    return "current";
  }

  if (args.selectedPointCount > 0) {
    return "selected";
  }

  if (args.hasSelectedNode) {
    return "focused";
  }

  return "none";
}

export function isSelectionScopeAvailable(args: {
  hasQueries: boolean
  currentPointScopeSql?: string | null
  selectedPointCount: number
  hasSelectedNode: boolean
  activeSelectionSourceId?: string | null
}): boolean {
  const source = getSelectionScopeSource(args);
  return source !== "none" && source !== "answer_linked";
}

export function isSelectionScopeEnabled(args: {
  available: boolean
  manuallyDisabled: boolean
}): boolean {
  return args.available && !args.manuallyDisabled
}

export function getSelectionScopeToggleLabel(args: {
  hasQueries: boolean
  currentPointScopeSql?: string | null
  selectedPointCount: number
  hasSelectedNode?: boolean
  activeSelectionSourceId?: string | null
}): string {
  const source = getSelectionScopeSource({
    hasQueries: args.hasQueries,
    currentPointScopeSql: args.currentPointScopeSql,
    selectedPointCount: args.selectedPointCount,
    hasSelectedNode: Boolean(args.hasSelectedNode),
    activeSelectionSourceId: args.activeSelectionSourceId,
  });

  switch (source) {
    case "answer_linked":
      return "Answer-linked studies are selected; click or lasso papers to scope a new query";
    case "current":
      return "Limit evidence to the current graph selection";
    case "selected":
      return `Limit evidence to the current selection (${args.selectedPointCount} papers)`;
    case "focused":
      return "Limit evidence to the focused paper";
    default:
      return "Select papers on the graph or narrow the current view to enable selection scope";
  }
}
