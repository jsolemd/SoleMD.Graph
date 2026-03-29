"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import {
  Loader,
  Select,
  Stack,
  Text,
  TextInput,
  UnstyledButton,
} from "@mantine/core";
import { useGraphCamera, useGraphSelection } from "@/features/graph/cosmograph";
import { buildBudgetScopeSql } from "@/features/graph/lib/cosmograph-selection";
import { getLayerConfig } from "@/features/graph/lib/layers";
import { useDashboardStore, useGraphStore } from "@/features/graph/stores";
import type {
  GraphBundleQueries,
  GraphSearchResult,
} from "@/features/graph/types";
import {
  panelCardStyle,
  panelTextDimStyle,
  panelTextStyle,
} from "../../panels/PanelShell";
import { sectionLabelStyle } from "../../panels/PanelShell";

function truncateLabel(value: string | null, max = 96): string {
  if (!value) return ""
  return value.length > max ? `${value.slice(0, max - 1)}…` : value
}

export function SearchSection({ queries }: { queries: GraphBundleQueries }) {
  const activeLayer = useDashboardStore((s) => s.activeLayer);
  const isSelectionLocked = useDashboardStore((s) => s.selectionLocked);
  const applyVisibilityBudget = useDashboardStore((s) => s.applyVisibilityBudget);
  const clearVisibilityFocus = useDashboardStore((s) => s.clearVisibilityFocus);
  const selectNode = useGraphStore((s) => s.selectNode);
  const { zoomToPoint } = useGraphCamera();
  const { selectPoint, setFocusedPoint, getPointsSelection } = useGraphSelection();

  const searchFields = useMemo(
    () => getLayerConfig(activeLayer).searchableFields,
    [activeLayer],
  );
  const fieldOptions = useMemo(
    () =>
      Object.entries(searchFields).map(([value, label]) => ({
        value,
        label,
      })),
    [searchFields],
  );

  const [field, setField] = useState(fieldOptions[0]?.value ?? "clusterLabel");
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query.trim());
  const [results, setResults] = useState<GraphSearchResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [lastResolvedKey, setLastResolvedKey] = useState<string | null>(null);
  const canSearch = !isSelectionLocked && deferredQuery.length >= 2;
  const requestKey = canSearch
    ? JSON.stringify({
        activeLayer,
        field,
        query: deferredQuery,
      })
    : null;
  const loading = canSearch && lastResolvedKey !== requestKey;

  useEffect(() => {
    if (!canSearch) {
      return;
    }

    let cancelled = false;

    queries
      .searchPoints({
        layer: activeLayer,
        column: field,
        query: deferredQuery,
      })
      .then((next) => {
        if (cancelled) {
          return;
        }
        setResults(next);
        setError(null);
        setLastResolvedKey(requestKey);
      })
      .catch((searchError: unknown) => {
        if (cancelled) {
          return;
        }
        setResults([]);
        setError(
          searchError instanceof Error
            ? searchError.message
            : "Search failed",
        );
        setLastResolvedKey(requestKey);
      });

    return () => {
      cancelled = true;
    };
  }, [activeLayer, canSearch, deferredQuery, field, queries, requestKey]);

  return (
    <div style={{ overflow: "clip" }}>
      <Text fw={600} mb={4} style={sectionLabelStyle}>
        Search
      </Text>

      <Stack gap="xs">
        <Select
          size="xs"
          data={fieldOptions}
          value={field}
          disabled={isSelectionLocked}
          onChange={(value) => {
            if (value) {
              clearVisibilityFocus();
              setField(value);
            }
          }}
        />

        <TextInput
          size="xs"
          value={query}
          disabled={isSelectionLocked}
          placeholder={
            isSelectionLocked
              ? "Unlock selection to search-select..."
              : "Search points, papers, or clusters..."
          }
          onChange={(event) => {
            clearVisibilityFocus();
            setQuery(event.currentTarget.value);
          }}
        />

        {canSearch && loading ? (
          <div className="flex items-center gap-2">
            <Loader size="xs" color="var(--brand-accent)" />
            <Text size="xs" style={panelTextDimStyle}>
              Searching DuckDB…
            </Text>
          </div>
        ) : canSearch && error ? (
          <Text size="xs" style={panelTextDimStyle}>
            {error}
          </Text>
        ) : canSearch && results.length === 0 ? (
          <Text size="xs" style={panelTextDimStyle}>
            No matches
          </Text>
        ) : null}

        {canSearch && results.length > 0 && (
          <Stack gap={6}>
            {results.map((result) => (
              <UnstyledButton
                key={`${result.id}:${result.index}`}
                className="w-full rounded-xl px-2.5 py-2 text-left"
                style={panelCardStyle}
                onClick={async () => {
                  const initialIndex = result.point.index;
                  selectPoint(initialIndex, false, false);
                  setFocusedPoint(initialIndex);
                  zoomToPoint(initialIndex, 250);

                  const scopeSql = buildBudgetScopeSql(
                    getPointsSelection(),
                  );
                  const budget = await queries.getVisibilityBudget({
                    layer: activeLayer,
                    selector: {
                      id: result.id,
                      index: result.index,
                    },
                    scopeSql,
                  });
                  const node = result.point;
                  selectNode(node);

                  if (budget) {
                    applyVisibilityBudget(activeLayer, budget);
                  } else {
                    clearVisibilityFocus();
                  }

                  const targetIndex = budget?.seedIndex ?? initialIndex;
                  if (targetIndex !== initialIndex) {
                    selectPoint(targetIndex, false, false);
                    setFocusedPoint(targetIndex);
                    zoomToPoint(targetIndex, 250);
                  }
                }}
              >
                <Text style={panelTextStyle}>
                  {truncateLabel(result.label)}
                </Text>
                {result.matchedValue &&
                  result.matchedValue !== result.label && (
                    <Text size="xs" style={panelTextDimStyle}>
                      {truncateLabel(result.matchedValue, 112)}
                    </Text>
                  )}
                {result.subtitle && (
                  <Text size="xs" style={panelTextDimStyle}>
                    {truncateLabel(result.subtitle, 112)}
                  </Text>
                )}
              </UnstyledButton>
            ))}
          </Stack>
        )}
      </Stack>
    </div>
  );
}
