"use client";

import { Badge, Button, Group, Stack, Text } from "@mantine/core";
import { ArrowRight } from "lucide-react";
import type { ChunkNode, ClusterExemplar, ClusterInfo } from "@/features/graph/types";
import { findChunkNodeByChunkId } from "../helpers";
import { KV, panelTextDimStyle, panelTextStyle } from "../ui";

export function ClusterContent({ cluster }: { cluster: ClusterInfo | null }) {
  if (!cluster) {
    return <Text style={panelTextDimStyle}>No cluster data available.</Text>;
  }

  return (
    <Stack gap="xs">
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
  chunkNodes,
  onNavigateToChunk,
}: {
  exemplars: ClusterExemplar[];
  chunkNodes: ChunkNode[];
  onNavigateToChunk: (node: ChunkNode) => void;
}) {
  if (exemplars.length === 0) {
    return <Text style={panelTextDimStyle}>No related chunks available for this cluster.</Text>;
  }

  return (
    <Stack gap="md">
      {exemplars.map((exemplar) => {
        const graphNode = findChunkNodeByChunkId(chunkNodes, exemplar.ragChunkId);
        return (
          <div
            key={`${exemplar.clusterId}:${exemplar.rank}:${exemplar.ragChunkId}`}
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
                  {(exemplar.sectionCanonical || exemplar.pageNumber != null) && (
                    <Badge size="xs" variant="outline" color="gray">
                      {[exemplar.sectionCanonical, exemplar.pageNumber != null ? `p. ${exemplar.pageNumber}` : null]
                        .filter(Boolean)
                        .join(" · ")}
                    </Badge>
                  )}
                </Group>
                <Text fw={600} style={panelTextDimStyle}>
                  {exemplar.citekey ?? exemplar.paperTitle ?? "—"}
                </Text>
                <Text mt={4} style={panelTextStyle}>
                  {exemplar.chunkPreview ?? "No preview available."}
                </Text>
              </div>
              {graphNode && (
                <Button
                  size="compact-xs"
                  variant="light"
                  leftSection={<ArrowRight size={12} />}
                  onClick={() => onNavigateToChunk(graphNode)}
                >
                  Open
                </Button>
              )}
            </Group>
          </div>
        );
      })}
    </Stack>
  );
}
