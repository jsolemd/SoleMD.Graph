"use client";

import { useEffect, useState } from "react";
import {
  Accordion,
  Anchor,
  Badge,
  Divider,
  Group,
  Loader,
  Stack,
  Text,
} from "@mantine/core";
import { ExternalLink } from "lucide-react";
import { useGraphStore } from "@/lib/graph/stores";
import { formatNumber } from "@/lib/helpers";
import {
  PanelShell,
  panelBodyTextClassName,
  panelCardClassName,
  panelCardStyle,
  panelMetaTextClassName,
  panelStatValueTextClassName,
  panelTitleTextClassName,
  panelTextStyle,
  panelTextDimStyle,
  sectionLabelStyle,
} from "./PanelShell";
import type {
  GraphBundleQueries,
  GraphPaperDetail,
  GraphSelectionDetail,
} from "@/lib/graph/types";

function Metric({
  label,
  value,
}: {
  label: string;
  value: number | null | undefined;
}) {
  return (
    <div
      className={panelCardClassName}
      style={panelCardStyle}
    >
      <Text size="xs" fw={600} style={sectionLabelStyle}>
        {label}
      </Text>
      <Text
        mt={4}
        fw={600}
        className={panelStatValueTextClassName}
        style={panelTextStyle}
      >
        {value == null ? "—" : formatNumber(value)}
      </Text>
    </div>
  );
}

function LinkRow({
  href,
  label,
}: {
  href: string | null;
  label: string;
}) {
  if (!href) {
    return null;
  }

  return (
    <Anchor
      href={href}
      target="_blank"
      rel="noreferrer"
      className={`inline-flex items-center gap-1 ${panelMetaTextClassName}`}
      style={{ color: "var(--brand-accent)" }}
    >
      {label}
      <ExternalLink size={12} />
    </Anchor>
  );
}

function buildPaperLinks(paper: GraphPaperDetail | null) {
  if (!paper) {
    return {
      doi: null,
      pmc: null,
      pubmed: null,
    };
  }

  return {
    doi: paper.doi ? `https://doi.org/${paper.doi}` : null,
    pmc: paper.pmcid
      ? `https://pmc.ncbi.nlm.nih.gov/articles/${paper.pmcid}/`
      : null,
    pubmed: paper.pmid
      ? `https://pubmed.ncbi.nlm.nih.gov/${paper.pmid}/`
      : null,
  };
}

const accordionStyles = {
  item: {
    backgroundColor: "var(--graph-panel-input-bg)",
    borderColor: "var(--graph-panel-border)",
  },
  control: { color: "var(--graph-panel-text)" },
  label: { fontSize: "0.75rem", fontWeight: 600 },
  content: { color: "var(--graph-panel-text-dim)" },
} as const;

export function DetailPanel({ queries }: { queries: GraphBundleQueries }) {
  const selectedNode = useGraphStore((s) => s.selectedNode);
  const selectNode = useGraphStore((s) => s.selectNode);
  const [resolvedSelection, setResolvedSelection] = useState<{
    detail: GraphSelectionDetail | null;
    error: string | null;
    selectionId: string | null;
  }>({
    detail: null,
    error: null,
    selectionId: null,
  });

  useEffect(() => {
    if (!selectedNode) {
      return;
    }

    let cancelled = false;

    queries
      .getSelectionDetail(selectedNode)
      .then((nextDetail) => {
        if (cancelled) {
          return;
        }

        setResolvedSelection({
          detail: nextDetail,
          error: null,
          selectionId: selectedNode.id,
        });
      })
      .catch((nextError: unknown) => {
        if (cancelled) {
          return;
        }

        setResolvedSelection({
          detail: null,
          error:
            nextError instanceof Error
              ? nextError.message
              : "Failed to load local graph detail",
          selectionId: selectedNode.id,
        });
      });

    return () => {
      cancelled = true;
    };
  }, [queries, selectedNode]);

  if (!selectedNode) {
    return null;
  }

  const isResolvedSelection = resolvedSelection.selectionId === selectedNode.id;
  const detail = isResolvedSelection ? resolvedSelection.detail : null;
  const error = isResolvedSelection ? resolvedSelection.error : null;
  const loading = !isResolvedSelection;
  const paper = detail?.paper ?? null;
  const chunk = detail?.chunk ?? null;
  const cluster = detail?.cluster ?? null;
  const exemplars = detail?.exemplars ?? [];
  const links = buildPaperLinks(paper);
  const title = paper?.title ?? selectedNode.paperTitle;
  const subtitle = [
    paper?.journal ?? selectedNode.journal,
    paper?.year ?? selectedNode.year,
    paper?.citekey ?? selectedNode.citekey,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <PanelShell
      title="Selection"
      side="right"
      width={380}
      onClose={() => selectNode(null)}
    >
      <div className="scrollbar-thin flex-1 overflow-y-auto px-4 pb-4">
        <Stack gap="md">
          <Group gap="xs">
            <Badge
              variant="light"
              styles={{
                root: {
                  backgroundColor: "var(--interactive-active)",
                  color: "var(--graph-panel-text)",
                },
              }}
            >
              {selectedNode.clusterLabel ?? `Cluster ${selectedNode.clusterId}`}
            </Badge>
            {selectedNode.sectionCanonical && (
              <Badge
                variant="outline"
                styles={{
                  root: {
                    borderColor: "var(--graph-panel-border)",
                    color: "var(--graph-panel-text)",
                  },
                }}
              >
                {selectedNode.sectionCanonical}
              </Badge>
            )}
            {selectedNode.pageNumber != null && (
              <Badge
                variant="outline"
                styles={{
                  root: {
                    borderColor: "var(--graph-panel-border)",
                    color: "var(--graph-panel-text-dim)",
                  },
                }}
              >
                p. {selectedNode.pageNumber}
              </Badge>
            )}
          </Group>

          <div>
            <Text
              fw={600}
              className={panelTitleTextClassName}
              style={panelTextStyle}
            >
              {title}
            </Text>
            {subtitle && (
              <Text
                mt={4}
                className={panelMetaTextClassName}
                style={panelTextDimStyle}
              >
                {subtitle}
              </Text>
            )}
          </div>

          <Divider color="var(--graph-panel-border)" />

          <div>
            <Text size="xs" fw={600} mb={8} style={sectionLabelStyle}>
              Evidence
            </Text>
            {loading ? (
              <Group gap="xs">
                <Loader size="xs" color="var(--brand-accent)" />
                <Text
                  className={panelMetaTextClassName}
                  style={panelTextDimStyle}
                >
                  Querying local bundle…
                </Text>
              </Group>
            ) : error ? (
              <Text
                className={panelMetaTextClassName}
                style={panelTextDimStyle}
              >
                {error}
              </Text>
            ) : (
              <Text
                className={panelBodyTextClassName}
                style={{ ...panelTextStyle, whiteSpace: "pre-wrap" }}
              >
                {chunk?.chunkText ?? selectedNode.chunkPreview ?? "No chunk text available."}
              </Text>
            )}
          </div>

          <div>
            <Text size="xs" fw={600} mb={8} style={sectionLabelStyle}>
              Paper
            </Text>
            <Stack gap={6}>
              <Text
                className={panelBodyTextClassName}
                style={panelTextStyle}
              >
                {paper?.authors.length
                  ? paper.authors.map((author) => author.name).join(", ")
                  : "Authors unavailable"}
              </Text>
              <Group gap="sm">
                <LinkRow href={links.doi} label="DOI" />
                <LinkRow href={links.pubmed} label="PubMed" />
                <LinkRow href={links.pmc} label="PMC" />
              </Group>
            </Stack>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Metric
              label="Tokens"
              value={chunk?.tokenCount ?? selectedNode.tokenCount}
            />
            <Metric
              label="Characters"
              value={chunk?.charCount ?? selectedNode.charCount}
            />
            <Metric label="Paper Chunks" value={paper?.chunkCount} />
            <Metric label="References" value={paper?.referenceCount} />
            <Metric label="Assets" value={paper?.assetCount} />
            <Metric label="Figures" value={paper?.figureCount} />
          </div>

          <Accordion
            variant="separated"
            styles={accordionStyles}
          >
            <Accordion.Item value="cluster">
              <Accordion.Control>
                Cluster context
              </Accordion.Control>
              <Accordion.Panel>
                <Stack gap="xs">
                  <DetailRow
                    label="Members"
                    value={
                      cluster?.memberCount != null
                        ? formatNumber(cluster.memberCount)
                        : "—"
                    }
                  />
                  <DetailRow
                    label="Papers"
                    value={
                      cluster?.paperCount != null
                        ? formatNumber(cluster.paperCount)
                        : "—"
                    }
                  />
                  <DetailRow
                    label="Mean probability"
                    value={
                      cluster?.meanClusterProbability != null
                        ? cluster.meanClusterProbability.toFixed(3)
                        : "—"
                    }
                  />
                  <DetailRow
                    label="Label source"
                    value={cluster?.labelSource ?? "—"}
                  />
                </Stack>
              </Accordion.Panel>
            </Accordion.Item>

            <Accordion.Item value="exemplars">
              <Accordion.Control>
                Representative passages
              </Accordion.Control>
              <Accordion.Panel>
                <Stack gap="sm">
                  {exemplars.length === 0 && (
                    <Text
                      className={panelMetaTextClassName}
                      style={panelTextDimStyle}
                    >
                      No exemplar rows available for this cluster.
                    </Text>
                  )}
                  {exemplars.map((exemplar) => (
                    <div
                      key={`${exemplar.clusterId}:${exemplar.rank}:${exemplar.ragChunkId}`}
                      className={panelCardClassName}
                      style={{
                        ...panelCardStyle,
                        backgroundColor: "var(--surface)",
                      }}
                    >
                      <Group justify="space-between" align="flex-start">
                        <div>
                          <Text
                            fw={600}
                            className={panelMetaTextClassName}
                            style={panelTextStyle}
                          >
                            #{exemplar.rank} {exemplar.citekey ?? exemplar.paperTitle ?? "Exemplar"}
                          </Text>
                          <Text
                            mt={2}
                            size="xs"
                            style={panelTextDimStyle}
                          >
                            {[exemplar.sectionCanonical, exemplar.pageNumber != null ? `p. ${exemplar.pageNumber}` : null]
                              .filter(Boolean)
                              .join(" · ")}
                          </Text>
                        </div>
                        {exemplar.isRepresentative && (
                          <Badge
                            variant="light"
                            styles={{
                              root: {
                                backgroundColor: "var(--interactive-active)",
                                color: "var(--graph-panel-text)",
                              },
                            }}
                          >
                            Primary
                          </Badge>
                        )}
                      </Group>
                      <Text
                        mt={8}
                        className={panelBodyTextClassName}
                        style={{
                          color: "var(--graph-panel-text)",
                        }}
                      >
                        {exemplar.chunkPreview ?? "No preview available."}
                      </Text>
                    </div>
                  ))}
                </Stack>
              </Accordion.Panel>
            </Accordion.Item>

            <Accordion.Item value="abstract">
              <Accordion.Control>
                Abstract
              </Accordion.Control>
              <Accordion.Panel>
                <Text
                  className={panelBodyTextClassName}
                  style={{
                    color: "var(--graph-panel-text)",
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {paper?.abstract ?? "No abstract available in the bundle."}
                </Text>
              </Accordion.Panel>
            </Accordion.Item>
          </Accordion>
        </Stack>
      </div>
    </PanelShell>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <Text className={panelMetaTextClassName} style={panelTextDimStyle}>
        {label}
      </Text>
      <Text
        fw={600}
        className={panelMetaTextClassName}
        style={panelTextStyle}
      >
        {value}
      </Text>
    </div>
  );
}
