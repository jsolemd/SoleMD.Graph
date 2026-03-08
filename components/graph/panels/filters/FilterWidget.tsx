"use client";

import { ActionIcon, Text } from "@mantine/core";
import { X } from "lucide-react";
import { CosmographHistogram, CosmographBars } from "@cosmograph/react";
import { getColumnMeta } from "@/lib/graph/columns";

interface FilterWidgetProps {
  column: string;
  onRemove: () => void;
}

export function FilterWidget({ column, onRemove }: FilterWidgetProps) {
  const meta = getColumnMeta(column);
  if (!meta) return null;

  return (
    <div
      className="rounded-lg p-3"
      style={{
        backgroundColor: "var(--graph-panel-input-bg)",
        border: "1px solid var(--graph-panel-border)",
      }}
    >
      <div className="mb-2 flex items-center justify-between">
        <Text size="xs" fw={500} style={{ color: "var(--graph-panel-text)" }}>
          {meta.label}
        </Text>
        <ActionIcon
          variant="subtle"
          size={20}
          radius="sm"
          onClick={onRemove}
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
          accessor={column}
          style={{ height: 60, width: "100%" }}
        />
      ) : (
        <CosmographBars
          accessor={column}
          selectOnClick
          style={{ height: 80, width: "100%" }}
        />
      )}
    </div>
  );
}
