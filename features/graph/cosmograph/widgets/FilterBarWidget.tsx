"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { ActionIcon, Stack, Text, TextInput, UnstyledButton } from "@mantine/core";
import { useCosmograph } from "@cosmograph/react";
import { Search, X } from "lucide-react";
import {
  buildCategoricalFilterClause,
  buildVisibilityScopeSqlExcludingSource,
  clearSelectionClause,
  createSelectionSource,
  getSelectionValueForSource,
} from "@/features/graph/lib/cosmograph-selection";
import { useDashboardStore } from "@/features/graph/stores";
import type { GraphBundleQueries, GraphInfoFacetRow } from "@/features/graph/types";
import { formatNumber } from "@/lib/helpers";
import {
  panelTextDimStyle,
  panelTextStyle,
} from "@/features/graph/components/panels/PanelShell";

const SEARCH_INPUT_STYLES = {
  input: {
    backgroundColor: "var(--graph-panel-input-bg)",
    borderColor: "var(--graph-panel-border)",
    color: "var(--graph-panel-text)",
  },
} as const;

export function FilterBarWidget({
  column,
  queries,
}: {
  column: string;
  queries: GraphBundleQueries;
}) {
  const { cosmograph } = useCosmograph();
  const activeLayer = useDashboardStore((state) => state.activeLayer);
  const currentScopeRevision = useDashboardStore((state) => state.currentScopeRevision);
  const [rows, setRows] = useState<GraphInfoFacetRow[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());
  const sourceId = `filter:${column}`;
  const source = useMemo(() => createSelectionSource(sourceId), [sourceId]);

  const scopeSql = useMemo(
    () =>
      buildVisibilityScopeSqlExcludingSource(
        cosmograph?.pointsSelection,
        sourceId,
      ),
    [cosmograph, currentScopeRevision, sourceId],
  );
  const selectedValue = useMemo(
    () =>
      getSelectionValueForSource<string>(cosmograph?.pointsSelection, sourceId),
    [cosmograph, currentScopeRevision, sourceId],
  );

  useEffect(() => {
    let cancelled = false;

    queries
      .getFacetSummary({
        layer: activeLayer,
        scope: "current",
        column,
        currentPointScopeSql: scopeSql,
        maxItems: 12,
      })
      .then((nextRows) => {
        if (cancelled) {
          return;
        }

        setRows(nextRows);
        setError(null);
      })
      .catch((queryError: unknown) => {
        if (cancelled) {
          return;
        }

        setRows([]);
        setError(
          queryError instanceof Error ? queryError.message : "Failed to load filter",
        );
      });

    return () => {
      cancelled = true;
    };
  }, [activeLayer, column, queries, scopeSql]);

  const visibleRows = useMemo(() => {
    if (!deferredSearch) {
      return rows;
    }

    return rows.filter((row) =>
      row.value.toLowerCase().includes(deferredSearch),
    );
  }, [deferredSearch, rows]);

  const maxCount = useMemo(
    () => Math.max(...rows.map((row) => row.totalCount), 0),
    [rows],
  );
  const isSubset = typeof scopeSql === "string" && scopeSql.trim().length > 0;

  const handleToggle = (value: string) => {
    const selection = cosmograph?.pointsSelection;
    if (!selection) {
      return;
    }

    if (selectedValue === value) {
      clearSelectionClause(selection, source);
      return;
    }

    selection.update(buildCategoricalFilterClause(source, column, value));
  };

  if (error) {
    return <Text style={panelTextDimStyle}>{error}</Text>;
  }

  if (rows.length === 0) {
    return <Text style={panelTextDimStyle}>No data</Text>;
  }

  return (
    <Stack gap={6}>
      {rows.length > 6 ? (
        <TextInput
          size="xs"
          value={search}
          onChange={(event) => setSearch(event.currentTarget.value)}
          placeholder="Filter values"
          leftSection={<Search size={12} />}
          rightSection={
            search ? (
              <ActionIcon
                size="sm"
                variant="transparent"
                onClick={() => setSearch("")}
                aria-label="Clear filter search"
              >
                <X size={12} />
              </ActionIcon>
            ) : null
          }
          styles={SEARCH_INPUT_STYLES}
        />
      ) : null}

      {visibleRows.length === 0 ? (
        <Text style={panelTextDimStyle}>No matching values</Text>
      ) : (
        visibleRows.map((row) => {
          const isSelected = selectedValue === row.value;
          const width = maxCount > 0 ? (row.totalCount / maxCount) * 100 : 0;

          return (
            <UnstyledButton
              key={row.value}
              onClick={() => handleToggle(row.value)}
              aria-pressed={isSelected}
              style={{
                borderRadius: 8,
                border: "1px solid var(--graph-panel-border)",
                backgroundColor: isSelected
                  ? "var(--interactive-hover)"
                  : "var(--graph-panel-bg)",
                padding: "6px 8px",
              }}
            >
              <div className="mb-1 flex items-center justify-between gap-2">
                <Text
                  style={{
                    ...panelTextStyle,
                    maxWidth: 190,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {row.value}
                </Text>
                <Text style={panelTextDimStyle}>
                  {isSubset
                    ? `${formatNumber(row.scopedCount)} / ${formatNumber(row.totalCount)}`
                    : formatNumber(row.totalCount)}
                </Text>
              </div>
              <div
                style={{
                  height: 4,
                  borderRadius: 9999,
                  backgroundColor: "var(--graph-panel-input-bg)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${width}%`,
                    borderRadius: 9999,
                    backgroundColor: isSelected
                      ? "var(--mode-accent)"
                      : "var(--filter-bar-base)",
                  }}
                />
              </div>
            </UnstyledButton>
          );
        })
      )}
    </Stack>
  );
}
