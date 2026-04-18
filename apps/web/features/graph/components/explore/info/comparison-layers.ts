import type {
  GraphInfoHistogramResult,
  GraphInfoSummary,
} from "@solemd/graph";

export interface InfoComparisonState {
  hasSelection: boolean;
  hasFiltered: boolean;
}

export interface InfoComparisonFacetRow {
  value: string;
  totalCount: number;
  selectionCount: number | null;
  filteredCount: number | null;
  enrichment?: number;
}

export interface InfoHistogramComparison {
  dataset: GraphInfoHistogramResult;
  selection: GraphInfoHistogramResult | null;
  filtered: GraphInfoHistogramResult | null;
}

export interface InfoComparisonClusterRow {
  clusterId: number;
  label: string;
  totalCount: number;
  selectionCount: number | null;
  filteredCount: number | null;
}

export function areInfoSummariesEquivalent(
  left: GraphInfoSummary | null,
  right: GraphInfoSummary | null,
): boolean {
  if (!left || !right) {
    return false;
  }

  return (
    left.scopedCount === right.scopedCount &&
    left.baseCount === right.baseCount &&
    left.overlayCount === right.overlayCount &&
    left.papers === right.papers &&
    left.clusters === right.clusters &&
    left.noise === right.noise &&
    left.yearRange?.min === right.yearRange?.min &&
    left.yearRange?.max === right.yearRange?.max
  );
}

export function getInfoComparisonState(args: {
  hasSelection: boolean;
  hasFiltered: boolean;
}): InfoComparisonState {
  return {
    hasSelection: args.hasSelection,
    hasFiltered: args.hasFiltered,
  };
}

export function getInfoComparisonHeading(
  state: InfoComparisonState,
): "All" | "Selection" | "Filtered" {
  if (state.hasFiltered) {
    return "Filtered";
  }

  if (state.hasSelection) {
    return "Selection";
  }

  return "All";
}

export function getInfoComparisonOpacities(state: InfoComparisonState): {
  all: number;
  selection: number;
  filtered: number;
} {
  if (state.hasFiltered) {
    return { all: 0.9, selection: 0.68, filtered: 0.98 };
  }

  if (state.hasSelection) {
    return { all: 0.9, selection: 0.96, filtered: 0 };
  }

  return { all: 0.98, selection: 0, filtered: 0 };
}

export function getInfoComparisonColors(state: InfoComparisonState): {
  all: string;
  selection: string;
  filtered: string;
} {
  if (state.hasFiltered) {
    return {
      all: "var(--filter-bar-base)",
      selection: "var(--mode-accent-hover)",
      filtered: "var(--filter-bar-active)",
    };
  }

  if (state.hasSelection) {
    return {
      all: "var(--filter-bar-base)",
      selection: "var(--filter-bar-active)",
      filtered: "var(--filter-bar-active)",
    };
  }

  return {
    all: "var(--filter-bar-active)",
    selection: "var(--filter-bar-active)",
    filtered: "var(--filter-bar-active)",
  };
}

export function getInfoComparisonDisplayValue(args: {
  totalCount: number;
  selectionCount?: number | null;
  filteredCount?: number | null;
  format: (value: number) => string;
}): string {
  const { totalCount, selectionCount = null, filteredCount = null, format } = args;

  if (filteredCount != null && selectionCount != null) {
    return `${format(filteredCount)} / ${format(selectionCount)} / ${format(totalCount)}`;
  }

  if (selectionCount != null) {
    return `${format(selectionCount)} / ${format(totalCount)}`;
  }

  if (filteredCount != null) {
    return `${format(filteredCount)} / ${format(totalCount)}`;
  }

  return format(totalCount);
}

export function getActiveComparisonCount(args: {
  totalCount: number;
  selectionCount?: number | null;
  filteredCount?: number | null;
}): number {
  if (args.filteredCount != null) {
    return args.filteredCount;
  }

  if (args.selectionCount != null) {
    return args.selectionCount;
  }

  return args.totalCount;
}

export function mergeInfoComparisonRows(args: {
  datasetRows: Array<{ value: string; count: number }>;
  selectionRows?: Array<{ value: string; count: number }>;
  filteredRows?: Array<{ value: string; count: number }>;
  maxItems: number;
}): InfoComparisonFacetRow[] {
  const datasetMap = new Map(
    args.datasetRows.map((row) => [row.value, row.count] as const),
  );
  const selectionMap = new Map(
    (args.selectionRows ?? []).map((row) => [row.value, row.count] as const),
  );
  const filteredMap = new Map(
    (args.filteredRows ?? []).map((row) => [row.value, row.count] as const),
  );
  const values = new Set<string>([
    ...args.datasetRows.map((row) => row.value),
    ...(args.selectionRows ?? []).map((row) => row.value),
    ...(args.filteredRows ?? []).map((row) => row.value),
  ]);

  const datasetTotal = args.datasetRows.reduce((sum, row) => sum + row.count, 0);
  const selectionTotal = (args.selectionRows ?? []).reduce((sum, row) => sum + row.count, 0);
  const hasSelection = args.selectionRows != null && args.selectionRows.length > 0;

  return Array.from(values)
    .map((value) => {
      const totalCount = datasetMap.get(value) ?? 0;
      const selectionCount = selectionMap.has(value) ? (selectionMap.get(value) ?? 0) : null;
      const filteredCount = filteredMap.has(value) ? (filteredMap.get(value) ?? 0) : null;

      let enrichment: number | undefined;
      if (hasSelection && selectionCount != null && selectionCount > 0 && totalCount > 0 && datasetTotal > 0 && selectionTotal > 0) {
        enrichment = (selectionCount / selectionTotal) / (totalCount / datasetTotal);
      }

      return { value, totalCount, selectionCount, filteredCount, enrichment };
    })
    .sort((left, right) => {
      const rightActive = getActiveComparisonCount(right);
      const leftActive = getActiveComparisonCount(left);

      return rightActive === leftActive
        ? right.totalCount === left.totalCount
          ? left.value.localeCompare(right.value)
          : right.totalCount - left.totalCount
        : rightActive - leftActive;
    })
    .slice(0, args.maxItems);
}
