import type { OverlayProducerId } from "@/features/graph/types";

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
export const RAG_ANSWER_SELECTION_SOURCE_ID = "rag:answer-selection";
export const WIKI_ENTITY_OVERLAY_PRODUCER =
  "wiki:entity" satisfies OverlayProducerId;

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
