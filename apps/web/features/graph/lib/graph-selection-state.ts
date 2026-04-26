import type { GraphBundleQueries } from "@solemd/graph";

type SelectionScopeUpdate = {
  currentPointScopeSql: string | null;
  setCurrentPointScopeSql: (sql: string | null) => void;
};

export async function commitSelectionState(args: {
  sourceId: string | null;
  queries: GraphBundleQueries;
  pointIndices: number[];
  setSelectedPointCount: (count: number) => void;
  setActiveSelectionSourceId: (id: string | null) => void;
  scopeUpdate?: SelectionScopeUpdate;
  shouldCommitStore?: () => boolean;
  clearNode?: () => void;
}): Promise<void> {
  await args.queries.setSelectedPointIndices(args.pointIndices);
  if (args.shouldCommitStore && !args.shouldCommitStore()) {
    return;
  }
  args.scopeUpdate?.setCurrentPointScopeSql(args.scopeUpdate.currentPointScopeSql);
  args.setSelectedPointCount(args.pointIndices.length);
  args.setActiveSelectionSourceId(args.sourceId);
  args.clearNode?.();
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
