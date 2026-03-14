"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ActionIcon,
  Badge,
  Button,
  Group,
  Modal,
  Stack,
  Text,
} from "@mantine/core";
import { ArrowRight, ExternalLink, Maximize2 } from "lucide-react";
import type {
  ChunkNode,
  ClusterExemplar,
  ClusterInfo,
  GraphBundle,
  GraphNode,
  PaperNode,
} from "@/lib/graph/types";
import type {
  GraphDetailAsset,
  GraphDetailCitation,
  GraphDetailChunkEntity,
  GraphDetailChunkSummary,
  GraphDetailReference,
} from "@/lib/graph/detail-service";
import { refreshGraphAssetUrl } from "@/lib/graph/detail-service";
import { findChunkNodeByChunkId, findPaperNodeByPaperId } from "./helpers";
import {
  ExtLink,
  KV,
  RemoteStatus,
  panelTextDimStyle,
  panelTextStyle,
  sectionLabelStyle,
} from "./ui";

function getPaperRefMeta(paper: GraphDetailCitation["related_paper"] | null | undefined) {
  if (!paper) return "";
  return [paper.citekey, paper.journal, paper.year].filter(Boolean).join(" · ");
}

function getSignedAssetRefreshDelayMs(asset: GraphDetailAsset | null | undefined) {
  const access = asset?.access;
  if (!access || access.access_kind !== "signed" || !access.url) {
    return null;
  }

  const issuedAt = Date.parse(access.issued_at);
  const ttlSeconds = access.expires_in_seconds ?? null;
  if (!Number.isFinite(issuedAt) || ttlSeconds == null || ttlSeconds <= 0) {
    return null;
  }

  const refreshAtMs = issuedAt + Math.max(30, Math.floor(ttlSeconds * 0.8)) * 1000;
  return Math.max(0, refreshAtMs - Date.now());
}

function useRefreshedAsset({
  bundle,
  node,
  asset,
}: {
  bundle: GraphBundle;
  node: GraphNode;
  asset: GraphDetailAsset | null | undefined;
}) {
  const [resolvedAsset, setResolvedAsset] = useState<GraphDetailAsset | null | undefined>(asset);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    setResolvedAsset(asset);
    setRefreshError(null);
  }, [asset]);

  const refresh = useCallback(() => {
    if (!asset?.storage_path) return;

    setIsRefreshing(true);
    refreshGraphAssetUrl({ bundle, node, asset })
      .then((refreshed) => {
        setResolvedAsset((current) =>
          current
            ? {
                ...current,
                access: refreshed.access,
              }
            : current
        );
        setRefreshError(null);
      })
      .catch((error) => {
        setRefreshError(error instanceof Error ? error.message : "Failed to refresh asset access");
      })
      .finally(() => {
        setIsRefreshing(false);
      });
  }, [asset, bundle, node]);

  useEffect(() => {
    const delayMs = getSignedAssetRefreshDelayMs(resolvedAsset);
    if (delayMs == null) return;
    const timer = window.setTimeout(refresh, delayMs);
    return () => window.clearTimeout(timer);
  }, [refresh, resolvedAsset]);

  return {
    resolvedAsset,
    isRefreshing,
    refreshError,
    refresh,
  };
}

export function PdfContent({
  bundle,
  node,
  asset,
  loading,
  error,
}: {
  bundle: GraphBundle;
  node: GraphNode;
  asset: GraphDetailAsset | null | undefined;
  loading: boolean;
  error: string | null;
}) {
  const { resolvedAsset, isRefreshing, refreshError, refresh } = useRefreshedAsset({
    bundle,
    node,
    asset,
  });

  if (loading || error) {
    return <RemoteStatus loading={loading} error={error} label="Loading PDF access…" />;
  }

  const url = resolvedAsset?.access?.url;
  if (!url) {
    return <Text style={panelTextDimStyle}>No PDF available.</Text>;
  }

  return (
    <Stack gap="sm">
      <ExtLink href={url} label="Open PDF" />
      {isRefreshing && <Text style={panelTextDimStyle}>Refreshing PDF access…</Text>}
      {refreshError && <Text style={panelTextDimStyle}>{refreshError}</Text>}
      <div
        className="overflow-hidden rounded-xl"
        style={{
          border: "1px solid var(--graph-panel-border)",
          backgroundColor: "var(--graph-panel-surface)",
        }}
      >
        <iframe src={url} title="Paper PDF" className="h-[360px] w-full" onError={refresh} />
      </div>
    </Stack>
  );
}

function AssetCard({
  bundle,
  node,
  asset,
}: {
  bundle: GraphBundle;
  node: GraphNode;
  asset: GraphDetailAsset;
}) {
  const [previewOpened, setPreviewOpened] = useState(false);
  const { resolvedAsset, isRefreshing, refreshError, refresh } = useRefreshedAsset({
    bundle,
    node,
    asset,
  });

  if (!resolvedAsset) return null;

  const url = resolvedAsset.access?.url;
  const isPdf =
    resolvedAsset.asset_type === "pdf" || resolvedAsset.content_type?.includes("pdf");
  const isImage = Boolean(url) && !isPdf;
  const assetTitle = `${resolvedAsset.asset_type.charAt(0).toUpperCase() + resolvedAsset.asset_type.slice(1)}${
    resolvedAsset.page_number != null ? ` · p. ${resolvedAsset.page_number}` : ""
  }`;

  return (
    <>
      <div
        className="rounded-xl px-3 py-3"
        style={{
          backgroundColor: "var(--mode-accent-subtle)",
          border: "1px solid var(--mode-accent-border)",
        }}
      >
        <Group justify="space-between" align="flex-start" gap="sm">
          <div style={{ flex: 1 }}>
            <Text fw={600} style={panelTextStyle}>
              {assetTitle}
            </Text>
            {resolvedAsset.caption && (
              <Text mt={4} style={panelTextStyle}>
                {resolvedAsset.caption}
              </Text>
            )}
            {!resolvedAsset.caption && resolvedAsset.preview_text && (
              <Text mt={4} style={panelTextStyle}>
                {resolvedAsset.preview_text}
              </Text>
            )}
            {isRefreshing && <Text mt={4} style={panelTextDimStyle}>Refreshing asset access…</Text>}
            {refreshError && <Text mt={4} style={panelTextDimStyle}>{refreshError}</Text>}
          </div>
          <Group gap={6}>
            {isImage && (
              <ActionIcon
                variant="subtle"
                color="gray"
                size="sm"
                aria-label="Expand preview"
                onClick={() => setPreviewOpened(true)}
              >
                <Maximize2 size={14} />
              </ActionIcon>
            )}
            {url && (
              <ActionIcon
                component="a"
                href={url}
                target="_blank"
                rel="noreferrer"
                variant="subtle"
                color="gray"
                size="sm"
                aria-label="Open in new tab"
              >
                <ExternalLink size={14} />
              </ActionIcon>
            )}
          </Group>
        </Group>
        {isImage && (
          <button
            type="button"
            className="mt-3 block w-full rounded-lg"
            style={{ background: "transparent", border: "none", padding: 0, cursor: "zoom-in" }}
            onClick={() => setPreviewOpened(true)}
          >
            <img
              src={url ?? undefined}
              alt={resolvedAsset.caption ?? `${resolvedAsset.asset_type} asset`}
              className="max-h-[240px] w-full rounded-lg object-contain"
              onError={refresh}
            />
          </button>
        )}
      </div>
      {isImage && (
        <Modal opened={previewOpened} onClose={() => setPreviewOpened(false)} title={assetTitle} centered size="xl">
          <Stack gap="sm">
            <Group justify="flex-end">
              {url && (
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1"
                  style={{ color: "var(--mode-accent)", fontSize: 11 }}
                >
                  Open in new tab
                  <ExternalLink size={12} />
                </a>
              )}
            </Group>
            <img
              src={url ?? undefined}
              alt={resolvedAsset.caption ?? `${resolvedAsset.asset_type} asset`}
              className="max-h-[72vh] w-full rounded-lg object-contain"
              onError={refresh}
            />
            {resolvedAsset.caption && <Text style={panelTextStyle}>{resolvedAsset.caption}</Text>}
          </Stack>
        </Modal>
      )}
    </>
  );
}

export function AssetGalleryContent({
  bundle,
  node,
  assets,
  loading,
  error,
  emptyLabel,
}: {
  bundle: GraphBundle;
  node: GraphNode;
  assets: GraphDetailAsset[] | undefined;
  loading: boolean;
  error: string | null;
  emptyLabel: string;
}) {
  if (loading || error) {
    return <RemoteStatus loading={loading} error={error} label="Loading assets…" />;
  }
  if (!assets?.length) {
    return <Text style={panelTextDimStyle}>{emptyLabel}</Text>;
  }

  return (
    <Stack gap="md">
      {assets.map((asset) => (
        <AssetCard
          key={`${asset.asset_type}:${asset.asset_id ?? asset.storage_path}`}
          bundle={bundle}
          node={node}
          asset={asset}
        />
      ))}
    </Stack>
  );
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
          <Stack gap="md">
            {groupItems.map(({ citation, graphNode }) => {
              const paper = citation.related_paper;

              return (
                <div
                  key={`${groupLabel}:${citation.citation_id}`}
                  className="rounded-xl px-3 py-3"
                  style={{
                    backgroundColor: "var(--mode-accent-subtle)",
                    border: "1px solid var(--mode-accent-border)",
                  }}
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
        <Stack gap="lg">
          {renderCitationGroup(`${label} in graph`, grouped.inGraph)}
          {renderCitationGroup(`${label} outside graph`, grouped.outside)}
        </Stack>
      </div>
    );
  };

  return (
    <Stack gap="lg">
      {renderItems(outgoing, "Cites")}
      {renderItems(incoming, "Cited by")}
    </Stack>
  );
}

export function ChunkSummariesContent({
  chunks,
  chunkNodes,
  onNavigateToChunk,
  loading,
  error,
  emptyLabel,
}: {
  chunks: GraphDetailChunkSummary[] | undefined;
  chunkNodes: ChunkNode[];
  onNavigateToChunk: (node: ChunkNode) => void;
  loading: boolean;
  error: string | null;
  emptyLabel: string;
}) {
  if (loading || error) {
    return <RemoteStatus loading={loading} error={error} label="Loading related passages…" />;
  }
  if (!chunks?.length) {
    return <Text style={panelTextDimStyle}>{emptyLabel}</Text>;
  }

  return (
    <Stack gap="md">
      {chunks.map((chunk) => {
        const graphNode = findChunkNodeByChunkId(chunkNodes, chunk.chunk_id);
        return (
          <div
            key={chunk.chunk_id}
            className="rounded-xl px-3 py-3"
            style={{
              backgroundColor: "var(--mode-accent-subtle)",
              border: "1px solid var(--mode-accent-border)",
            }}
          >
            <Group justify="space-between" gap="sm" align="flex-start">
              <div style={{ flex: 1 }}>
                <Text fw={600} style={panelTextDimStyle}>
                  {[chunk.section_canonical, chunk.page_number != null ? `p. ${chunk.page_number}` : null]
                    .filter(Boolean)
                    .join(" · ") || `Chunk ${chunk.chunk_index}`}
                </Text>
                <Text mt={4} style={panelTextStyle}>
                  {chunk.preview}
                </Text>
              </div>
              {graphNode && (
                <Button
                  size="compact-xs"
                  variant="light"
                  leftSection={<ArrowRight size={12} />}
                  onClick={() => onNavigateToChunk(graphNode)}
                >
                  Open
                </Button>
              )}
            </Group>
          </div>
        );
      })}
    </Stack>
  );
}

export function EntitiesContent({
  entities,
  loading,
  error,
}: {
  entities: GraphDetailChunkEntity[] | undefined;
  loading: boolean;
  error: string | null;
}) {
  if (loading || error) {
    return <RemoteStatus loading={loading} error={error} label="Loading entities…" />;
  }
  if (!entities?.length) {
    return <Text style={panelTextDimStyle}>No entities available.</Text>;
  }

  return (
    <Stack gap="md">
      {entities.map((entity) => (
        <div
          key={entity.entity_id}
          className="rounded-xl px-3 py-3"
          style={{
            backgroundColor: "var(--mode-accent-subtle)",
            border: "1px solid var(--mode-accent-border)",
          }}
        >
          <Group gap={6} mb={6}>
            <Badge size="xs" variant="outline" color="gray">
              {entity.label}
            </Badge>
            {entity.is_negated && (
              <Badge size="xs" color="red" variant="light">
                Negated
              </Badge>
            )}
            {entity.temporal_status && (
              <Badge size="xs" variant="light" color="gray">
                {entity.temporal_status}
              </Badge>
            )}
          </Group>
          <Text fw={600} style={panelTextStyle}>
            {entity.text}
          </Text>
          <Text mt={4} style={panelTextDimStyle}>
            {[entity.umls_cui, entity.rxnorm_cui, entity.semantic_types[0] ?? null]
              .filter(Boolean)
              .join(" · ")}
          </Text>
        </div>
      ))}
    </Stack>
  );
}

export function ClusterContent({ cluster }: { cluster: ClusterInfo | null }) {
  if (!cluster) {
    return <Text style={panelTextDimStyle}>No cluster data available.</Text>;
  }

  return (
    <Stack gap="xs">
      <KV label="Members" value={String(cluster.memberCount ?? "—")} />
      <KV label="Papers" value={String(cluster.paperCount ?? "—")} />
      <KV
        label="Mean probability"
        value={cluster.meanClusterProbability != null ? cluster.meanClusterProbability.toFixed(3) : "—"}
      />
      <KV label="Label source" value={cluster.labelSource ?? "—"} />
    </Stack>
  );
}

export function ExemplarsContent({
  exemplars,
  chunkNodes,
  onNavigateToChunk,
}: {
  exemplars: ClusterExemplar[];
  chunkNodes: ChunkNode[];
  onNavigateToChunk: (node: ChunkNode) => void;
}) {
  if (exemplars.length === 0) {
    return <Text style={panelTextDimStyle}>No related chunks available for this cluster.</Text>;
  }

  return (
    <Stack gap="md">
      {exemplars.map((exemplar) => {
        const graphNode = findChunkNodeByChunkId(chunkNodes, exemplar.ragChunkId);
        return (
          <div
            key={`${exemplar.clusterId}:${exemplar.rank}:${exemplar.ragChunkId}`}
            className="rounded-xl px-3 py-3"
            style={{
              backgroundColor: "var(--mode-accent-subtle)",
              border: "1px solid var(--mode-accent-border)",
            }}
          >
            <Group justify="space-between" gap="sm" align="flex-start">
              <div style={{ flex: 1 }}>
                <Group gap={6} mb={6}>
                  {exemplar.isRepresentative && (
                    <Badge size="xs" color="green" variant="light">
                      Primary
                    </Badge>
                  )}
                  {(exemplar.sectionCanonical || exemplar.pageNumber != null) && (
                    <Badge size="xs" variant="outline" color="gray">
                      {[exemplar.sectionCanonical, exemplar.pageNumber != null ? `p. ${exemplar.pageNumber}` : null]
                        .filter(Boolean)
                        .join(" · ")}
                    </Badge>
                  )}
                </Group>
                <Text fw={600} style={panelTextDimStyle}>
                  {exemplar.citekey ?? exemplar.paperTitle ?? "—"}
                </Text>
                <Text mt={4} style={panelTextStyle}>
                  {exemplar.chunkPreview ?? "No preview available."}
                </Text>
              </div>
              {graphNode && (
                <Button
                  size="compact-xs"
                  variant="light"
                  leftSection={<ArrowRight size={12} />}
                  onClick={() => onNavigateToChunk(graphNode)}
                >
                  Open
                </Button>
              )}
            </Group>
          </div>
        );
      })}
    </Stack>
  );
}
