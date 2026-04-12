"use client";

import { Badge, Group, Stack, Text } from "@mantine/core";
import { CheckCircle } from "lucide-react";
import { useGraphStore, useDashboardStore } from "@/features/graph/stores";
import {
  badgeAccentStyles,
  PANEL_BODY_CLASS,
  PanelDivider,
  PanelInlineLoader,
  PanelShell,
  panelAccentCardClassName,
  panelAccentCardStyle,
  panelPillStyles,
  panelTextDimStyle,
  panelTextStyle,
  sectionLabelStyle,
} from "@/features/graph/components/panels/PanelShell";
import type { RagResponseSession } from "./use-rag-query";
import { SCOPE_LABELS } from "./constants";

function getIntentLabel(intent: RagResponseSession["evidenceIntent"]) {
  if (intent === "support") return "Support";
  if (intent === "refute") return "Refute";
  if (intent === "both") return "Support + Refute";
  return null;
}

function formatEvidenceLabel(value: string) {
  return value.replaceAll("_", " ");
}

export function RagResponsePanel() {
  const ragResponse = useDashboardStore((s) => s.ragResponse);
  const streamedAnswer = useDashboardStore((s) => s.streamedAskAnswer);
  const ragError = useDashboardStore((s) => s.ragError);
  const ragSession = useDashboardStore((s) => s.ragSession);
  const ragGraphAvailability = useDashboardStore((s) => s.ragGraphAvailability);
  const isSubmitting = useDashboardStore((s) => s.isRagSubmitting);
  const clearRagStore = useDashboardStore((s) => s.clearRagStore);
  const selectedNode = useGraphStore((s) => s.selectedNode);

  const title =
    ragSession?.origin === "compose" ? "Evidence assist" : "Ask the graph";
  const intentLabel = getIntentLabel(ragSession?.evidenceIntent ?? null);
  const answerText = streamedAnswer || ragResponse?.answer || null;
  const groundedAnswer = ragResponse?.grounded_answer ?? null;
  const inlineCitationById = new Map(
    groundedAnswer?.inline_citations.map((a) => [a.anchor_id, a]) ?? [],
  );

  const selectedScopeLabel = selectedNode
    ? (SCOPE_LABELS[selectedNode.nodeKind] ?? "node")
    : null;

  const hasResults =
    !!answerText ||
    !!groundedAnswer?.segments.length ||
    (ragResponse?.results.length ?? 0) > 0;

  // -- Compact metadata stats --
  const statParts: string[] = [];
  if (
    ragResponse?.scope_mode === "selection_only" &&
    ragResponse.selection_graph_paper_refs.length > 0
  ) {
    const n = ragResponse.selection_graph_paper_refs.length;
    statParts.push(`${n} in selection`);
  }
  if ((ragResponse?.answer_graph_paper_refs.length ?? 0) > 0) {
    statParts.push(
      `${ragResponse!.answer_graph_paper_refs.length} on graph`,
    );
  }
  if ((ragGraphAvailability?.overlayPromotedGraphPaperRefs.length ?? 0) > 0) {
    statParts.push(
      `${ragGraphAvailability!.overlayPromotedGraphPaperRefs.length} promoted`,
    );
  }
  if ((ragGraphAvailability?.evidenceOnlyGraphPaperRefs.length ?? 0) > 0) {
    statParts.push(
      `${ragGraphAvailability!.evidenceOnlyGraphPaperRefs.length} evidence-only`,
    );
  }

  // -- Header actions --
  const headerActions = (
    <Group gap={4}>
      {intentLabel && (
        <Badge variant="light" size="xs" styles={badgeAccentStyles}>
          {intentLabel}
        </Badge>
      )}
      {isSubmitting && <PanelInlineLoader size={10} />}
      {!isSubmitting && hasResults && (
        <CheckCircle
          size={10}
          style={{ color: "var(--mode-accent)", flexShrink: 0 }}
        />
      )}
    </Group>
  );

  // -- Section builder (auto-dividers via flatMap) --
  const sections: React.ReactNode[] = [];

  // Submitting state
  if (isSubmitting) {
    sections.push(
      <PanelInlineLoader key="loading" size={10} label="Querying..." />,
    );
  }

  // Error
  if (ragError) {
    sections.push(
      <Text key="error" style={panelTextDimStyle}>
        {ragError}
      </Text>,
    );
  }

  // Answer / grounded segments
  if (!isSubmitting && !ragError) {
    if (groundedAnswer?.segments.length) {
      sections.push(
        <Stack key="answer" gap={4}>
          {groundedAnswer.segments.map((seg) => (
            <Text
              key={`seg-${seg.segment_ordinal}`}
              style={{ ...panelTextStyle, whiteSpace: "pre-wrap" }}
            >
              {seg.text}
              {seg.citation_anchor_ids.map((id) => {
                const anchor = inlineCitationById.get(id);
                if (!anchor) return null;
                return (
                  <Text
                    key={anchor.anchor_id}
                    component="span"
                    ml={4}
                    fw={700}
                    style={{ ...panelTextStyle, color: "var(--mode-accent)" }}
                  >
                    {anchor.label}
                  </Text>
                );
              })}
            </Text>
          ))}
        </Stack>,
      );
    } else if (answerText) {
      sections.push(
        <Text
          key="answer-plain"
          style={{ ...panelTextStyle, whiteSpace: "pre-wrap" }}
        >
          {answerText}
        </Text>,
      );
    }

    // No results message
    if (ragResponse && !hasResults) {
      sections.push(
        <Text key="empty" style={panelTextDimStyle}>
          No matching evidence found.
        </Text>,
      );
    }

    // Grounded evidence cards
    if (groundedAnswer?.cited_spans.length) {
      sections.push(
        <Stack key="grounded" gap={6}>
          <Text fw={600} style={sectionLabelStyle}>
            Grounded evidence
          </Text>
          {groundedAnswer.cited_spans.slice(0, 4).map((packet) => {
            const labels = groundedAnswer.inline_citations
              .filter((a) => a.cited_span_ids.includes(packet.packet_id))
              .map((a) => a.label);
            return (
              <div
                key={packet.packet_id}
                className={panelAccentCardClassName}
                style={panelAccentCardStyle}
              >
                <Text fw={600} style={panelTextStyle}>
                  {[
                    labels.join(" "),
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
                  <Group mt={6} gap={4}>
                    {packet.entity_mentions.slice(0, 4).map((e) => (
                      <Badge
                        key={`${packet.packet_id}:${e.text}:${e.concept_id ?? "raw"}`}
                        variant="light"
                        size="xs"
                        styles={badgeAccentStyles}
                      >
                        {e.text}
                      </Badge>
                    ))}
                  </Group>
                )}
              </div>
            );
          })}
        </Stack>,
      );
    }

    // Raw result cards
    if (ragResponse?.results.length) {
      sections.push(
        <Stack key="results" gap={6}>
          {ragResponse.results.slice(0, 4).map((r, i) => (
            <div
              key={r.result_id || `${r.paper_id || "paper"}-${i}`}
              className={panelAccentCardClassName}
              style={panelAccentCardStyle}
            >
              <Text fw={600} style={panelTextStyle}>
                {[
                  r.citekey || r.paper_title || r.paper_id,
                  r.section,
                  r.page != null ? `p. ${r.page}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </Text>
              <Text mt={4} style={panelTextStyle}>
                {r.text}
              </Text>
            </div>
          ))}
        </Stack>,
      );
    }
  }

  return (
    <PanelShell
      id="rag-response"
      title={title}
      side="right"
      defaultWidth={420}
      headerActions={headerActions}
      onClose={clearRagStore}
    >
      <div className={PANEL_BODY_CLASS}>
        <Stack gap={8}>
          {/* Query context */}
          {(ragSession?.queryPreview || selectedNode || statParts.length > 0) && (
            <>
              <Stack gap={2}>
                {ragSession?.queryPreview && (
                  <Text style={panelTextDimStyle}>{ragSession.queryPreview}</Text>
                )}
                {selectedNode && (
                  <Text style={panelTextDimStyle}>
                    {selectedScopeLabel}:{" "}
                    {selectedNode.displayLabel ||
                      selectedNode.citekey ||
                      selectedNode.paperTitle ||
                      selectedNode.id}
                  </Text>
                )}
                {statParts.length > 0 && (
                  <Group gap={4}>
                    {statParts.map((s) => (
                      <Badge key={s} size="xs" styles={panelPillStyles}>
                        {s}
                      </Badge>
                    ))}
                  </Group>
                )}
              </Stack>
              <PanelDivider />
            </>
          )}

          {/* Body sections with auto-dividers */}
          {sections.flatMap((section, i) =>
            i > 0
              ? [<PanelDivider key={`d-${i}`} />, section]
              : [section],
          )}
        </Stack>
      </div>
    </PanelShell>
  );
}
