"use client";

import { Accordion, Text } from "@mantine/core";
import type {
  ChunkNode,
  GraphBundle,
  GraphNode,
  GraphSelectionDetail,
  PaperNode,
  GraphNodeDetailResponsePayload,
} from "@/features/graph/types";
import {
  AssetGalleryContent,
  ChunkSummariesContent,
  ClusterContent,
  ConnectionsContent,
  EntitiesContent,
  ExemplarsContent,
  PdfContent,
  ReferencesContent,
} from "./remote";
import { accordionStyles, panelTextStyle } from "./ui";

export function DetailAccordions({
  bundle,
  selectedNode,
  detail,
  serviceDetail,
  serviceError,
  serviceLoading,
  paperNodes,
  chunkNodes,
  navigateToPaperNode,
  navigateToChunkNode,
}: {
  bundle: GraphBundle;
  selectedNode: GraphNode;
  detail: GraphSelectionDetail | null;
  serviceDetail: GraphNodeDetailResponsePayload | null;
  serviceError: string | null;
  serviceLoading: boolean;
  paperNodes: PaperNode[];
  chunkNodes: ChunkNode[];
  navigateToPaperNode: (node: PaperNode) => void;
  navigateToChunkNode: (node: ChunkNode) => void;
}) {
  const isPaper = selectedNode.nodeKind === "paper";
  const isGeo = selectedNode.nodeKind === "institution";
  const isChunk = selectedNode.nodeKind === "chunk";

  return (
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
  );
}
