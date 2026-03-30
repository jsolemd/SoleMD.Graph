"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Loader,
  Select,
  Stack,
  Text,
  TextInput,
  UnstyledButton,
} from "@mantine/core";
import { getLayerConfig } from "@/features/graph/lib/layers";
import { useDashboardStore } from "@/features/graph/stores";
import type { GraphBundleQueries } from "@/features/graph/types";
import {
  panelCardStyle,
  panelTextDimStyle,
  panelTextStyle,
} from "../../panels/PanelShell";
import { sectionLabelStyle } from "../../panels/PanelShell";
import { useSearchDrillIn } from "./use-search-drill-in";
import { useSearchResults } from "./use-search-results";

function truncateLabel(value: string | null, max = 96): string {
  if (!value) return ""
  return value.length > max ? `${value.slice(0, max - 1)}…` : value
}

export function SearchSection({ queries }: { queries: GraphBundleQueries }) {
  const activeLayer = useDashboardStore((s) => s.activeLayer);
  const isSelectionLocked = useDashboardStore((s) => s.selectionLocked);
  const clearVisibilityFocus = useDashboardStore((s) => s.clearVisibilityFocus);
  const drillIntoSearchResult = useSearchDrillIn({ queries });

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
  const { canSearch, error, loading, results } = useSearchResults({
    queries,
    activeLayer,
    field,
    query,
    disabled: isSelectionLocked,
  });

  useEffect(() => {
    if (fieldOptions.some((option) => option.value === field)) {
      return;
    }

    setField(fieldOptions[0]?.value ?? "clusterLabel");
  }, [field, fieldOptions]);

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
                onClick={() => void drillIntoSearchResult(result)}
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
