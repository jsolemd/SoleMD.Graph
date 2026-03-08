"use client";

import { useEffect, useRef } from "react";
import { ActionIcon, Badge, Text } from "@mantine/core";
import { X } from "lucide-react";
import {
  CosmographBars,
  CosmographHistogram,
  type CosmographBarsRef,
  type CosmographHistogramRef,
} from "@cosmograph/react";
import type { GraphFilter } from "@/lib/graph/types";
import { useDashboardStore } from "@/lib/graph/stores";
import { getColumnMeta } from "@/lib/graph/columns";

interface FilterWidgetProps {
  filter: GraphFilter;
  clearSignal: number;
  onRemove: () => void;
}

function formatSelection(filter: GraphFilter) {
  if (filter.type === "numeric") {
    if (!filter.selection) {
      return "All values";
    }

    return `${filter.selection[0].toFixed(2)} to ${filter.selection[1].toFixed(
      2
    )}`;
  }

  return filter.selection ?? "All values";
}

export function FilterWidget({
  filter,
  clearSignal,
  onRemove,
}: FilterWidgetProps) {
  const meta = getColumnMeta(filter.column);
  const barsRef = useRef<CosmographBarsRef>(undefined);
  const histogramRef = useRef<CosmographHistogramRef>(undefined);
  const lastClearSignal = useRef(clearSignal);
  const clearFilterSelection = useDashboardStore((s) => s.clearFilterSelection);
  const setCategoricalFilterSelection = useDashboardStore(
    (s) => s.setCategoricalFilterSelection
  );
  const setNumericFilterSelection = useDashboardStore(
    (s) => s.setNumericFilterSelection
  );

  useEffect(() => {
    if (clearSignal === lastClearSignal.current) {
      return;
    }

    lastClearSignal.current = clearSignal;

    if (filter.type === "numeric") {
      histogramRef.current?.setSelection(undefined);
    } else {
      barsRef.current?.setSelectedItem(undefined);
    }
  }, [clearSignal, filter.type]);

  if (!meta) return null;

  const numericSelection = filter.type === "numeric" ? filter.selection : undefined;
  const categoricalSelection =
    filter.type === "categorical" ? filter.selection : undefined;

  const handleRemove = () => {
    if (filter.type === "numeric") {
      histogramRef.current?.setSelection(undefined);
    } else {
      barsRef.current?.setSelectedItem(undefined);
    }

    clearFilterSelection(filter.column);
    onRemove();
  };

  return (
    <div
      className="rounded-xl p-3"
      style={{
        backgroundColor: "var(--graph-panel-input-bg)",
        border: "1px solid var(--graph-panel-border)",
      }}
    >
      <div className="mb-2 flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <Text size="xs" fw={500} style={{ color: "var(--graph-panel-text)" }}>
            {meta.label}
          </Text>
          <Badge
            variant="light"
            size="xs"
            styles={{
              root: {
                alignSelf: "flex-start",
                backgroundColor: "var(--interactive-active)",
                color: "var(--graph-panel-text)",
              },
            }}
          >
            {formatSelection(filter)}
          </Badge>
        </div>
        <ActionIcon
          variant="subtle"
          size={20}
          radius="sm"
          onClick={handleRemove}
          aria-label={`Remove ${meta.label} filter`}
          styles={{
            root: { color: "var(--graph-panel-text-dim)" },
          }}
        >
          <X size={12} />
        </ActionIcon>
      </div>

      {meta.type === "numeric" ? (
        <CosmographHistogram
          ref={histogramRef}
          id={`filter:${filter.column}`}
          accessor={filter.column}
          initialSelection={numericSelection}
          preserveSelectionOnUnmount
          highlightSelectedData
          useQuantiles
          onSelection={(selection) =>
            setNumericFilterSelection(filter.column, selection)
          }
          style={{ height: 88, width: "100%" }}
        />
      ) : (
        <CosmographBars
          ref={barsRef}
          id={`filter:${filter.column}`}
          accessor={filter.column}
          initialSelection={categoricalSelection}
          selectOnClick
          preserveSelectionOnUnmount
          highlightSelectedData
          maxDisplayedItems={12}
          showSearch
          showSortingBlock
          showTotalWhenFiltered
          sort="count"
          onClick={(item?: { label: string }) =>
            setCategoricalFilterSelection(filter.column, item?.label)
          }
          style={{ height: 120, width: "100%" }}
        />
      )}
    </div>
  );
}
