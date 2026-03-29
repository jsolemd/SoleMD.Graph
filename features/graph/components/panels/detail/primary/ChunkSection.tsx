"use client";

import { Text } from "@mantine/core";
import type { ChunkNode } from "@/features/graph/types";
import {
  InlineStats,
  panelTextDimStyle,
  panelTextStyle,
  sectionLabelStyle,
} from "../ui";

export function ChunkSection({
  node,
  chunk,
  loading,
  error,
}: {
  node: ChunkNode;
  chunk: {
    chunkText?: string | null;
    tokenCount?: number | null;
    charCount?: number | null;
  } | null;
  loading: boolean;
  error: string | null;
}) {
  const text = chunk?.chunkText ?? node.chunkPreview;

  return (
    <div>
      <Text size="xs" fw={600} mb={8} style={sectionLabelStyle}>
        Passage
      </Text>
      {loading ? (
        <Text style={panelTextDimStyle}>Querying local bundle…</Text>
      ) : error ? (
        <Text style={panelTextDimStyle}>{error}</Text>
      ) : (
        <>
          <div
            className="rounded-xl px-3 py-3"
            style={{
              backgroundColor: "var(--mode-accent-subtle)",
              border: "1px solid var(--mode-accent-border)",
            }}
          >
            <Text style={{ ...panelTextStyle, whiteSpace: "pre-wrap" }}>
              {text ?? "No chunk text available."}
            </Text>
          </div>
          <div className="mt-2">
            <InlineStats
              items={[
                { label: "tokens", value: chunk?.tokenCount ?? node.tokenCount },
                { label: "chars", value: chunk?.charCount ?? node.charCount },
              ]}
            />
          </div>
        </>
      )}
    </div>
  );
}
