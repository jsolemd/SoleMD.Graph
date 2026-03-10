"use client";

import { useEffect, useState } from "react";
import {
  Accordion,
  Anchor,
  Badge,
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
  panelTextStyle,
  panelTextDimStyle,
  sectionLabelStyle,
  badgeAccentStyles,
  badgeOutlineStyles,
} from "./PanelShell";
import type {
  ChunkDetail,
  ChunkNode,
  ClusterExemplar,
  ClusterInfo,
  GraphBundleQueries,
  GraphPaperDetail,
  GraphSelectionDetail,
} from "@/lib/graph/types";

/* ─── Shared primitives ───────────────────────────────────────── */

function InlineStats({ items }: { items: Array<{ label: string; value: number | null | undefined }> }) {
  const parts = items
    .filter((m) => m.value != null)
    .map((m) => `${formatNumber(m.value!)} ${m.label}`);
  if (parts.length === 0) return null;
  return (
    <Text style={panelTextDimStyle}>
      {parts.join(" \u00b7 ")}
    </Text>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <Text style={panelTextDimStyle}>
        {label}
      </Text>
      <Text fw={600} style={panelTextStyle}>
        {value}
      </Text>
    </div>
  );
}

function ExtLink({ href, label }: { href: string | null; label: string }) {
  if (!href) return null;
  return (
    <Anchor
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1"
      style={{ color: "var(--mode-accent)", fontSize: 11 }}
    >
      {label}
      <ExternalLink size={11} />
    </Anchor>
  );
}

/* ─── Header ──────────────────────────────────────────────────── */

function DetailHeader({ node, paper }: { node: ChunkNode; paper: GraphPaperDetail | null }) {
  const title = paper?.title ?? node.paperTitle;
  const subtitle = [
    paper?.journal ?? node.journal,
    paper?.year ?? node.year,
    paper?.citekey ?? node.citekey,
  ]
    .filter(Boolean)
    .join(" \u00b7 ");

  return (
    <div>
      <Text fw={600} lh={1.35} style={panelTextStyle}>
        {title}
      </Text>
      {subtitle && (
        <Text mt={4} style={panelTextDimStyle}>
          {subtitle}
        </Text>
      )}
      <Group gap={6} mt={10}>
        <Badge size="xs" styles={badgeAccentStyles}>
          <span
            style={{
              display: "inline-block",
              width: 6,
              height: 6,
              borderRadius: "50%",
              backgroundColor: node.color,
              marginRight: 5,
              verticalAlign: "middle",
            }}
          />
          {node.clusterLabel ?? `Cluster ${node.clusterId}`}
        </Badge>
        {node.sectionCanonical && (
          <Badge size="xs" variant="outline" styles={badgeOutlineStyles}>
            {node.sectionCanonical}
          </Badge>
        )}
        {node.pageNumber != null && (
          <Badge size="xs" variant="outline" styles={badgeOutlineStyles}>
            p. {node.pageNumber}
          </Badge>
        )}
      </Group>
    </div>
  );
}

/* ─── Chunk ───────────────────────────────────────────────────── */

function ChunkSection({
  node,
  chunk,
  loading,
  error,
}: {
  node: ChunkNode;
  chunk: ChunkDetail | null;
  loading: boolean;
  error: string | null;
}) {
  const text = chunk?.chunkText ?? node.chunkPreview;

  return (
    <div>
      <Text size="xs" fw={600} mb={8} style={sectionLabelStyle}>
        Chunk
      </Text>
      {loading ? (
        <Group gap="xs">
          <Loader size="xs" color="var(--mode-accent)" />
          <Text style={panelTextDimStyle}>
            Querying local bundle…
          </Text>
        </Group>
      ) : error ? (
        <Text style={panelTextDimStyle}>
          {error}
        </Text>
      ) : (
        <>
          <div
            className="rounded-xl px-3 py-3"
            style={{
              backgroundColor: "var(--mode-accent-subtle)",
              border: "1px solid var(--mode-accent-border)",
            }}
          >
            <Text
              style={{ ...panelTextStyle, whiteSpace: "pre-wrap" }}
            >
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

/* ─── Paper ───────────────────────────────────────────────────── */

function buildPaperLinks(paper: GraphPaperDetail | null) {
  if (!paper) return { doi: null, pmc: null, pubmed: null };
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

function PaperSection({ paper }: { paper: GraphPaperDetail | null }) {
  if (!paper) return null;
  const links = buildPaperLinks(paper);
  const hasLinks = links.doi || links.pubmed || links.pmc;

  return (
    <div>
      <Text size="xs" fw={600} mb={6} style={sectionLabelStyle}>
        Authors
      </Text>
      <Text style={panelTextStyle}>
        {paper.authors.length
          ? paper.authors.map((a) => a.name).join(", ")
          : "Unavailable"}
      </Text>
      {hasLinks && (
        <Group gap="sm" mt={6}>
          <ExtLink href={links.doi} label="DOI" />
          <ExtLink href={links.pubmed} label="PubMed" />
          <ExtLink href={links.pmc} label="PMC" />
        </Group>
      )}
      <div className="mt-2">
        <InlineStats
          items={[
            { label: "chunks", value: paper.chunkCount },
            { label: "refs", value: paper.referenceCount },
            { label: "pages", value: paper.pageCount },
            { label: "figs", value: paper.figureCount },
            { label: "tables", value: paper.tableCount },
          ]}
        />
      </div>
    </div>
  );
}

/* ─── Collapsible sections ────────────────────────────────────── */

const accordionStyles = {
  item: { borderBottom: "none" },
  control: {
    paddingLeft: 0,
    paddingRight: 0,
    paddingTop: 6,
    paddingBottom: 6,
    backgroundColor: "transparent",
  },
  label: { fontSize: "0.7rem", fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: "0.04em", color: "var(--graph-panel-text-muted)", transition: "color 150ms ease" },
  chevron: { color: "var(--graph-panel-text-muted)", width: 14, height: 14, transition: "color 150ms ease" },
  content: { paddingLeft: 0, paddingRight: 0, paddingBottom: 12 },
} as const;

function ClusterContent({ cluster }: { cluster: ClusterInfo | null }) {
  if (!cluster) {
    return (
      <Text style={panelTextDimStyle}>
        No cluster data available.
      </Text>
    );
  }
  return (
    <Stack gap="xs">
      <KV label="Members" value={cluster.memberCount != null ? formatNumber(cluster.memberCount) : "—"} />
      <KV label="Papers" value={cluster.paperCount != null ? formatNumber(cluster.paperCount) : "—"} />
      <KV label="Mean probability" value={cluster.meanClusterProbability != null ? cluster.meanClusterProbability.toFixed(3) : "—"} />
      <KV label="Label source" value={cluster.labelSource ?? "—"} />
    </Stack>
  );
}

function ExemplarsContent({ exemplars }: { exemplars: ClusterExemplar[] }) {
  if (exemplars.length === 0) {
    return (
      <Text style={panelTextDimStyle}>
        No related chunks available for this cluster.
      </Text>
    );
  }
  return (
    <Stack gap={0}>
      {exemplars.map((ex, i) => (
        <div
          key={`${ex.clusterId}:${ex.rank}:${ex.ragChunkId}`}
          style={{
            paddingTop: i === 0 ? 0 : 10,
            paddingBottom: 10,
            borderBottom: i < exemplars.length - 1 ? "1px solid var(--graph-panel-border)" : undefined,
          }}
        >
          <div className="flex items-center gap-2">
            <Text fw={600} style={panelTextDimStyle}>
              {ex.citekey ?? ex.paperTitle ?? "—"}
            </Text>
            {ex.isRepresentative && (
              <Badge size="xs" styles={badgeAccentStyles}>
                Primary
              </Badge>
            )}
          </div>
          <Text
            mt={4}
            style={panelTextStyle}
          >
            {ex.chunkPreview ?? "No preview available."}
          </Text>
          <Text mt={2} size="xs" style={panelTextDimStyle}>
            {[ex.sectionCanonical, ex.pageNumber != null ? `p. ${ex.pageNumber}` : null]
              .filter(Boolean)
              .join(" \u00b7 ")}
          </Text>
        </div>
      ))}
    </Stack>
  );
}

/* ─── Orchestrator ────────────────────────────────────────────── */

export function DetailPanel({ queries }: { queries: GraphBundleQueries }) {
  const selectedNode = useGraphStore((s) => s.selectedNode);
  const selectNode = useGraphStore((s) => s.selectNode);
  const [resolved, setResolved] = useState<{
    detail: GraphSelectionDetail | null;
    error: string | null;
    id: string | null;
  }>({ detail: null, error: null, id: null });

  useEffect(() => {
    if (!selectedNode) return;
    let cancelled = false;

    queries
      .getSelectionDetail(selectedNode)
      .then((d) => !cancelled && setResolved({ detail: d, error: null, id: selectedNode.id }))
      .catch((e: unknown) =>
        !cancelled &&
        setResolved({
          detail: null,
          error: e instanceof Error ? e.message : "Failed to load detail",
          id: selectedNode.id,
        })
      );

    return () => { cancelled = true; };
  }, [queries, selectedNode]);

  if (!selectedNode) return null;

  const isResolved = resolved.id === selectedNode.id;
  const detail = isResolved ? resolved.detail : null;
  const error = isResolved ? resolved.error : null;
  const loading = !isResolved;

  return (
    <PanelShell title="Selection" side="right" width={380} onClose={() => selectNode(null)}>
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        <Stack gap="lg">
          <DetailHeader node={selectedNode} paper={detail?.paper ?? null} />

          <div style={{ height: 1, backgroundColor: "var(--graph-panel-border)" }} />

          <ChunkSection
            node={selectedNode}
            chunk={detail?.chunk ?? null}
            loading={loading}
            error={error}
          />

          <PaperSection paper={detail?.paper ?? null} />

          <Accordion variant="default" className="detail-accordion" styles={accordionStyles}>
            <Accordion.Item value="cluster">
              <Accordion.Control>Cluster context</Accordion.Control>
              <Accordion.Panel>
                <ClusterContent cluster={detail?.cluster ?? null} />
              </Accordion.Panel>
            </Accordion.Item>

            <Accordion.Item value="exemplars">
              <Accordion.Control>Related chunks</Accordion.Control>
              <Accordion.Panel>
                <ExemplarsContent exemplars={detail?.exemplars ?? []} />
              </Accordion.Panel>
            </Accordion.Item>

            <Accordion.Item value="abstract">
              <Accordion.Control>Abstract</Accordion.Control>
              <Accordion.Panel>
                <Text
                  style={{ ...panelTextStyle, whiteSpace: "pre-wrap" }}
                >
                  {detail?.paper?.abstract ?? "No abstract available in the bundle."}
                </Text>
              </Accordion.Panel>
            </Accordion.Item>
          </Accordion>
        </Stack>
      </div>
    </PanelShell>
  );
}
