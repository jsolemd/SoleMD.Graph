"use client";

import { Badge, Group, Stack, Text } from "@mantine/core";
import type { GraphDetailCitation, PaperNode } from "@/features/graph/types";
import { findPaperNodeByPaperId } from "../helpers";
import { getPaperRefMeta, ItemActions } from "./ReferencesContent";
import {
  panelAccentCardClassName,
  panelAccentCardStyle,
} from "@/features/graph/components/panels/PanelShell";
import {
  RemoteStatus,
  panelTextDimStyle,
  panelTextStyle,
  sectionLabelStyle,
} from "../ui";

export function ConnectionsContent({
  incoming,
  outgoing,
  paperNodes,
  onNavigateToPaper,
  loading,
  error,
}: {
  incoming: GraphDetailCitation[] | undefined;
  outgoing: GraphDetailCitation[] | undefined;
  paperNodes: PaperNode[];
  onNavigateToPaper: (node: PaperNode) => void;
  loading: boolean;
  error: string | null;
}) {
  if (loading || error) {
    return <RemoteStatus loading={loading} error={error} label="Loading connections…" />;
  }

  const total = (incoming?.length ?? 0) + (outgoing?.length ?? 0);
  if (!total) {
    return <Text style={panelTextDimStyle}>No citation connections available.</Text>;
  }

  const renderItems = (items: GraphDetailCitation[] | undefined, label: string) => {
    if (!items?.length) return null;

    const grouped = items.reduce<{
      inGraph: Array<{ citation: GraphDetailCitation; graphNode: PaperNode }>;
      outside: Array<{ citation: GraphDetailCitation; graphNode: null }>;
    }>(
      (acc, citation) => {
        const graphNode = findPaperNodeByPaperId(
          paperNodes,
          citation.related_paper_id ?? citation.related_paper?.paper_id ?? null
        );
        if (graphNode) {
          acc.inGraph.push({ citation, graphNode });
        } else {
          acc.outside.push({ citation, graphNode: null });
        }
        return acc;
      },
      { inGraph: [], outside: [] }
    );

    const renderCitationGroup = (
      groupLabel: string,
      groupItems: Array<{ citation: GraphDetailCitation; graphNode: PaperNode | null }>
    ) => {
      if (!groupItems.length) return null;

      return (
        <div>
          <Text size="xs" fw={600} mb={6} style={sectionLabelStyle}>
            {groupLabel}
          </Text>
          <Stack gap="sm">
            {groupItems.map(({ citation, graphNode }) => {
              const paper = citation.related_paper;

              return (
                <div
                  key={`${groupLabel}:${citation.citation_id}`}
                  className={panelAccentCardClassName}
                  style={panelAccentCardStyle}
                >
                  <Group gap={6} mb={6}>
                    <Badge size="xs" variant="outline" color="gray">
                      {label}
                    </Badge>
                    <Badge size="xs" color={graphNode ? "green" : "gray"} variant="light">
                      {graphNode ? "In graph" : "Outside graph"}
                    </Badge>
                  </Group>
                  <Text fw={600} style={panelTextStyle}>
                    {paper?.title ?? citation.cited_title_raw ?? "Citation"}
                  </Text>
                  <Text mt={4} style={panelTextDimStyle}>
                    {getPaperRefMeta(paper)}
                  </Text>
                  <ItemActions
                    graphNode={graphNode}
                    onNavigateToPaper={onNavigateToPaper}
                    doi={paper?.doi ?? citation.cited_doi}
                    pmid={paper?.pmid ?? citation.cited_pmid}
                  />
                </div>
              );
            })}
          </Stack>
        </div>
      );
    };

    return (
      <div>
        <Text size="xs" fw={600} mb={6} style={sectionLabelStyle}>
          {label}
        </Text>
        <Stack gap="sm">
          {renderCitationGroup(`${label} in graph`, grouped.inGraph)}
          {renderCitationGroup(`${label} outside graph`, grouped.outside)}
        </Stack>
      </div>
    );
  };

  return (
    <Stack gap="sm">
      {renderItems(outgoing, "Cites")}
      {renderItems(incoming, "Cited by")}
    </Stack>
  );
}
