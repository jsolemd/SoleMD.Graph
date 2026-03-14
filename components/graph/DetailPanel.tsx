"use client";

import { useCallback, useEffect, useState } from "react";
import { Accordion, Stack, Text } from "@mantine/core";
import { useDashboardStore, useGraphStore } from "@/lib/graph/stores";
import { fetchGraphNodeDetail, type GraphNodeDetailResponsePayload } from "@/lib/graph/detail-service";
import type {
  GraphBundle,
  GraphBundleQueries,
  GraphData,
  GraphSelectionDetail,
} from "@/lib/graph/types";
import { PanelShell } from "./PanelShell";
import {
  buildChunkNoteMarkdown,
  buildPaperNoteMarkdown,
  findPaperNodeByPaperId,
} from "./detail-panel/helpers";
import {
  ChunkSection,
  DetailHeader,
  InstitutionSection,
  PaperDocumentSection,
  PaperSection,
  SelectionActionBar,
} from "./detail-panel/primary";
import {
  AssetGalleryContent,
  ChunkSummariesContent,
  ClusterContent,
  ConnectionsContent,
  EntitiesContent,
  ExemplarsContent,
  PdfContent,
  ReferencesContent,
} from "./detail-panel/remote";
import { panelTextStyle } from "./detail-panel/ui";

const accordionStyles = {
  item: { borderBottom: "none" },
  control: {
    paddingLeft: 0,
    paddingRight: 0,
    paddingTop: 6,
    paddingBottom: 6,
    backgroundColor: "transparent",
  },
  label: {
    fontSize: "0.7rem",
    fontWeight: 600,
    textTransform: "uppercase" as const,
    letterSpacing: "0.04em",
    color: "var(--graph-panel-text-muted)",
    transition: "color 150ms ease",
  },
  chevron: {
    color: "var(--graph-panel-text-muted)",
    width: 14,
    height: 14,
    transition: "color 150ms ease",
  },
  content: { paddingLeft: 0, paddingRight: 0, paddingBottom: 12 },
} as const;

function useCopyFeedback(selectedNodeId: string | null) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => {
    setCopyState("idle");
  }, [selectedNodeId]);

  const setCopied = useCallback((state: "copied" | "failed") => {
    setCopyState(state);
    window.setTimeout(() => setCopyState("idle"), 1800);
  }, []);

  const copyLabel =
    copyState === "copied" ? "Copied" : copyState === "failed" ? "Copy failed" : "Copy note";

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

  const closePanel = useCallback(() => {
    selectNode(null);
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
    if (!selectedNode) return;
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
  }, [bundle, selectedNode]);

  const { copyLabel, setCopied } = useCopyFeedback(selectedNode?.id ?? null);

  const navigateToPaperNode = useCallback(
    (paperNode: (typeof data.paperNodes)[number]) => {
      setActiveLayer("paper");
      window.requestAnimationFrame(() => selectNode(paperNode));
    },
    [selectNode, setActiveLayer, data.paperNodes]
  );

  const navigateToChunkNode = useCallback(
    (chunkNode: (typeof data.nodes)[number]) => {
      setActiveLayer("chunk");
      window.requestAnimationFrame(() => selectNode(chunkNode));
    },
    [selectNode, setActiveLayer, data.nodes]
  );

  const handleAsk = useCallback(() => {
    setMode("ask");
  }, [setMode]);

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
          ? `# ${(selectedNode as import("@/lib/graph/types").GeoNode).institution ?? "Institution"}\n\n${(selectedNode as import("@/lib/graph/types").GeoNode).city ?? ""}, ${(selectedNode as import("@/lib/graph/types").GeoNode).country ?? ""}`
          : buildChunkNoteMarkdown({
              node: selectedNode as import("@/lib/graph/types").ChunkNode,
              chunk: resolved.detail?.chunk ?? null,
              serviceChunk: hydrated.detail?.chunk ?? null,
            });

    try {
      await navigator.clipboard.writeText(markdown);
      setCopied("copied");
    } catch {
      setCopied("failed");
    }
  }, [hydrated.detail, resolved.detail, selectedNode, setCopied]);

  if (!selectedNode) return null;

  const isResolved = resolved.id === selectedNode.id;
  const detail = isResolved ? resolved.detail : null;
  const error = isResolved ? resolved.error : null;
  const loading = !isResolved;
  const isHydrated = hydrated.id === selectedNode.id;
  const serviceDetail = isHydrated ? hydrated.detail : null;
  const serviceError = isHydrated ? hydrated.error : null;
  const serviceLoading = !isHydrated;
  const isPaper = selectedNode.nodeKind === "paper";
  const isGeo = selectedNode.nodeKind === "institution";

  const sourcePaperNode = findPaperNodeByPaperId(data.paperNodes, selectedNode.paperId);

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

          {isGeo ? (
            <InstitutionSection node={selectedNode} />
          ) : isPaper ? (
            <PaperDocumentSection
              nodeDisplayPreview={selectedNode.displayPreview}
              paper={serviceDetail?.paper ?? detail?.paper ?? null}
              paperDocument={detail?.paperDocument ?? null}
              loading={loading}
              error={error}
            />
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
                    chunkNodes={data.nodes}
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
                    paperNodes={data.paperNodes}
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
                    paperNodes={data.paperNodes}
                    onNavigateToPaper={navigateToPaperNode}
                    loading={serviceLoading}
                    error={serviceError}
                  />
                </Accordion.Panel>
              </Accordion.Item>
            )}

            {!isPaper && (
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

            {!isPaper && (
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

            {!isPaper && (
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

            {!isPaper && (
              <Accordion.Item value="neighboring-chunks">
                <Accordion.Control>Neighboring chunks</Accordion.Control>
                <Accordion.Panel>
                  <ChunkSummariesContent
                    chunks={serviceDetail?.chunk?.neighboring_chunks}
                    chunkNodes={data.nodes}
                    onNavigateToChunk={navigateToChunkNode}
                    loading={serviceLoading}
                    error={serviceError}
                    emptyLabel="No neighboring chunks available."
                  />
                </Accordion.Panel>
              </Accordion.Item>
            )}

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
                  chunkNodes={data.nodes}
                  onNavigateToChunk={navigateToChunkNode}
                />
              </Accordion.Panel>
            </Accordion.Item>

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
