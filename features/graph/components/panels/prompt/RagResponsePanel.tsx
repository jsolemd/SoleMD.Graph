"use client";

import { ActionIcon, Badge, Group, Paper, ScrollArea, Stack, Text } from "@mantine/core";
import { X } from "lucide-react";
import type { GraphPointRecord, GraphRagQueryResponsePayload } from "@/features/graph/types";
import type {
  RagGraphAvailabilitySummary,
  RagResponseSession,
} from "./use-rag-query";

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

function formatEvidenceLabel(value: string) {
  return value.replaceAll("_", " ");
}

export function RagResponsePanel({
  ragResponse,
  streamedAnswer,
  ragError,
  ragSession,
  ragGraphAvailability,
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
  ragGraphAvailability: RagGraphAvailabilitySummary | null;
  isSubmitting: boolean;
  isFullHeightMode: boolean;
  selectedNode: GraphPointRecord | null;
  selectedScopeLabel: string | null;
  onDismiss: () => void;
}) {
  const title = ragSession?.origin === "compose" ? "Evidence assist" : "Ask the graph";
  const intentLabel = getIntentLabel(ragSession?.evidenceIntent ?? null);
  const answerText = streamedAnswer || ragResponse?.answer || null;
  const groundedAnswer = ragResponse?.grounded_answer ?? null;
  const inlineCitationById = new Map(
    groundedAnswer?.inline_citations.map((anchor) => [anchor.anchor_id, anchor]) ?? [],
  );
  const selectionScopeCount =
    ragResponse?.scope_mode === "selection_only"
      ? ragResponse.selection_graph_paper_refs.length
      : 0;
  const answerGroundingCount = ragResponse?.answer_graph_paper_refs.length ?? 0;
  const activeResolvedCount = ragGraphAvailability?.activeResolvedGraphPaperRefs.length ?? 0;
  const overlayPromotedCount = ragGraphAvailability?.overlayPromotedGraphPaperRefs.length ?? 0;
  const evidenceOnlyCount = ragGraphAvailability?.evidenceOnlyGraphPaperRefs.length ?? 0;

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
                Focused {selectedScopeLabel}: {selectedNode.displayLabel || selectedNode.citekey || selectedNode.paperTitle || selectedNode.id}
              </Text>
            )}
            {selectionScopeCount > 0 && (
              <Text size="xs" style={{ color: "var(--graph-prompt-placeholder)" }}>
                Retrieval limited to {selectionScopeCount} paper{selectionScopeCount === 1 ? "" : "s"} in the current graph selection
              </Text>
            )}
            {answerGroundingCount > 0 && (
              <Text size="xs" style={{ color: "var(--graph-prompt-placeholder)" }}>
                {answerGroundingCount} answer-linked stud{answerGroundingCount === 1 ? "y is" : "ies are"} selected on the graph
              </Text>
            )}
            {activeResolvedCount > 0 && (
              <Text size="xs" style={{ color: "var(--graph-prompt-placeholder)" }}>
                {activeResolvedCount} evidence stud{activeResolvedCount === 1 ? "y was" : "ies were"} already active on the graph
              </Text>
            )}
            {overlayPromotedCount > 0 && (
              <Text size="xs" style={{ color: "var(--graph-prompt-placeholder)" }}>
                {overlayPromotedCount} evidence stud{overlayPromotedCount === 1 ? "y was" : "ies were"} promoted from the universe into the active canvas
              </Text>
            )}
            {evidenceOnlyCount > 0 && (
              <Text size="xs" style={{ color: "var(--graph-prompt-placeholder)" }}>
                {evidenceOnlyCount} evidence stud{evidenceOnlyCount === 1 ? "y is" : "ies are"} not graph-resolvable in the current attached universe
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
              {groundedAnswer?.segments.length ? (
                <Stack gap="xs">
                  {groundedAnswer.segments.map((segment) => (
                    <Text
                      key={`segment-${segment.segment_ordinal}`}
                      size="sm"
                      style={{
                        color: "var(--graph-prompt-text)",
                        whiteSpace: "pre-wrap",
                      }}
                    >
                      {segment.text}
                      {segment.citation_anchor_ids.map((anchorId) => {
                        const anchor = inlineCitationById.get(anchorId);
                        if (!anchor) {
                          return null;
                        }

                        return (
                          <Text
                            key={anchor.anchor_id}
                            component="span"
                            ml={6}
                            size="xs"
                            fw={700}
                            style={{ color: "var(--mode-accent)" }}
                          >
                            {anchor.label}
                          </Text>
                        );
                      })}
                    </Text>
                  ))}
                </Stack>
              ) : answerText ? (
                <Text size="sm" style={{ color: "var(--graph-prompt-text)", whiteSpace: "pre-wrap" }}>
                  {answerText}
                </Text>
              ) : null}

              {ragResponse &&
                !answerText &&
                !groundedAnswer?.segments.length &&
                ragResponse.results.length === 0 && (
                <Text size="sm" style={{ color: "var(--graph-prompt-placeholder)" }}>
                  No matching evidence was found for this query.
                </Text>
                )}

              {groundedAnswer?.cited_spans.length ? (
                <Stack gap="xs">
                  <Text size="xs" fw={700} style={{ color: "var(--graph-prompt-text)" }}>
                    Grounded evidence
                  </Text>
                  <div style={{ display: "grid", gap: 8 }}>
                    {groundedAnswer.cited_spans.slice(0, 4).map((packet) => {
                      const packetLabels = groundedAnswer.inline_citations
                        .filter((anchor) => anchor.cited_span_ids.includes(packet.packet_id))
                        .map((anchor) => anchor.label);

                      return (
                        <div
                          key={packet.packet_id}
                          className="rounded-xl px-3 py-2"
                          style={{
                            backgroundColor: "var(--mode-accent-subtle)",
                            border: "1px solid var(--mode-accent-border)",
                          }}
                        >
                          <Text size="xs" fw={600} style={{ color: "var(--graph-prompt-text)" }}>
                            {[
                              packetLabels.join(" "),
                              formatEvidenceLabel(packet.section_role),
                              formatEvidenceLabel(packet.block_kind),
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </Text>
                          <Text mt={4} size="sm" style={{ color: "var(--graph-prompt-text)" }}>
                            {packet.quote_text || packet.text}
                          </Text>
                          {packet.entity_mentions.length > 0 && (
                            <Group mt={8} gap={6}>
                              {packet.entity_mentions.slice(0, 4).map((entity) => (
                                <Badge
                                  key={`${packet.packet_id}:${entity.text}:${entity.concept_id ?? "raw"}`}
                                  variant="light"
                                  radius="sm"
                                  style={{
                                    backgroundColor: "var(--graph-prompt-bg)",
                                    border: "1px solid var(--mode-accent-border)",
                                    color: "var(--graph-prompt-text)",
                                  }}
                                >
                                  {entity.text}
                                </Badge>
                              ))}
                            </Group>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </Stack>
              ) : null}

              {ragResponse?.results.length ? (
                <div style={{ display: "grid", gap: 8 }}>
                  {ragResponse.results.slice(0, 4).map((result, index) => (
                    <div
                      key={result.result_id || `${result.paper_id || "paper"}-${index}`}
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
