import type { GraphBundleQueries } from "@solemd/graph";

type SelectionScopeUpdate = {
  currentPointScopeSql: string | null;
  setCurrentPointScopeSql: (
    sql: string | null,
    options?: { forceRevision?: boolean },
  ) => void;
  forceRevision?: boolean;
};

const SELECTED_POINT_INDICES_SQL = `
  SELECT index
  FROM selected_point_indices
  ORDER BY index
`;

function readIndexValue(row: Record<string, unknown>): number | null {
  const raw = row.index;
  const value =
    typeof raw === "number"
      ? raw
      : typeof raw === "string" && raw.trim().length > 0
        ? Number(raw)
        : NaN;
  return Number.isInteger(value) && value >= 0 ? value : null;
}

export async function readCommittedSelectedPointIndices(
  queries: GraphBundleQueries,
): Promise<number[]> {
  const result = await queries.runReadOnlyQuery(SELECTED_POINT_INDICES_SQL);
  return result.rows
    .map(readIndexValue)
    .filter((value): value is number => value != null);
}

export function mergeSelectionPointIndices(
  current: readonly number[],
  incoming: readonly number[],
): number[] {
  return Array.from(new Set([...current, ...incoming])).sort((a, b) => a - b);
}

export async function commitSelectionState(args: {
  sourceId: string | null;
  queries: GraphBundleQueries;
  pointIndices: number[];
  setSelectedPointCount: (
    count: number,
    options?: { forceRevision?: boolean },
  ) => void;
  setActiveSelectionSourceId: (id: string | null) => void;
  scopeUpdate?: SelectionScopeUpdate;
  shouldCommitStore?: () => boolean;
  clearNode?: () => void;
}): Promise<void> {
  if (args.shouldCommitStore && !args.shouldCommitStore()) {
    return;
  }
  await args.queries.setSelectedPointIndices(args.pointIndices);
  if (args.shouldCommitStore && !args.shouldCommitStore()) {
    return;
  }
  args.scopeUpdate?.setCurrentPointScopeSql(args.scopeUpdate.currentPointScopeSql, {
    forceRevision: args.scopeUpdate.forceRevision,
  });
  args.setSelectedPointCount(args.pointIndices.length, { forceRevision: true });
  args.setActiveSelectionSourceId(args.sourceId);
  args.clearNode?.();
}

export async function clearSelectionState(args: {
  queries?: GraphBundleQueries | null;
  setSelectedPointCount: (
    count: number,
    options?: { forceRevision?: boolean },
  ) => void;
  setActiveSelectionSourceId: (id: string | null) => void;
  scopeUpdate?: SelectionScopeUpdate;
  clearNode?: () => void;
}): Promise<void> {
  args.scopeUpdate?.setCurrentPointScopeSql(args.scopeUpdate.currentPointScopeSql, {
    forceRevision: args.scopeUpdate.forceRevision,
  });
  args.setSelectedPointCount(0, { forceRevision: true });
  args.setActiveSelectionSourceId(null);
  args.clearNode?.();
  await args.queries?.setSelectedPointIndices([]);
}

export async function clearOwnedSelectionState(args: {
  sourceId: string;
  activeSelectionSourceId: string | null;
  queries: GraphBundleQueries;
  setSelectedPointCount: (
    count: number,
    options?: { forceRevision?: boolean },
  ) => void;
  setActiveSelectionSourceId: (id: string | null) => void;
}): Promise<void> {
  if (args.activeSelectionSourceId !== args.sourceId) return;
  await args.queries.setSelectedPointIndices([]);
  args.setSelectedPointCount(0, { forceRevision: true });
  args.setActiveSelectionSourceId(null);
}
