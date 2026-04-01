"use client";

import { ActionIcon, Badge, Group, ScrollArea, Stack, Text } from "@mantine/core";
import { X } from "lucide-react";
import type { GraphPointRecord, GraphRagQueryResponsePayload } from "@/features/graph/types";
import {
  badgeAccentStyles,
  iconBtnStyles,
  PanelDivider,
  panelAccentCardClassName,
  panelAccentCardStyle,
  panelTextDimStyle,
  panelTextStyle,
  sectionLabelStyle,
} from "@/features/graph/components/panels/PanelShell";
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
    <div
      className="rounded-3xl p-4"
      style={{
        backgroundColor: "var(--graph-prompt-bg)",
        border: "1px solid var(--graph-prompt-border)",
        boxShadow: "var(--graph-prompt-shadow)",
      }}
    >
      <Stack gap="sm">
        <Group align="flex-start" justify="space-between" wrap="nowrap">
          <Stack gap={4} style={{ minWidth: 0 }}>
            <Group gap="xs">
              <Text fw={700} style={panelTextStyle}>
                {title}
              </Text>
              {intentLabel && (
                <Badge
                  variant="light"
                  size="xs"
                  styles={badgeAccentStyles}
                >
                  {intentLabel}
                </Badge>
              )}
            </Group>
            {ragSession?.queryPreview && (
              <Text style={panelTextDimStyle}>
                {ragSession.queryPreview}
              </Text>
            )}
            {selectedNode && (
              <Text style={panelTextDimStyle}>
                Focused {selectedScopeLabel}: {selectedNode.displayLabel || selectedNode.citekey || selectedNode.paperTitle || selectedNode.id}
              </Text>
            )}
            {selectionScopeCount > 0 && (
              <Text style={panelTextDimStyle}>
                Retrieval limited to {selectionScopeCount} paper{selectionScopeCount === 1 ? "" : "s"} in the current graph selection
              </Text>
            )}
            {answerGroundingCount > 0 && (
              <Text style={panelTextDimStyle}>
                {answerGroundingCount} answer-linked stud{answerGroundingCount === 1 ? "y is" : "ies are"} selected on the graph
              </Text>
            )}
            {activeResolvedCount > 0 && (
              <Text style={panelTextDimStyle}>
                {activeResolvedCount} evidence stud{activeResolvedCount === 1 ? "y was" : "ies were"} already active on the graph
              </Text>
            )}
            {overlayPromotedCount > 0 && (
              <Text style={panelTextDimStyle}>
                {overlayPromotedCount} evidence stud{overlayPromotedCount === 1 ? "y was" : "ies were"} promoted from the universe into the active canvas
              </Text>
            )}
            {evidenceOnlyCount > 0 && (
              <Text style={panelTextDimStyle}>
                {evidenceOnlyCount} evidence stud{evidenceOnlyCount === 1 ? "y is" : "ies are"} not graph-resolvable in the current attached universe
              </Text>
            )}
          </Stack>
          <ActionIcon
            variant="transparent"
            size={24}
            radius="xl"
            className="graph-icon-btn"
            styles={iconBtnStyles}
            onClick={onDismiss}
            aria-label="Dismiss response"
          >
            <X size={12} />
          </ActionIcon>
        </Group>

        <PanelDivider />

        {isSubmitting && (
          <Text style={panelTextDimStyle}>
            Querying graph evidence…
          </Text>
        )}

        {ragError && (
          <Text style={panelTextDimStyle}>
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
                      style={{ ...panelTextStyle, whiteSpace: "pre-wrap" }}
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
                            fw={700}
                            style={{ ...panelTextStyle, color: "var(--mode-accent)" }}
                          >
                            {anchor.label}
                          </Text>
                        );
                      })}
                    </Text>
                  ))}
                </Stack>
              ) : answerText ? (
                <Text style={{ ...panelTextStyle, whiteSpace: "pre-wrap" }}>
                  {answerText}
                </Text>
              ) : null}

              {ragResponse &&
                !answerText &&
                !groundedAnswer?.segments.length &&
                ragResponse.results.length === 0 && (
                <Text style={panelTextDimStyle}>
                  No matching evidence was found for this query.
                </Text>
                )}

              {groundedAnswer?.cited_spans.length ? (
                <>
                  <PanelDivider />
                  <Stack gap="xs">
                    <Text fw={600} style={sectionLabelStyle}>
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
                            className={panelAccentCardClassName}
                            style={panelAccentCardStyle}
                          >
                            <Text fw={600} style={panelTextStyle}>
                              {[
                                packetLabels.join(" "),
                                formatEvidenceLabel(packet.section_role),
                                formatEvidenceLabel(packet.block_kind),
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </Text>
                            <Text mt={4} style={panelTextStyle}>
                              {packet.quote_text || packet.text}
                            </Text>
                            {packet.entity_mentions.length > 0 && (
                              <Group mt={8} gap={6}>
                                {packet.entity_mentions.slice(0, 4).map((entity) => (
                                  <Badge
                                    key={`${packet.packet_id}:${entity.text}:${entity.concept_id ?? "raw"}`}
                                    variant="light"
                                    size="xs"
                                    styles={badgeAccentStyles}
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
                </>
              ) : null}

              {ragResponse?.results.length ? (
                <>
                  <PanelDivider />
                  <div style={{ display: "grid", gap: 8 }}>
                    {ragResponse.results.slice(0, 4).map((result, index) => (
                      <div
                        key={result.result_id || `${result.paper_id || "paper"}-${index}`}
                        className={panelAccentCardClassName}
                        style={panelAccentCardStyle}
                      >
                        <Text fw={600} style={panelTextStyle}>
                          {[result.citekey || result.paper_title || result.paper_id, result.section, result.page != null ? `p. ${result.page}` : null]
                            .filter(Boolean)
                            .join(" · ")}
                        </Text>
                        <Text mt={4} style={panelTextStyle}>
                          {result.text}
                        </Text>
                      </div>
                    ))}
                  </div>
                </>
              ) : null}
            </Stack>
          </ScrollArea.Autosize>
        )}
      </Stack>
    </div>
  );
}
