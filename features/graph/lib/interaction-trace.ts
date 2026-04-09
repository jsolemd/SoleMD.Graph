import type {
  GraphInteractionOrigin,
  GraphInteractionTrace,
  GraphInteractionTraceStage,
  GraphInteractionTraceStageName,
} from "@/features/graph/types";

const precisionScale = 1000;

export function getInteractionNow(): number {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }

  return Date.now();
}

export function createInteractionTraceStage(args: {
  stage: GraphInteractionTraceStageName;
  startedAt: number;
  metadata?: Record<string, unknown>;
}): GraphInteractionTraceStage {
  const durationMs = Math.max(0, getInteractionNow() - args.startedAt);

  return {
    stage: args.stage,
    durationMs: Math.round(durationMs * precisionScale) / precisionScale,
    metadata: args.metadata,
  };
}

export function mergeInteractionTraceStages(
  ...stageGroups: Array<GraphInteractionTraceStage[] | undefined>
): GraphInteractionTraceStage[] {
  return stageGroups.flatMap((group) => group ?? []);
}

export function createGraphInteractionTrace(args: {
  interactionId: string;
  intentId?: string;
  origin: GraphInteractionOrigin;
  stages: GraphInteractionTraceStage[];
  metadata?: Record<string, unknown>;
}): GraphInteractionTrace {
  const stages = args.stages.filter((stage) => stage.durationMs >= 0);
  const totalDurationMs = stages.reduce((sum, stage) => sum + stage.durationMs, 0);

  return {
    interactionId: args.interactionId,
    intentId: args.intentId ?? args.interactionId,
    origin: args.origin,
    totalDurationMs: Math.round(totalDurationMs * precisionScale) / precisionScale,
    stages,
    metadata: args.metadata,
  };
}
