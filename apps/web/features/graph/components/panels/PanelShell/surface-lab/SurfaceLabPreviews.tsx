"use client";

import { useState } from "react";
import { Badge, Code, Group, Stack, Table, Text } from "@mantine/core";
import {
  BookOpenText,
  Orbit,
  Search,
} from "lucide-react";
import { PanelChrome } from "../../PanelChrome";
import { PromptChromePreview } from "../../prompt/PromptChromePreview";
import { FloatingHoverCard } from "@/features/graph/components/overlay/FloatingHoverCard";
import { DataTableGridView } from "@/features/graph/components/explore/data-table/DataTableGridView";
import { DataTableToolbarView } from "@/features/graph/components/explore/data-table/DataTableToolbar";
import {
  badgeAccentStyles,
  badgeOutlineStyles,
  BottomTrayShell,
  GatedSwitch,
  insetCodeBlockStyle,
  insetTableFrameStyle,
  MetaPill,
  OverlayCard,
  OverlaySurface,
  PanelBody,
  PanelDivider,
  PanelHeaderActions,
  PanelIconAction,
  PanelInlineLoader,
  panelAccentCardClassName,
  panelAccentCardEntityClassName,
  panelAccentCardEntityStyle,
  panelAccentCardStyle,
  panelCardClassName,
  panelCardStyle,
  panelPillStyles,
  PanelSearchField,
  panelSurfaceStyle,
  panelTextDimStyle,
  panelTextStyle,
  panelTypePillStyles,
} from "@/features/graph/components/panels/PanelShell";
import { useShellVariantContext } from "@/features/graph/components/shell/ShellVariantContext";
import { WIKI_SEARCH_SURFACE_WIDTH, WikiSearchResultsSurface } from "@/features/wiki/components/WikiSearchResultsSurface";
import type { WikiSearchHitResponse } from "@solemd/api-client/shared/wiki-types";
import type { GraphPointRecord } from "@solemd/graph";

const previewCanvasStyle = {
  ...panelSurfaceStyle,
  backgroundColor: "var(--background)",
} as const;

export function ReadingPanelPreview() {
  return (
    <div className="flex h-[340px] flex-col overflow-hidden rounded-xl" style={panelSurfaceStyle}>
      <PanelChrome
        title="Info"
        onClose={() => {}}
        headerActions={(
          <PanelHeaderActions gap="tight">
            <PanelInlineLoader size={10} />
          </PanelHeaderActions>
        )}
      >
        <PanelBody>
          <Stack gap="sm">
            <div className={panelCardClassName} style={panelCardStyle}>
              <Text fw={600} style={panelTextStyle}>
                Summary
              </Text>
              <Text mt={4} style={panelTextDimStyle}>
                Canonical reading panel shell for graph inspection and evidence browsing.
              </Text>
            </div>

            <Group gap={6}>
              <Badge size="xs" styles={panelPillStyles}>24 shown</Badge>
              <Badge size="xs" styles={panelTypePillStyles}>selection</Badge>
              <Badge size="xs" variant="light" styles={badgeAccentStyles}>active</Badge>
            </Group>

            <PanelDivider />

            <div className={panelAccentCardClassName} style={panelAccentCardStyle}>
              <Text fw={600} style={panelTextStyle}>
                Evidence block
              </Text>
              <Text mt={4} style={panelTextStyle}>
                Shared accent cards should propagate across detail, RAG, wiki, and search surfaces.
              </Text>
            </div>

            <GatedSwitch
              gateActive
              checked
              onChange={() => {}}
              label="Show labels"
            />
          </Stack>
        </PanelBody>
      </PanelChrome>
    </div>
  );
}

export function BottomTrayPreview() {
  const shellVariant = useShellVariantContext();
  const isMobile = shellVariant === "mobile";
  const previewRows: GraphPointRecord[] = [
    {
      index: 0,
      id: "paper:1",
      paperId: "1",
      nodeKind: "paper",
      nodeRole: "primary",
      color: "#a8c5e9",
      colorLight: "#a8c5e9",
      x: 0,
      y: 0,
      clusterId: 1,
      clusterLabel: "Dopamine",
      displayLabel: "Dopamine signaling and psychosis",
      displayPreview: null,
      paperTitle: "Dopamine signaling and psychosis",
      citekey: "Sole2026A",
      journal: "Neuron",
      year: 2026,
      semanticGroups: "gene|chemical",
      relationCategories: "associates_with",
      textAvailability: "abstract",
      paperAuthorCount: 4,
      paperReferenceCount: 52,
      paperEntityCount: 31,
      paperRelationCount: 18,
      isInBase: true,
      baseRank: 1,
      isOverlayActive: false,
    },
    {
      index: 1,
      id: "paper:2",
      paperId: "2",
      nodeKind: "paper",
      nodeRole: "primary",
      color: "#aedc93",
      colorLight: "#aedc93",
      x: 1,
      y: 1,
      clusterId: 1,
      clusterLabel: "Dopamine",
      displayLabel: "DRD2 receptor modulation in schizophrenia",
      displayPreview: null,
      paperTitle: "DRD2 receptor modulation in schizophrenia",
      citekey: "Sole2026B",
      journal: "Nature Medicine",
      year: 2025,
      semanticGroups: "gene|disease",
      relationCategories: "targets",
      textAvailability: "fulltext",
      paperAuthorCount: 6,
      paperReferenceCount: 37,
      paperEntityCount: 24,
      paperRelationCount: 12,
      isInBase: true,
      baseRank: 2,
      isOverlayActive: false,
    },
    {
      index: 2,
      id: "paper:3",
      paperId: "3",
      nodeKind: "paper",
      nodeRole: "primary",
      color: "#ffada4",
      colorLight: "#ffada4",
      x: 2,
      y: 2,
      clusterId: 2,
      clusterLabel: "Therapeutics",
      displayLabel: "Agonist response across psychosis cohorts",
      displayPreview: null,
      paperTitle: "Agonist response across psychosis cohorts",
      citekey: "Sole2026C",
      journal: "Lancet Psychiatry",
      year: 2024,
      semanticGroups: "chemical|disease",
      relationCategories: "treats",
      textAvailability: "abstract",
      paperAuthorCount: 5,
      paperReferenceCount: 41,
      paperEntityCount: 28,
      paperRelationCount: 15,
      isInBase: true,
      baseRank: 3,
      isOverlayActive: false,
    },
  ];

  return (
    <div className="relative h-[280px] overflow-hidden rounded-xl" style={previewCanvasStyle}>
      <BottomTrayShell
        height={210}
        bodyClassName="px-2.5"
        toolbar={(
          <DataTableToolbarView
            resolvedTableView="selection"
            selectionAvailable
            totalPages={12}
            safePage={1}
            pageLoading={false}
            pageRefreshing={false}
            totalRows={2481}
            isMobile={isMobile}
            queryPanelOpen={false}
            onSetTableView={() => {}}
            onSetTablePage={() => {}}
            onToggleQueryPanel={() => {}}
            onExport={() => {}}
          />
        )}
        onResizeMouseDown={() => {}}
      >
        <DataTableGridView
          activeLayer="corpus"
          pageRows={previewRows}
          startIdx={0}
          pageLoading={false}
          pageError={null}
          resolvedTableView="selection"
          selectedNodeId={previewRows[0].id}
        />
      </BottomTrayShell>
    </div>
  );
}

export function PopoverPreview() {
  const [value, setValue] = useState("dopamine");
  const previewHits: WikiSearchHitResponse[] = [
    {
      slug: "dopamine-receptor-d2",
      title: "Dopamine receptor D2",
      entity_type: "gene",
      family_key: "receptor-family",
      tags: ["wiki"],
      headline: "Gene · receptor family · wiki page",
      rank: 0.98,
    },
    {
      slug: "dopamine-pathway",
      title: "Dopamine pathway",
      entity_type: "module",
      family_key: "foundations",
      tags: ["wiki"],
      headline: "Foundations · signaling overview",
      rank: 0.93,
    },
    {
      slug: "dopamine-agonists",
      title: "Dopamine agonists",
      entity_type: "chemical",
      family_key: "therapeutics",
      tags: ["wiki"],
      headline: "Therapeutics · medication group",
      rank: 0.89,
    },
  ];

  return (
    <div className="flex h-[220px] flex-col overflow-hidden rounded-xl" style={panelSurfaceStyle}>
      <PanelChrome
        title="Wiki"
        onClose={() => {}}
        headerActions={(
          <div className="relative mr-1">
            <PanelSearchField
              open
              collapsible
              value={value}
              onValueChange={setValue}
              placeholder="Search wiki..."
              ariaLabel="Search wiki"
              actionLabel="Close search"
              actionMode="close"
              onAction={() => {}}
              width={WIKI_SEARCH_SURFACE_WIDTH}
            />
            <WikiSearchResultsSurface
              hits={previewHits}
              searching={false}
              query={value}
              onSelect={() => {}}
              width={WIKI_SEARCH_SURFACE_WIDTH}
            />
          </div>
        )}
      >
        <div className="flex-1 border-t border-[var(--graph-panel-border)] bg-[var(--background)]" />
      </PanelChrome>
    </div>
  );
}

export function HoverCardPreview() {
  return (
    <div className="relative h-[220px] overflow-hidden rounded-xl" style={previewCanvasStyle}>
      <div className="absolute left-4 top-4 rounded-full bg-[var(--mode-accent-subtle)] px-3 py-1 text-xs font-medium text-[var(--mode-accent)]">
        Hovered entity
      </div>
      <FloatingHoverCard
        x={18}
        y={164}
        minWidth={270}
        maxWidth={340}
        className="rounded-2xl px-3 py-2.5"
        data-entity-type="gene"
      >
        <div className="flex flex-col gap-1.5">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <Group gap={6}>
                <span className="entity-accent-pill">Gene</span>
                <MetaPill mono truncate>HGNC:3023</MetaPill>
              </Group>
              <Text mt={6} fw={600} style={{ ...panelTextStyle, fontSize: "12px", lineHeight: 1.3 }}>
                DRD2 dopamine receptor
              </Text>
            </div>
            <Group gap={2}>
              <PanelIconAction label="Show on graph" icon={<Orbit size={12} />} size="xs" radius="md" />
              <PanelIconAction label="Open wiki" icon={<BookOpenText size={12} />} size="xs" radius="md" />
            </Group>
          </div>
          <PanelDivider />
          <Group gap={6}>
            <MetaPill>2,481 papers</MetaPill>
            <MetaPill>targeted</MetaPill>
          </Group>
        </div>
      </FloatingHoverCard>
    </div>
  );
}

export function OverlayPreview() {
  return (
    <div className="relative h-[280px] overflow-hidden rounded-xl" style={previewCanvasStyle}>
      <OverlaySurface position="absolute" blurPx={6}>
        <OverlayCard
          style={{
            width: "78%",
            height: "76%",
          }}
        >
          <div className="absolute right-3 top-3 z-10">
            <PanelIconAction label="Close overlay" icon={<Search size={12} />} size="sm" radius="xl" />
          </div>
          <div className="flex h-full flex-col gap-3 p-4">
            <Text fw={600} style={panelTextStyle}>
              Fullscreen knowledge view
            </Text>
            <Text style={panelTextDimStyle}>
              Shared overlay family for fullscreen graph views, animation embeds, and modal-like explorations.
            </Text>
            <div className="flex-1 rounded-xl border border-[var(--graph-panel-border)] bg-[var(--surface-alt)]" />
          </div>
        </OverlayCard>
      </OverlaySurface>
    </div>
  );
}

export function PromptPreview() {
  return <PromptChromePreview />;
}

export function PrimitivesPreview() {
  return (
    <Stack gap="lg">
      <div>
        <Text fw={600} style={panelTextStyle}>Pills & badges</Text>
        <Group mt={8} gap={6}>
          <MetaPill mono>HGNC:3023</MetaPill>
          <Badge size="xs" styles={panelPillStyles}>24 shown</Badge>
          <Badge size="xs" styles={panelTypePillStyles}>gene</Badge>
          <Badge size="xs" variant="light" styles={badgeAccentStyles}>active</Badge>
          <Badge size="xs" variant="outline" styles={badgeOutlineStyles}>secondary</Badge>
        </Group>
      </div>

      <div>
        <Text fw={600} style={panelTextStyle}>Cards</Text>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <div className={panelCardClassName} style={panelCardStyle}>
            <Text fw={600} style={panelTextStyle}>Inset card</Text>
            <Text mt={4} style={panelTextDimStyle}>Neutral in-panel content block.</Text>
          </div>
          <div className={panelAccentCardClassName} style={panelAccentCardStyle}>
            <Text fw={600} style={panelTextStyle}>Accent card</Text>
            <Text mt={4} style={panelTextStyle}>Mode-aware emphasis for evidence and details.</Text>
          </div>
          <div
            className={panelAccentCardEntityClassName}
            style={panelAccentCardEntityStyle}
            data-entity-type="chemical"
          >
            <Text fw={600} style={panelTextStyle}>Entity accent</Text>
            <Text mt={4} style={panelTextStyle}>Entity-specific tint from shared semantic tokens.</Text>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div>
          <Text fw={600} style={panelTextStyle}>Inset code block</Text>
          <Code block style={{ ...insetCodeBlockStyle, marginTop: 12 }}>
            {`SELECT node_id, node_kind\nFROM graph_points\nWHERE node_kind = 'gene'\nLIMIT 5;`}
          </Code>
        </div>
        <div>
          <Text fw={600} style={panelTextStyle}>Inset table frame</Text>
          <div style={{ ...insetTableFrameStyle, marginTop: 12, maxHeight: 280 }}>
            <Table.ScrollContainer minWidth={180} style={{ maxHeight: 120 }}>
              <Table
                styles={{
                  th: {
                    backgroundColor: "var(--graph-panel-bg)",
                    borderColor: "var(--graph-panel-border)",
                    color: "var(--graph-panel-text-dim)",
                    fontSize: "11px",
                  },
                  td: {
                    borderColor: "var(--graph-panel-border)",
                    color: "var(--graph-panel-text)",
                    fontSize: "12px",
                  },
                }}
              >
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Name</Table.Th>
                    <Table.Th>Type</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  <Table.Tr>
                    <Table.Td>DRD2</Table.Td>
                    <Table.Td>Gene</Table.Td>
                  </Table.Tr>
                  <Table.Tr>
                    <Table.Td>Dopamine</Table.Td>
                    <Table.Td>Chemical</Table.Td>
                  </Table.Tr>
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          </div>
        </div>
      </div>
    </Stack>
  );
}
