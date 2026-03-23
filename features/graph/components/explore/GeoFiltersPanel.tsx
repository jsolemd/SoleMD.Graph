"use client";

import { useCallback, useMemo, useState } from "react";
import {
  RangeSlider,
  Text,
  TextInput,
} from "@mantine/core";
import { Search } from "lucide-react";
import { useDashboardStore } from "@/features/graph/stores";
import { getNodeProp, safeMin, safeMax } from "@/features/graph/lib/helpers";
import type { GeoNode } from "@/features/graph/types";
import { FilterPanelShell } from "./FilterPanelShell";

/**
 * Geo-specific filters panel — replaces FiltersPanel for the geo layer.
 *
 * FiltersPanel uses CosmographBars/CosmographHistogram which need a live
 * Cosmograph canvas. This component provides equivalent functionality using
 * Mantine controls + manual bar rendering that reads from geoNodes directly.
 */

interface GeoFiltersPanelProps {
  geoNodes: GeoNode[];
}

/** Compute value distribution for a categorical column. */
function useCategoricalDistribution(
  geoNodes: GeoNode[],
  column: string,
): Array<{ value: string; count: number }> {
  return useMemo(() => {
    const counts = new Map<string, number>();
    for (const node of geoNodes) {
      const val = String(getNodeProp(node, column) ?? "");
      if (val) counts.set(val, (counts.get(val) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count);
  }, [geoNodes, column]);
}

/** Compute numeric range for a column. */
function useNumericRange(
  geoNodes: GeoNode[],
  column: string,
): { min: number; max: number } {
  return useMemo(() => {
    const values = geoNodes
      .map((n) => getNodeProp(n, column))
      .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
    if (values.length === 0) return { min: 0, max: 0 };
    return {
      min: safeMin(values),
      max: safeMax(values),
    };
  }, [geoNodes, column]);
}

function CategoricalFilterWidget({
  column,
  geoNodes,
}: {
  column: string;
  geoNodes: GeoNode[];
}) {
  const geoFilters = useDashboardStore((s) => s.geoFilters);
  const setGeoFilter = useDashboardStore((s) => s.setGeoFilter);
  const [search, setSearch] = useState("");

  const distribution = useCategoricalDistribution(geoNodes, column);
  const selectedValues = geoFilters[column] as string[] | undefined;

  const { filtered, total } = useMemo(() => {
    if (!search) return { filtered: distribution.slice(0, 30), total: distribution.length };
    const lower = search.toLowerCase();
    const matches = distribution.filter((d) => d.value.toLowerCase().includes(lower));
    return { filtered: matches.slice(0, 30), total: matches.length };
  }, [distribution, search]);

  const maxCount = filtered[0]?.count ?? 1;

  const handleClick = useCallback(
    (value: string) => {
      const current = selectedValues ?? [];
      const next = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];
      setGeoFilter(column, next.length > 0 ? next : null);
    },
    [column, selectedValues, setGeoFilter],
  );

  return (
    <div>
      <TextInput
        size="xs"
        placeholder="Search..."
        leftSection={<Search size={12} />}
        value={search}
        onChange={(e) => setSearch(e.currentTarget.value)}
        styles={{
          input: {
            backgroundColor: "var(--graph-panel-input-bg)",
            borderColor: "var(--graph-panel-border)",
            color: "var(--graph-panel-text)",
            fontSize: 11,
          },
        }}
        mb={6}
      />
      <div className="flex flex-col gap-0.5">
        {filtered.map(({ value, count }) => {
          const isSelected = selectedValues?.includes(value) ?? false;
          const barWidth = Math.max(4, (count / maxCount) * 100);
          return (
            <button
              key={value}
              type="button"
              onClick={() => handleClick(value)}
              className="flex items-center gap-2 rounded px-1.5 py-0.5 text-left transition-colors"
              style={{
                backgroundColor: isSelected
                  ? "var(--mode-accent-subtle)"
                  : "transparent",
              }}
            >
              <div
                className="rounded-sm"
                style={{
                  height: 12,
                  width: `${barWidth}%`,
                  minWidth: 4,
                  backgroundColor: isSelected
                    ? "var(--filter-bar-active)"
                    : "var(--filter-bar-base)",
                  transition: "background-color 0.15s ease",
                }}
              />
              <span
                style={{
                  fontSize: 11,
                  color: "var(--graph-panel-text)",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  flex: 1,
                }}
              >
                {value}
              </span>
              <span
                style={{
                  fontSize: 10,
                  color: "var(--graph-panel-text-muted)",
                  flexShrink: 0,
                }}
              >
                {count}
              </span>
            </button>
          );
        })}
        {total > 30 && (
          <Text size="xs" c="dimmed" mt={4}>
            Showing 30 of {total}
          </Text>
        )}
      </div>
    </div>
  );
}

function NumericFilterWidget({
  column,
  geoNodes,
}: {
  column: string;
  geoNodes: GeoNode[];
}) {
  const geoFilters = useDashboardStore((s) => s.geoFilters);
  const setGeoFilter = useDashboardStore((s) => s.setGeoFilter);
  const { min, max } = useNumericRange(geoNodes, column);

  const currentRange = geoFilters[column] as [number, number] | undefined;

  if (min === max) {
    return (
      <Text style={{ fontSize: 11, color: "var(--graph-panel-text-dim)" }}>
        All values are {min}
      </Text>
    );
  }

  return (
    <RangeSlider
      min={min}
      max={max}
      step={max - min > 100 ? 1 : 0.1}
      value={currentRange ?? [min, max]}
      onChange={(value) => setGeoFilter(column, value)}
      size="sm"
      label={(v) => String(Math.round(v))}
      styles={{
        root: { marginTop: 8 },
        track: {
          backgroundColor: "var(--filter-bar-base)",
        },
        bar: { backgroundColor: "var(--filter-bar-active)" },
        thumb: {
          borderColor: "var(--mode-accent)",
          backgroundColor: "var(--mode-accent)",
        },
        label: {
          fontSize: 9,
          backgroundColor: "var(--graph-panel-bg)",
          color: "var(--graph-panel-text)",
          border: "1px solid var(--graph-panel-border)",
        },
      }}
    />
  );
}

export function GeoFiltersPanel({ geoNodes }: GeoFiltersPanelProps) {
  return (
    <FilterPanelShell
      renderWidget={(filter) =>
        filter.type === "numeric" ? (
          <NumericFilterWidget column={filter.column} geoNodes={geoNodes} />
        ) : (
          <CategoricalFilterWidget column={filter.column} geoNodes={geoNodes} />
        )
      }
    />
  );
}
