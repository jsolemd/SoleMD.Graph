"use client";

import { ActionIcon, Badge, Group, Paper, ScrollArea, Stack, Text } from "@mantine/core";
import { X } from "lucide-react";
import type { GraphPointRecord, GraphRagQueryResponsePayload } from "@/features/graph/types";
import type { RagResponseSession } from "./use-rag-query";

function getIntentLabel(intent: RagResponseSession["evidenceIntent"]) {
  if (intent === "support") {
    return "Support";
  }
  if (intent === "refute") {
    return "Refute";
  }
  if (intent === "both") {
    return "Support + Refute";
  }
  return null;
}

export function RagResponsePanel({
  ragResponse,
  streamedAnswer,
  ragError,
  ragSession,
  isSubmitting,
  isFullHeightMode,
  selectedNode,
  selectedScopeLabel,
  onDismiss,
}: {
  ragResponse: GraphRagQueryResponsePayload | null;
  streamedAnswer: string | null;
  ragError: string | null;
  ragSession: RagResponseSession | null;
  isSubmitting: boolean;
  isFullHeightMode: boolean;
  selectedNode: GraphPointRecord | null;
  selectedScopeLabel: string | null;
  onDismiss: () => void;
}) {
  const title = ragSession?.origin === "compose" ? "Evidence assist" : "Ask the graph";
  const intentLabel = getIntentLabel(ragSession?.evidenceIntent ?? null);
  const answerText = streamedAnswer || ragResponse?.answer || null;

  return (
    <Paper
      radius="24px"
      p="md"
      withBorder
      style={{
        backgroundColor: "var(--graph-prompt-bg)",
        borderColor: "var(--graph-prompt-border)",
        boxShadow: "var(--graph-prompt-shadow)",
      }}
    >
      <Stack gap="sm">
        <Group align="flex-start" justify="space-between" wrap="nowrap">
          <Stack gap={4} style={{ minWidth: 0 }}>
            <Group gap="xs">
              <Text fw={700} size="sm" style={{ color: "var(--graph-prompt-text)" }}>
                {title}
              </Text>
              {intentLabel && (
                <Badge
                  variant="light"
                  radius="sm"
                  style={{
                    backgroundColor: "var(--mode-accent-subtle)",
                    border: "1px solid var(--mode-accent-border)",
                    color: "var(--graph-prompt-text)",
                  }}
                >
                  {intentLabel}
                </Badge>
              )}
            </Group>
            {ragSession?.queryPreview && (
              <Text size="xs" style={{ color: "var(--graph-prompt-placeholder)" }}>
                {ragSession.queryPreview}
              </Text>
            )}
            {selectedNode && (
              <Text size="xs" style={{ color: "var(--graph-prompt-placeholder)" }}>
                Scoped to {selectedScopeLabel}: {selectedNode.displayLabel || selectedNode.citekey || selectedNode.paperTitle || selectedNode.id}
              </Text>
            )}
          </Stack>
          <ActionIcon
            variant="subtle"
            color="gray"
            radius="xl"
            onClick={onDismiss}
            aria-label="Dismiss evidence response"
          >
            <X size={14} />
          </ActionIcon>
        </Group>

        {isSubmitting && (
          <Text size="sm" style={{ color: "var(--graph-prompt-placeholder)" }}>
            Querying graph evidence…
          </Text>
        )}

        {ragError && (
          <Text size="sm" style={{ color: "var(--graph-prompt-placeholder)" }}>
            {ragError}
          </Text>
        )}

        {(ragResponse || (!isSubmitting && !ragError)) && (
          <ScrollArea.Autosize mah={isFullHeightMode ? 360 : 280} type="auto">
            <Stack gap="sm">
              {answerText && (
                <Text size="sm" style={{ color: "var(--graph-prompt-text)", whiteSpace: "pre-wrap" }}>
                  {answerText}
                </Text>
              )}

              {ragResponse && !answerText && ragResponse.results.length === 0 && (
                <Text size="sm" style={{ color: "var(--graph-prompt-placeholder)" }}>
                  No matching evidence was found for this query.
                </Text>
              )}

              {ragResponse?.results.length ? (
                <div style={{ display: "grid", gap: 8 }}>
                  {ragResponse.results.slice(0, 4).map((result, index) => (
                    <div
                      key={result.chunk_id || `${result.paper_id || "paper"}-${index}`}
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
              ) : null}
            </Stack>
          </ScrollArea.Autosize>
        )}
      </Stack>
    </Paper>
  );
}
