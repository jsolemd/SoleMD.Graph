"use client";

import { Badge, Group, Stack, Text } from "@mantine/core";
import type { ClusterExemplar, ClusterInfo } from "@/features/graph/types";
import { KV, panelTextDimStyle, panelTextStyle } from "../ui";

export function ClusterContent({ cluster }: { cluster: ClusterInfo | null }) {
  if (!cluster) {
    return <Text style={panelTextDimStyle}>No cluster data available.</Text>;
  }

  return (
    <Stack gap="xs">
      {cluster.parentLabel && (
        <Text size="xs" style={panelTextDimStyle}>
          {cluster.parentLabel}
        </Text>
      )}
      {cluster.description && (
        <Text size="sm" style={panelTextStyle}>
          {cluster.description}
        </Text>
      )}
      <KV label="Members" value={String(cluster.memberCount ?? "—")} />
      <KV label="Papers" value={String(cluster.paperCount ?? "—")} />
      <KV
        label="Mean probability"
        value={cluster.meanClusterProbability != null ? cluster.meanClusterProbability.toFixed(3) : "—"}
      />
      <KV label="Label source" value={cluster.labelSource ?? "—"} />
    </Stack>
  );
}

export function ExemplarsContent({
  exemplars,
}: {
  exemplars: ClusterExemplar[];
}) {
  if (exemplars.length === 0) {
    return <Text style={panelTextDimStyle}>No exemplar papers available for this cluster.</Text>;
  }

  return (
    <Stack gap="md">
      {exemplars.map((exemplar) => {
        return (
          <div
            key={`${exemplar.clusterId}:${exemplar.rank}:${exemplar.pointId}`}
            className="rounded-xl px-3 py-3"
            style={{
              backgroundColor: "var(--mode-accent-subtle)",
              border: "1px solid var(--mode-accent-border)",
            }}
          >
            <Group justify="space-between" gap="sm" align="flex-start">
              <div style={{ flex: 1 }}>
                <Group gap={6} mb={6}>
                  {exemplar.isRepresentative && (
                    <Badge size="xs" color="green" variant="light">
                      Primary
                    </Badge>
                  )}
                </Group>
                <Text fw={600} style={panelTextDimStyle}>
                  {exemplar.citekey ?? exemplar.paperTitle ?? "—"}
                </Text>
                <Text mt={4} style={panelTextStyle}>
                  {exemplar.preview ?? "No preview available."}
                </Text>
              </div>
            </Group>
          </div>
        );
      })}
    </Stack>
  );
}
