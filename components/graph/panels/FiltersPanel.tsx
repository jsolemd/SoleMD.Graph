"use client";

import { ActionIcon, Button, Select, Stack, Text } from "@mantine/core";
import { motion } from "framer-motion";
import { Plus, X } from "lucide-react";
import { useState } from "react";
import { useDashboardStore } from "@/lib/graph/dashboard-store";
import { ALL_DATA_COLUMNS } from "@/lib/graph/columns";
import { FilterWidget } from "./filters/FilterWidget";

export function FiltersPanel() {
  const activeFilters = useDashboardStore((s) => s.activeFilters);
  const addFilter = useDashboardStore((s) => s.addFilter);
  const removeFilter = useDashboardStore((s) => s.removeFilter);
  const resetAllFilters = useDashboardStore((s) => s.resetAllFilters);
  const setActivePanel = useDashboardStore((s) => s.setActivePanel);

  const [showAddSelect, setShowAddSelect] = useState(false);

  const availableColumns = ALL_DATA_COLUMNS
    .filter((c) => !activeFilters.includes(c.key))
    .map((c) => ({ value: c.key, label: c.label }));

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.2 }}
      className="absolute top-0 left-0 z-20 flex h-full w-[300px] flex-col overflow-hidden"
      style={{
        backgroundColor: "var(--graph-panel-bg)",
        borderRight: "1px solid var(--graph-panel-border)",
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3">
        <Text
          size="xs"
          fw={600}
          style={{
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            color: "var(--graph-panel-text-muted)",
          }}
        >
          Filters
        </Text>
        <ActionIcon
          variant="subtle"
          size={28}
          radius="md"
          onClick={() => setActivePanel(null)}
          aria-label="Close filters panel"
          styles={{
            root: { color: "var(--graph-panel-text-dim)" },
          }}
        >
          <X size={14} />
        </ActionIcon>
      </div>

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

          {activeFilters.map((col) => (
            <FilterWidget
              key={col}
              column={col}
              onRemove={() => removeFilter(col)}
            />
          ))}

          {showAddSelect ? (
            <Select
              size="xs"
              placeholder="Select column..."
              data={availableColumns}
              onChange={(v) => {
                if (v) {
                  addFilter(v);
                  setShowAddSelect(false);
                }
              }}
              onBlur={() => setShowAddSelect(false)}
              autoFocus
              searchable
              styles={{
                input: {
                  backgroundColor: "var(--graph-panel-input-bg)",
                  borderColor: "var(--graph-panel-border)",
                  color: "var(--graph-panel-text)",
                },
              }}
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

          {activeFilters.length > 0 && (
            <Button
              size="xs"
              variant="subtle"
              color="red"
              onClick={resetAllFilters}
            >
              Reset All Filters
            </Button>
          )}
        </Stack>
      </div>
    </motion.div>
  );
}
