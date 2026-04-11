import type { GraphBundleQueries } from "@/features/graph/types";

export async function commitSelectionState(args: {
  sourceId: string;
  queries: GraphBundleQueries;
  pointIndices: number[];
  setSelectedPointCount: (count: number) => void;
  setActiveSelectionSourceId: (id: string | null) => void;
}): Promise<void> {
  await args.queries.setSelectedPointIndices(args.pointIndices);
  args.setSelectedPointCount(args.pointIndices.length);
  args.setActiveSelectionSourceId(args.sourceId);
}

export async function clearOwnedSelectionState(args: {
  sourceId: string;
  activeSelectionSourceId: string | null;
  queries: GraphBundleQueries;
  setSelectedPointCount: (count: number) => void;
  setActiveSelectionSourceId: (id: string | null) => void;
}): Promise<void> {
  if (args.activeSelectionSourceId !== args.sourceId) return;
  await args.queries.setSelectedPointIndices([]);
  args.setSelectedPointCount(0);
  args.setActiveSelectionSourceId(null);
}
