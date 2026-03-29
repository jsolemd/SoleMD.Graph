"use client";

import { Button, Group, Stack, Text } from "@mantine/core";
import { ArrowRight } from "lucide-react";
import type { ChunkNode, GraphDetailChunkSummary } from "@/features/graph/types";
import { findChunkNodeByChunkId } from "../helpers";
import {
  RemoteStatus,
  panelTextDimStyle,
  panelTextStyle,
} from "../ui";

export function ChunkSummariesContent({
  chunks,
  chunkNodes,
  onNavigateToChunk,
  loading,
  error,
  emptyLabel,
}: {
  chunks: GraphDetailChunkSummary[] | undefined;
  chunkNodes: ChunkNode[];
  onNavigateToChunk: (node: ChunkNode) => void;
  loading: boolean;
  error: string | null;
  emptyLabel: string;
}) {
  if (loading || error) {
    return <RemoteStatus loading={loading} error={error} label="Loading related passages…" />;
  }
  if (!chunks?.length) {
    return <Text style={panelTextDimStyle}>{emptyLabel}</Text>;
  }

  return (
    <Stack gap="md">
      {chunks.map((chunk) => {
        const graphNode = findChunkNodeByChunkId(chunkNodes, chunk.chunk_id);
        return (
          <div
            key={chunk.chunk_id}
            className="rounded-xl px-3 py-3"
            style={{
              backgroundColor: "var(--mode-accent-subtle)",
              border: "1px solid var(--mode-accent-border)",
            }}
          >
            <Group justify="space-between" gap="sm" align="flex-start">
              <div style={{ flex: 1 }}>
                <Text fw={600} style={panelTextDimStyle}>
                  {[chunk.section_canonical, chunk.page_number != null ? `p. ${chunk.page_number}` : null]
                    .filter(Boolean)
                    .join(" · ") || `Chunk ${chunk.chunk_index}`}
                </Text>
                <Text mt={4} style={panelTextStyle}>
                  {chunk.preview}
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
