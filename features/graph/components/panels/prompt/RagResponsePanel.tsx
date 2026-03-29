"use client";

import { ScrollArea, Text } from "@mantine/core";
import type { GraphNode, GraphRagQueryResponsePayload } from "@/features/graph/types";

export function RagResponsePanel({
  ragResponse,
  ragError,
  isSubmitting,
  isFullHeightMode,
  selectedNode,
  selectedScopeLabel,
}: {
  ragResponse: GraphRagQueryResponsePayload | null;
  ragError: string | null;
  isSubmitting: boolean;
  isFullHeightMode: boolean;
  selectedNode: GraphNode | null;
  selectedScopeLabel: string | null;
}) {
  return (
    <div
      style={{
        marginTop: 8,
        borderTop: "1px solid var(--graph-panel-border)",
        paddingTop: 10,
      }}
    >
      {selectedNode && (
        <Text size="xs" style={{ color: "var(--graph-prompt-placeholder)" }}>
          Scoped to {selectedScopeLabel}: {selectedNode.displayLabel || selectedNode.citekey || selectedNode.paperTitle || selectedNode.id}
        </Text>
      )}
      {isSubmitting && (
        <Text mt={6} size="sm" style={{ color: "var(--graph-prompt-placeholder)" }}>
          Querying graph evidence…
        </Text>
      )}
      {ragError && (
        <Text mt={6} size="sm" style={{ color: "var(--graph-prompt-placeholder)" }}>
          {ragError}
        </Text>
      )}
      {ragResponse && (
        <ScrollArea.Autosize mah={isFullHeightMode ? 320 : 220} mt={6} type="auto">
          {ragResponse.answer && (
            <Text size="sm" style={{ color: "var(--graph-prompt-text)", whiteSpace: "pre-wrap" }}>
              {ragResponse.answer}
            </Text>
          )}
          {!ragResponse.answer && ragResponse.results.length === 0 && (
            <Text size="sm" style={{ color: "var(--graph-prompt-placeholder)" }}>
              No matching evidence was found for this query.
            </Text>
          )}
          {ragResponse.results.length > 0 && (
            <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
              {ragResponse.results.slice(0, 3).map((result) => (
                <div
                  key={result.chunk_id}
                  className="rounded-xl px-3 py-2"
                  style={{
                    backgroundColor: "var(--mode-accent-subtle)",
                    border: "1px solid var(--mode-accent-border)",
                  }}
                >
                  <Text size="xs" fw={600} style={{ color: "var(--graph-prompt-text)" }}>
                    {[result.citekey || result.paper_title || result.paper_id, result.section, result.page != null ? `p. ${result.page}` : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </Text>
                  <Text mt={4} size="sm" style={{ color: "var(--graph-prompt-text)" }}>
                    {result.text}
                  </Text>
                </div>
              ))}
            </div>
          )}
        </ScrollArea.Autosize>
      )}
    </div>
  );
}
