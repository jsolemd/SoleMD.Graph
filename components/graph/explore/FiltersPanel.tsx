"use client";

import { Badge, Button, Group, Select, Stack, Text } from "@mantine/core";
import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { useDashboardStore } from "@/lib/graph/stores";
import { ALL_DATA_COLUMNS, getColumnMetaByFacetName } from "@/lib/graph/columns";
import type { FilterableColumnKey, GraphFacet } from "@/lib/graph/types";
import { PanelShell, panelSelectStyles } from "../PanelShell";
import { FilterWidget } from "./FilterWidget";

interface FacetGroup {
  column: FilterableColumnKey;
  label: string;
  valueCount: number;
  values: GraphFacet[];
}

function FacetPreview({ group }: { group: FacetGroup }) {
  return (
    <div
      className="rounded-xl p-3"
      style={{
        backgroundColor: "var(--graph-panel-input-bg)",
        border: "1px solid var(--graph-panel-border)",
      }}
    >
      <Group justify="space-between" align="flex-start" gap="xs">
        <div>
          <Text size="xs" fw={600} style={{ color: "var(--graph-panel-text)" }}>
            {group.label}
          </Text>
          <Text size="xs" style={{ color: "var(--graph-panel-text-dim)" }}>
            {group.valueCount} precomputed values in `graph_facets`
          </Text>
        </div>
        <Badge
          variant="light"
          styles={{
            root: {
              backgroundColor: "var(--interactive-active)",
              color: "var(--graph-panel-text)",
            },
          }}
        >
          {group.values[0]?.pointCount ?? 0} top points
        </Badge>
      </Group>

      <Group mt="sm" gap={6}>
        {group.values.slice(0, 3).map((facet) => (
          <Badge
            key={`${group.column}:${facet.facetValue}`}
            variant="outline"
            styles={{
              root: {
                borderColor: "var(--graph-panel-border)",
                color: "var(--graph-panel-text-dim)",
              },
            }}
          >
            {(facet.facetLabel ?? facet.facetValue).slice(0, 28)}
            {" · "}
            {facet.pointCount}
          </Badge>
        ))}
      </Group>
    </div>
  );
}

export function FiltersPanel({ facets }: { facets: GraphFacet[] }) {
  const filters = useDashboardStore((s) => s.filters);
  const filtersResetVersion = useDashboardStore((s) => s.filtersResetVersion);
  const addFilter = useDashboardStore((s) => s.addFilter);
  const removeFilter = useDashboardStore((s) => s.removeFilter);
  const clearAllFilterSelections = useDashboardStore(
    (s) => s.clearAllFilterSelections
  );
  const setActivePanel = useDashboardStore((s) => s.setActivePanel);

  const [showAddSelect, setShowAddSelect] = useState(false);

  const facetGroups = useMemo<FacetGroup[]>(() => {
    const grouped = new Map<FilterableColumnKey, FacetGroup>();

    for (const facet of facets) {
      const meta = getColumnMetaByFacetName(facet.facetName);

      if (!meta) {
        continue;
      }

      const existing = grouped.get(meta.key as FilterableColumnKey);

      if (existing) {
        existing.values.push(facet);
        continue;
      }

      grouped.set(meta.key as FilterableColumnKey, {
        column: meta.key as FilterableColumnKey,
        label: meta.label,
        valueCount: 0,
        values: [facet],
      });
    }

    return Array.from(grouped.values())
      .map((group) => ({
        ...group,
        valueCount: group.values.length,
        values: [...group.values].sort((left, right) => {
          if (right.pointCount !== left.pointCount) {
            return right.pointCount - left.pointCount;
          }

          return (left.sortKey ?? left.facetValue).localeCompare(
            right.sortKey ?? right.facetValue
          );
        }),
      }))
      .sort((left, right) => left.label.localeCompare(right.label));
  }, [facets]);

  const availableColumns = useMemo(() => {
    const availableFacetColumns = facetGroups
      .filter((group) => !filters.some((filter) => filter.column === group.column))
      .map((group) => ({
        value: group.column,
        label: `${group.label} (${group.valueCount})`,
      }));

    if (availableFacetColumns.length > 0) {
      return availableFacetColumns;
    }

    return ALL_DATA_COLUMNS
      .filter((column) => !filters.some((filter) => filter.column === column.key))
      .map((column) => ({ value: column.key, label: column.label }));
  }, [facetGroups, filters]);

  return (
    <PanelShell
      title="Filters"
      side="left"
      onClose={() => setActivePanel(null)}
    >
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        <Stack gap="sm">
          <Text
            size="xs"
            fw={600}
            style={{
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              color: "var(--graph-panel-text-muted)",
            }}
          >
            Points
          </Text>

          <Text size="xs" style={{ color: "var(--graph-panel-text-dim)" }}>
            Filters stay active when this panel closes. Clear a selection to
            keep the widget, or remove the widget entirely.
          </Text>

          {facetGroups.length > 0 && (
            <>
              <Text
                size="xs"
                fw={600}
                style={{
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  color: "var(--graph-panel-text-muted)",
                }}
              >
                Bundle Facets
              </Text>

              <Text size="xs" style={{ color: "var(--graph-panel-text-dim)" }}>
                These buckets come from the precomputed `graph_facets` table in
                the active bundle.
              </Text>

              {facetGroups.map((group) => (
                <FacetPreview key={group.column} group={group} />
              ))}
            </>
          )}

          {filters.map((filter) => (
            <FilterWidget
              key={filter.column}
              filter={filter}
              clearSignal={filtersResetVersion}
              onRemove={() => removeFilter(filter.column)}
            />
          ))}

          {showAddSelect ? (
            <Select
              size="xs"
              placeholder="Select column..."
              data={availableColumns}
              onChange={(v) => {
                if (v) {
                  addFilter(v as FilterableColumnKey);
                  setShowAddSelect(false);
                }
              }}
              onBlur={() => setShowAddSelect(false)}
              autoFocus
              searchable
              styles={panelSelectStyles}
            />
          ) : (
            <Button
              size="xs"
              variant="subtle"
              leftSection={<Plus size={14} />}
              onClick={() => setShowAddSelect(true)}
              disabled={availableColumns.length === 0}
              styles={{
                root: { color: "var(--graph-panel-text-muted)" },
              }}
            >
              Add Filter
            </Button>
          )}

          {filters.length > 0 && (
            <Button
              size="xs"
              variant="subtle"
              color="red"
              onClick={clearAllFilterSelections}
            >
              Clear All Selections
            </Button>
          )}
        </Stack>
      </div>
    </PanelShell>
  );
}
