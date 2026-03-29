"use client";

import { useCallback, useState } from "react";
import { Stack } from "@mantine/core";
import { useDashboardStore, useGraphStore } from "@/features/graph/stores";
import type {
  AuthorGeoRow,
  ChunkNode,
  GeoNode,
  GraphBundle,
  GraphBundleQueries,
  GraphData,
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
import { DetailAccordions } from "./detail/DetailAccordions";
import { useCopyFeedback } from "./detail/use-copy-feedback";
import { useDetailData } from "./detail/use-detail-data";

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

  const {
    detail,
    error,
    loading,
    serviceDetail,
    serviceError,
    serviceLoading,
    paperNodes,
    chunkNodes,
  } = useDetailData({ bundle, queries, data, selectedNode });

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

  const handleCopyNote = useCallback(async () => {
    if (!selectedNode) return;

    const markdown =
      selectedNode.nodeKind === "paper"
        ? buildPaperNoteMarkdown({
            nodeDisplayPreview: selectedNode.displayPreview,
            paper: detail?.paper ?? null,
            paperDocument: detail?.paperDocument ?? null,
            servicePaper: serviceDetail?.paper ?? null,
          })
        : selectedNode.nodeKind === "institution"
          ? (() => {
              const geo = selectedNode as GeoNode;
              return `# ${geo.institution ?? "Institution"}\n\n${geo.city ?? ""}, ${geo.country ?? ""}`;
            })()
          : selectedNode.nodeKind === "chunk"
            ? buildChunkNoteMarkdown({
              node: selectedNode as ChunkNode,
              chunk: detail?.chunk ?? null,
              serviceChunk: serviceDetail?.chunk ?? null,
              })
            : buildCorpusNodeNoteMarkdown(selectedNode);

    try {
      await navigator.clipboard.writeText(markdown);
      setCopied("copied");
    } catch {
      setCopied("failed");
    }
  }, [detail, serviceDetail, selectedNode, setCopied]);

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

          <DetailAccordions
            bundle={bundle}
            selectedNode={selectedNode}
            detail={detail}
            serviceDetail={serviceDetail}
            serviceError={serviceError}
            serviceLoading={serviceLoading}
            paperNodes={paperNodes}
            chunkNodes={chunkNodes}
            navigateToPaperNode={navigateToPaperNode}
            navigateToChunkNode={navigateToChunkNode}
          />
        </Stack>
      </div>
    </PanelShell>
  );
}
