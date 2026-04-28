import type { OverlayProducerId } from "@solemd/graph";

export const MANUAL_CLUSTER_NEIGHBORHOOD_OVERLAY_PRODUCER =
  "manual:cluster-neighborhood" satisfies OverlayProducerId;
export const LEGACY_OVERLAY_PRODUCER =
  "overlay:legacy" satisfies OverlayProducerId;
export const RAG_ASK_OVERLAY_PRODUCER =
  "rag:ask" satisfies OverlayProducerId;
export const RAG_EVIDENCE_ASSIST_SUPPORT_OVERLAY_PRODUCER =
  "rag:evidence-assist:support" satisfies OverlayProducerId;
export const RAG_EVIDENCE_ASSIST_REFUTE_OVERLAY_PRODUCER =
  "rag:evidence-assist:refute" satisfies OverlayProducerId;
export const RAG_EVIDENCE_ASSIST_BOTH_OVERLAY_PRODUCER =
  "rag:evidence-assist:both" satisfies OverlayProducerId;
export const ENTITY_GRAPH_OVERLAY_PRODUCER =
  "entity:graph" satisfies OverlayProducerId;
export const WIKI_PAGE_OVERLAY_PRODUCER =
  "wiki:page" satisfies OverlayProducerId;
export const RAG_ANSWER_SELECTION_SOURCE_ID = "rag:answer-selection";
export const ENTITY_OVERLAY_SELECTION_SOURCE_ID = "entity:overlay";
export const WIKI_PAGE_SELECTION_SOURCE_ID = "wiki:page";
export const ORB_MANUAL_SELECTION_SOURCE_ID = "orb:manual-selection";

const SELECTED_POINT_BASELINE_SOURCE_IDS = new Set<string>([
  RAG_ANSWER_SELECTION_SOURCE_ID,
  ENTITY_OVERLAY_SELECTION_SOURCE_ID,
  WIKI_PAGE_SELECTION_SOURCE_ID,
]);

export function isSelectedPointBaselineSelectionSourceId(
  sourceId: string | null | undefined,
): boolean {
  return sourceId != null && SELECTED_POINT_BASELINE_SOURCE_IDS.has(sourceId);
}

export function getRagOverlayProducerId(args: {
  origin: "ask" | "compose";
  evidenceIntent: "support" | "refute" | "both" | null;
}): OverlayProducerId {
  if (args.origin !== "compose") {
    return RAG_ASK_OVERLAY_PRODUCER;
  }

  if (args.evidenceIntent === "support") {
    return RAG_EVIDENCE_ASSIST_SUPPORT_OVERLAY_PRODUCER;
  }

  if (args.evidenceIntent === "refute") {
    return RAG_EVIDENCE_ASSIST_REFUTE_OVERLAY_PRODUCER;
  }

  if (args.evidenceIntent === "both") {
    return RAG_EVIDENCE_ASSIST_BOTH_OVERLAY_PRODUCER;
  }

  return RAG_ASK_OVERLAY_PRODUCER;
}
