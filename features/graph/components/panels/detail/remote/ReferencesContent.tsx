"use client";

import { Badge, Button, Group, Stack, Text } from "@mantine/core";
import { ArrowRight } from "lucide-react";
import type { GraphDetailCitation, GraphDetailReference, PaperNode } from "@/features/graph/types";
import { findPaperNodeByPaperId } from "../helpers";
import {
  ExtLink,
  RemoteStatus,
  panelTextDimStyle,
  panelTextStyle,
  sectionLabelStyle,
} from "../ui";

export function getPaperRefMeta(paper: GraphDetailCitation["related_paper"] | null | undefined) {
  if (!paper) return "";
  return [paper.citekey, paper.journal, paper.year].filter(Boolean).join(" · ");
}

function ItemActions({
  graphNode,
  onNavigateToPaper,
  doi,
  pmid,
}: {
  graphNode: PaperNode | null;
  onNavigateToPaper: (node: PaperNode) => void;
  doi: string | null;
  pmid: string | null;
}) {
  return (
    <Group gap="xs" mt={6}>
      {graphNode && (
        <Button
          size="compact-xs"
          variant="light"
          leftSection={<ArrowRight size={12} />}
          onClick={() => onNavigateToPaper(graphNode)}
        >
          Go to node
        </Button>
      )}
      <ExtLink href={doi ? `https://doi.org/${doi}` : null} label="DOI" />
      <ExtLink href={pmid ? `https://pubmed.ncbi.nlm.nih.gov/${pmid}/` : null} label="PubMed" />
    </Group>
  );
}

export function ReferencesContent({
  references,
  paperNodes,
  onNavigateToPaper,
  loading,
  error,
}: {
  references: GraphDetailReference[] | undefined;
  paperNodes: PaperNode[];
  onNavigateToPaper: (node: PaperNode) => void;
  loading: boolean;
  error: string | null;
}) {
  if (loading || error) {
    return <RemoteStatus loading={loading} error={error} label="Loading references…" />;
  }
  if (!references?.length) {
    return <Text style={panelTextDimStyle}>No references available.</Text>;
  }

  const grouped = references.reduce<{
    inGraph: Array<{ reference: GraphDetailReference; graphNode: PaperNode }>;
    external: Array<{ reference: GraphDetailReference; graphNode: null }>;
    unresolved: Array<{ reference: GraphDetailReference; graphNode: null }>;
  }>(
    (acc, reference) => {
      const graphNode = findPaperNodeByPaperId(
        paperNodes,
        reference.resolved_paper_id ?? reference.resolved_paper?.paper_id ?? null
      );

      if (graphNode) {
        acc.inGraph.push({ reference, graphNode });
      } else if (reference.resolved_paper_id) {
        acc.external.push({ reference, graphNode: null });
      } else {
        acc.unresolved.push({ reference, graphNode: null });
      }

      return acc;
    },
    { inGraph: [], external: [], unresolved: [] }
  );

  const renderReferenceGroup = (
    label: string,
    items: Array<{ reference: GraphDetailReference; graphNode: PaperNode | null }>
  ) => {
    if (!items.length) return null;

    return (
      <div>
        <Text size="xs" fw={600} mb={6} style={sectionLabelStyle}>
          {label}
        </Text>
        <Stack gap="md">
          {items.map(({ reference, graphNode }) => (
            <div
              key={`${label}:${reference.ref_index}:${reference.title ?? reference.raw_citation_text ?? "reference"}`}
              className="rounded-xl px-3 py-3"
              style={{
                backgroundColor: "var(--mode-accent-subtle)",
                border: "1px solid var(--mode-accent-border)",
              }}
            >
              <Group gap={6} mb={6}>
                {reference.resolved_paper_id && (
                  <Badge size="xs" color={graphNode ? "green" : "gray"} variant="light">
                    {graphNode ? "In graph" : "Outside graph"}
                  </Badge>
                )}
                {reference.resolution_method && (
                  <Badge size="xs" variant="outline" color="gray">
                    {reference.resolution_method}
                  </Badge>
                )}
              </Group>
              <Text fw={600} style={panelTextStyle}>
                {reference.title ?? reference.raw_citation_text ?? `Reference ${reference.ref_index}`}
              </Text>
              <Text mt={4} style={panelTextDimStyle}>
                {[reference.journal, reference.year, reference.pages].filter(Boolean).join(" · ")}
              </Text>
              <ItemActions
                graphNode={graphNode}
                onNavigateToPaper={onNavigateToPaper}
                doi={reference.doi}
                pmid={reference.pmid}
              />
            </div>
          ))}
        </Stack>
      </div>
    );
  };

  return (
    <Stack gap="lg">
      {renderReferenceGroup("References in graph", grouped.inGraph)}
      {renderReferenceGroup("References outside graph", grouped.external)}
      {renderReferenceGroup("Unresolved references", grouped.unresolved)}
    </Stack>
  );
}
