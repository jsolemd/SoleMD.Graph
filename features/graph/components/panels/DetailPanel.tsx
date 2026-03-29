"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Accordion, Stack, Text } from "@mantine/core";
import { useDashboardStore, useGraphStore } from "@/features/graph/stores";
import {
  fetchGraphNodeDetail,
  supportsRemoteGraphNodeDetail,
} from "@/features/graph/lib/detail-service";
import type { GraphNodeDetailResponsePayload } from "@/features/graph/types";
import type {
  AuthorGeoRow,
  ChunkNode,
  GeoNode,
  GraphBundle,
  GraphBundleQueries,
  GraphData,
  GraphSelectionDetail,
  PaperNode,
} from "@/features/graph/types";
import { PanelShell } from "./PanelShell";
import {
  buildCorpusNodeNoteMarkdown,
  buildChunkNoteMarkdown,
  buildPaperNoteMarkdown,
} from "./detail/helpers";
import {
  AliasSection,
  ChunkSection,
  DetailHeader,
  InstitutionSection,
  PaperDocumentSection,
  PaperSection,
  RelationAssertionSection,
  SelectionActionBar,
  TermSection,
} from "./detail/primary";
import { GeoAggregateSection } from "./detail/GeoAggregateSection";
import { AuthorDetailSection } from "./detail/AuthorDetailSection";
import {
  AssetGalleryContent,
  ChunkSummariesContent,
  ClusterContent,
  ConnectionsContent,
  EntitiesContent,
  ExemplarsContent,
  PdfContent,
  ReferencesContent,
} from "./detail/remote";
import { accordionStyles, panelTextStyle } from "./detail/ui";

function useCopyFeedback(selectedNodeId: string | null) {
  const [copyState, setCopyState] = useState<{
    nodeId: string | null;
    status: "idle" | "copied" | "failed";
  }>({ nodeId: selectedNodeId, status: "idle" });

  const setCopied = useCallback((state: "copied" | "failed") => {
    setCopyState({ nodeId: selectedNodeId, status: state });
    window.setTimeout(() => {
      setCopyState((current) =>
        current.nodeId === selectedNodeId ? { nodeId: selectedNodeId, status: "idle" } : current
      );
    }, 1800);
  }, [selectedNodeId]);

  const effectiveState = copyState.nodeId === selectedNodeId ? copyState.status : "idle";

  const copyLabel =
    effectiveState === "copied" ? "Copied" : effectiveState === "failed" ? "Copy failed" : "Copy note";

  return { copyLabel, setCopied };
}

export function DetailPanel({
  bundle,
  queries,
  data,
}: {
  bundle: GraphBundle;
  queries: GraphBundleQueries;
  data: GraphData;
}) {
  const selectedNode = useGraphStore((state) => state.selectedNode);
  const selectNode = useGraphStore((state) => state.selectNode);
  const setMode = useGraphStore((state) => state.setMode);
  const setActiveLayer = useDashboardStore((state) => state.setActiveLayer);
  const geoSelection = useDashboardStore((state) => state.geoSelection);
  const setGeoSelection = useDashboardStore((state) => state.setGeoSelection);
  const setSelectedPointIndices = useDashboardStore((state) => state.setSelectedPointIndices);

  // Author drill-down state
  const [authorSelection, setAuthorSelection] = useState<{
    name: string;
    orcid: string | null;
    rows: AuthorGeoRow[];
    loading: boolean;
  } | null>(null);

  const closePanel = useCallback(() => {
    selectNode(null);
    setAuthorSelection(null);
  }, [selectNode]);

  const [resolved, setResolved] = useState<{
    detail: GraphSelectionDetail | null;
    error: string | null;
    id: string | null;
  }>({ detail: null, error: null, id: null });
  const [hydrated, setHydrated] = useState<{
    detail: GraphNodeDetailResponsePayload | null;
    error: string | null;
    id: string | null;
  }>({ detail: null, error: null, id: null });
  const [relatedPaperNodeMap, setRelatedPaperNodeMap] = useState<Record<string, PaperNode>>({});
  const [relatedChunkNodeMap, setRelatedChunkNodeMap] = useState<Record<string, ChunkNode>>({});
  const supportsRemoteDetail = selectedNode ? supportsRemoteGraphNodeDetail(selectedNode) : false;

  useEffect(() => {
    if (!selectedNode) return;
    let cancelled = false;

    queries
      .getSelectionDetail(selectedNode)
      .then((detail) => {
        if (!cancelled) {
          setResolved({ detail, error: null, id: selectedNode.id });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setResolved({
            detail: null,
            error: error instanceof Error ? error.message : "Failed to load detail",
            id: selectedNode.id,
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [queries, selectedNode]);

  useEffect(() => {
    if (!selectedNode || !supportsRemoteDetail) return;
    let cancelled = false;

    fetchGraphNodeDetail({ bundle, node: selectedNode })
      .then((detail) => {
        if (!cancelled) {
          setHydrated({ detail, error: null, id: selectedNode.id });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setHydrated({
            detail: null,
            error: error instanceof Error ? error.message : "Failed to hydrate graph detail",
            id: selectedNode.id,
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [bundle, selectedNode, supportsRemoteDetail]);

  const { copyLabel, setCopied } = useCopyFeedback(selectedNode?.id ?? null);

  const navigateToPaperNode = useCallback(
    (paperNode: PaperNode) => {
      setActiveLayer("paper");
      window.requestAnimationFrame(() => selectNode(paperNode));
    },
    [selectNode, setActiveLayer]
  );

  const navigateToChunkNode = useCallback(
    (chunkNode: ChunkNode) => {
      setActiveLayer("chunk");
      window.requestAnimationFrame(() => selectNode(chunkNode));
    },
    [selectNode, setActiveLayer]
  );

  const handleSelectAuthor = useCallback(
    (author: { name: string; orcid: string | null }) => {
      setAuthorSelection({ name: author.name, orcid: author.orcid, rows: [], loading: true });
      queries
        .getAuthorInstitutions(author.name, author.orcid)
        .then((rows) => {
          setAuthorSelection((prev) =>
            prev && prev.name === author.name ? { ...prev, rows, loading: false } : prev
          );
          // Highlight all the author's institutions on the map
          const institutionKeys = new Set(rows.map((r) => r.institutionKey).filter(Boolean));
          const indices = data.geoNodes
            .filter((n) => institutionKeys.has(n.id))
            .map((n) => n.index);
          if (indices.length > 0) setSelectedPointIndices(indices);
        })
        .catch(() => {
          setAuthorSelection((prev) =>
            prev && prev.name === author.name ? { ...prev, loading: false } : prev
          );
        });
    },
    [queries, data.geoNodes, setSelectedPointIndices]
  );

  const handleAuthorBack = useCallback(() => {
    setAuthorSelection(null);
    // Restore single-institution selection if we still have a selected node
    if (selectedNode && selectedNode.nodeKind === "institution") {
      setSelectedPointIndices([selectedNode.index]);
    }
  }, [selectedNode, setSelectedPointIndices]);

  const handleAuthorSelectInstitution = useCallback(
    (node: GeoNode) => {
      setAuthorSelection(null);
      selectNode(node);
      setSelectedPointIndices([node.index]);
    },
    [selectNode, setSelectedPointIndices]
  );

  const handleAsk = useCallback(() => {
    setMode("ask");
  }, [setMode]);

  const localPaperNodeMap = useMemo(
    () =>
      Object.fromEntries(
        data.paperNodes
          .filter((node): node is PaperNode & { paperId: string } => Boolean(node.paperId))
          .map((node) => [node.paperId, node])
      ),
    [data.paperNodes]
  );

  const localChunkNodeMap = useMemo(
    () =>
      Object.fromEntries(
        data.nodes
          .filter((node): node is ChunkNode => node.nodeKind === "chunk")
          .flatMap((node) =>
            node.stableChunkId ? [[node.id, node], [node.stableChunkId, node]] : [[node.id, node]]
          )
      ),
    [data.nodes]
  );

  useEffect(() => {
    const paperIds = new Set<string>();
    const chunkIds = new Set<string>();

    if (selectedNode?.paperId) {
      paperIds.add(selectedNode.paperId);
    }

    for (const citation of hydrated.detail?.paper?.incoming_citations ?? []) {
      if (citation.related_paper_id) {
        paperIds.add(citation.related_paper_id);
      }
    }

    for (const citation of hydrated.detail?.paper?.outgoing_citations ?? []) {
      if (citation.related_paper_id) {
        paperIds.add(citation.related_paper_id);
      }
    }

    for (const reference of hydrated.detail?.paper?.references ?? []) {
      const paperId = reference.resolved_paper_id ?? reference.resolved_paper?.paper_id ?? null;
      if (paperId) {
        paperIds.add(paperId);
      }
    }

    for (const chunk of hydrated.detail?.paper?.narrative_chunks ?? []) {
      if (chunk.chunk_id) {
        chunkIds.add(chunk.chunk_id);
      }
    }

    for (const chunk of hydrated.detail?.chunk?.neighboring_chunks ?? []) {
      if (chunk.chunk_id) {
        chunkIds.add(chunk.chunk_id);
      }
    }

    for (const exemplar of resolved.detail?.exemplars ?? []) {
      if (exemplar.ragChunkId) {
        chunkIds.add(exemplar.ragChunkId);
      }
    }

    const missingPaperIds = [...paperIds].filter((paperId) => !(paperId in localPaperNodeMap));
    const missingChunkIds = [...chunkIds].filter((chunkId) => !(chunkId in localChunkNodeMap));

    if (missingPaperIds.length === 0 && missingChunkIds.length === 0) {
      return;
    }

    let cancelled = false;

    Promise.all([
      missingPaperIds.length > 0 ? queries.getPaperNodesByPaperIds(missingPaperIds) : Promise.resolve({}),
      missingChunkIds.length > 0 ? queries.getChunkNodesByChunkIds(missingChunkIds) : Promise.resolve({}),
    ])
      .then(([paperNodes, chunkNodes]) => {
        if (cancelled) {
          return;
        }
        setRelatedPaperNodeMap(paperNodes);
        setRelatedChunkNodeMap(chunkNodes);
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        setRelatedPaperNodeMap({});
        setRelatedChunkNodeMap({});
      });

    return () => {
      cancelled = true;
    };
  }, [hydrated.detail, localChunkNodeMap, localPaperNodeMap, queries, resolved.detail?.exemplars, selectedNode?.paperId]);

  const paperNodes = useMemo(
    () => Object.values({ ...localPaperNodeMap, ...relatedPaperNodeMap }),
    [localPaperNodeMap, relatedPaperNodeMap]
  );

  const chunkNodes = useMemo(
    () =>
      Object.values({ ...localChunkNodeMap, ...relatedChunkNodeMap }).filter(
        (node, index, allNodes) => allNodes.findIndex((candidate) => candidate.id === node.id) === index
      ),
    [localChunkNodeMap, relatedChunkNodeMap]
  );

  const handleCopyNote = useCallback(async () => {
    if (!selectedNode) return;

    const markdown =
      selectedNode.nodeKind === "paper"
        ? buildPaperNoteMarkdown({
            nodeDisplayPreview: selectedNode.displayPreview,
            paper: resolved.detail?.paper ?? null,
            paperDocument: resolved.detail?.paperDocument ?? null,
            servicePaper: hydrated.detail?.paper ?? null,
          })
        : selectedNode.nodeKind === "institution"
          ? (() => {
              const geo = selectedNode as GeoNode;
              return `# ${geo.institution ?? "Institution"}\n\n${geo.city ?? ""}, ${geo.country ?? ""}`;
            })()
          : selectedNode.nodeKind === "chunk"
            ? buildChunkNoteMarkdown({
              node: selectedNode as ChunkNode,
              chunk: resolved.detail?.chunk ?? null,
              serviceChunk: hydrated.detail?.chunk ?? null,
              })
            : buildCorpusNodeNoteMarkdown(selectedNode);

    try {
      await navigator.clipboard.writeText(markdown);
      setCopied("copied");
    } catch {
      setCopied("failed");
    }
  }, [hydrated.detail, resolved.detail, selectedNode, setCopied]);

  // Geo aggregate panel — shown when choropleth is clicked but no node is selected
  if (!selectedNode && geoSelection) {
    return (
      <PanelShell title="Selection" side="right" width={380} onClose={() => setGeoSelection(null)}>
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          <GeoAggregateSection
            geoSelection={geoSelection}
            geoNodes={data.geoNodes}
            geoLinks={data.geoLinks}
          />
        </div>
      </PanelShell>
    );
  }

  if (!selectedNode) return null;

  const isResolved = resolved.id === selectedNode.id;
  const detail = isResolved ? resolved.detail : null;
  const error = isResolved ? resolved.error : null;
  const loading = !isResolved;
  const isHydrated = !supportsRemoteDetail || hydrated.id === selectedNode.id;
  const serviceDetail = supportsRemoteDetail && hydrated.id === selectedNode.id ? hydrated.detail : null;
  const serviceError = supportsRemoteDetail && hydrated.id === selectedNode.id ? hydrated.error : null;
  const serviceLoading = supportsRemoteDetail ? !isHydrated : false;
  const isPaper = selectedNode.nodeKind === "paper";
  const isGeo = selectedNode.nodeKind === "institution";
  const isChunk = selectedNode.nodeKind === "chunk";
  const isTerm = selectedNode.nodeKind === "term";
  const isAlias = selectedNode.nodeKind === "alias";
  const isRelationAssertion = selectedNode.nodeKind === "relation_assertion";

  const sourcePaperNode = selectedNode.paperId
    ? paperNodes.find(
        (node) => node.paperId === selectedNode.paperId || node.id === selectedNode.paperId
      ) ?? null
    : null;

  const actionPdfUrl = isPaper
    ? serviceDetail?.paper?.pdf_asset?.access?.url ?? null
    : serviceDetail?.chunk?.paper_pdf_asset?.access?.url ?? null;

  return (
    <PanelShell title="Selection" side="right" width={380} onClose={closePanel}>
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        <Stack gap="lg">
          <DetailHeader node={selectedNode} paper={detail?.paper ?? null} />

          <SelectionActionBar
            onCopyNote={handleCopyNote}
            onAsk={handleAsk}
            pdfUrl={actionPdfUrl}
            copyLabel={copyLabel}
            onOpenGraphPaper={!isPaper && sourcePaperNode ? () => navigateToPaperNode(sourcePaperNode) : null}
            openGraphPaperLabel="Open paper"
          />

          <div style={{ height: 1, backgroundColor: "var(--graph-panel-border)" }} />

          {isGeo && authorSelection ? (
            <AuthorDetailSection
              authorName={authorSelection.name}
              orcid={authorSelection.orcid}
              rows={authorSelection.rows}
              loading={authorSelection.loading}
              geoNodes={data.geoNodes}
              onBack={handleAuthorBack}
              onSelectInstitution={handleAuthorSelectInstitution}
            />
          ) : isGeo ? (
            <InstitutionSection node={selectedNode} queries={queries} onSelectAuthor={handleSelectAuthor} />
          ) : isPaper ? (
            <PaperDocumentSection
              nodeDisplayPreview={selectedNode.displayPreview}
              paper={serviceDetail?.paper ?? detail?.paper ?? null}
              paperDocument={detail?.paperDocument ?? null}
              loading={loading}
              error={error}
            />
          ) : isTerm ? (
            <TermSection node={selectedNode} />
          ) : isAlias ? (
            <AliasSection node={selectedNode} />
          ) : isRelationAssertion ? (
            <RelationAssertionSection node={selectedNode} />
          ) : (
            <ChunkSection
              node={selectedNode}
              chunk={detail?.chunk ?? null}
              loading={loading}
              error={error}
            />
          )}

          {!isGeo && <PaperSection paper={detail?.paper ?? null} servicePaper={serviceDetail?.paper ?? null} />}

          <Accordion variant="default" className="detail-accordion" styles={accordionStyles}>
            {isPaper && (
              <Accordion.Item value="visuals">
                <Accordion.Control>Visuals</Accordion.Control>
                <Accordion.Panel>
                  <AssetGalleryContent
                    bundle={bundle}
                    node={selectedNode}
                    assets={serviceDetail?.paper?.assets}
                    loading={serviceLoading}
                    error={serviceError}
                    emptyLabel="No figure or table assets available."
                  />
                </Accordion.Panel>
              </Accordion.Item>
            )}

            {isPaper && (
              <Accordion.Item value="pdf">
                <Accordion.Control>PDF</Accordion.Control>
                <Accordion.Panel>
                  <PdfContent
                    bundle={bundle}
                    node={selectedNode}
                    asset={serviceDetail?.paper?.pdf_asset}
                    loading={serviceLoading}
                    error={serviceError}
                  />
                </Accordion.Panel>
              </Accordion.Item>
            )}

            {isPaper && (
              <Accordion.Item value="key-passages">
                <Accordion.Control>Key passages</Accordion.Control>
                <Accordion.Panel>
                  <ChunkSummariesContent
                    chunks={serviceDetail?.paper?.narrative_chunks}
                    chunkNodes={chunkNodes}
                    onNavigateToChunk={navigateToChunkNode}
                    loading={serviceLoading}
                    error={serviceError}
                    emptyLabel="No key passages available."
                  />
                </Accordion.Panel>
              </Accordion.Item>
            )}

            {isPaper && (
              <Accordion.Item value="connections">
                <Accordion.Control>Connections</Accordion.Control>
                <Accordion.Panel>
                  <ConnectionsContent
                    incoming={serviceDetail?.paper?.incoming_citations}
                    outgoing={serviceDetail?.paper?.outgoing_citations}
                    paperNodes={paperNodes}
                    onNavigateToPaper={navigateToPaperNode}
                    loading={serviceLoading}
                    error={serviceError}
                  />
                </Accordion.Panel>
              </Accordion.Item>
            )}

            {isPaper && (
              <Accordion.Item value="bibliography">
                <Accordion.Control>Bibliography</Accordion.Control>
                <Accordion.Panel>
                  <ReferencesContent
                    references={serviceDetail?.paper?.references}
                    paperNodes={paperNodes}
                    onNavigateToPaper={navigateToPaperNode}
                    loading={serviceLoading}
                    error={serviceError}
                  />
                </Accordion.Panel>
              </Accordion.Item>
            )}

            {isChunk && (
              <Accordion.Item value="page-assets">
                <Accordion.Control>Visuals</Accordion.Control>
                <Accordion.Panel>
                  <AssetGalleryContent
                    bundle={bundle}
                    node={selectedNode}
                    assets={serviceDetail?.chunk?.page_assets}
                    loading={serviceLoading}
                    error={serviceError}
                    emptyLabel="No page assets available."
                  />
                </Accordion.Panel>
              </Accordion.Item>
            )}

            {isChunk && (
              <Accordion.Item value="source-pdf">
                <Accordion.Control>Source PDF</Accordion.Control>
                <Accordion.Panel>
                  <PdfContent
                    bundle={bundle}
                    node={selectedNode}
                    asset={serviceDetail?.chunk?.paper_pdf_asset}
                    loading={serviceLoading}
                    error={serviceError}
                  />
                </Accordion.Panel>
              </Accordion.Item>
            )}

            {isChunk && (
              <Accordion.Item value="entities">
                <Accordion.Control>Entities</Accordion.Control>
                <Accordion.Panel>
                  <EntitiesContent
                    entities={serviceDetail?.chunk?.entities}
                    loading={serviceLoading}
                    error={serviceError}
                  />
                </Accordion.Panel>
              </Accordion.Item>
            )}

            {isChunk && (
              <Accordion.Item value="neighboring-chunks">
                <Accordion.Control>Neighboring chunks</Accordion.Control>
                <Accordion.Panel>
                  <ChunkSummariesContent
                    chunks={serviceDetail?.chunk?.neighboring_chunks}
                    chunkNodes={chunkNodes}
                    onNavigateToChunk={navigateToChunkNode}
                    loading={serviceLoading}
                    error={serviceError}
                    emptyLabel="No neighboring chunks available."
                  />
                </Accordion.Panel>
              </Accordion.Item>
            )}

            {!isGeo && (
              <>
                <Accordion.Item value="cluster">
                  <Accordion.Control>Cluster context</Accordion.Control>
                  <Accordion.Panel>
                    <ClusterContent cluster={detail?.cluster ?? null} />
                  </Accordion.Panel>
                </Accordion.Item>

                <Accordion.Item value="exemplars">
                  <Accordion.Control>{isPaper ? "Cluster exemplars" : "Related chunks"}</Accordion.Control>
                  <Accordion.Panel>
                    <ExemplarsContent
                      exemplars={detail?.exemplars ?? []}
                      chunkNodes={chunkNodes}
                      onNavigateToChunk={navigateToChunkNode}
                    />
                  </Accordion.Panel>
                </Accordion.Item>
              </>
            )}

            {isPaper && (
              <Accordion.Item value="abstract">
                <Accordion.Control>Abstract</Accordion.Control>
                <Accordion.Panel>
                  <Text style={{ ...panelTextStyle, whiteSpace: "pre-wrap" }}>
                    {serviceDetail?.paper?.abstract ?? detail?.paper?.abstract ?? "No abstract available."}
                  </Text>
                </Accordion.Panel>
              </Accordion.Item>
            )}
          </Accordion>
        </Stack>
      </div>
    </PanelShell>
  );
}
