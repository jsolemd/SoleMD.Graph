"use client";

import {
  iconBtnStyles,
  PanelDivider,
  PanelInlineLoader,
  panelTextDimStyle,
  panelTextMutedStyle,
  panelTextStyle,
} from "@/features/graph/components/panels/PanelShell";
import { FloatingHoverCard } from "@/features/graph/components/overlay/FloatingHoverCard";
import type { GraphEntityRef } from "@/features/graph/types/entity-service";
import type { EntityHoverCardModel } from "./entity-hover-card";
import { ActionIcon, Tooltip } from "@mantine/core";
import { BookOpenText, FileText, Orbit, Tag } from "lucide-react";

interface EntityHoverCardProps {
  card: EntityHoverCardModel;
  onShowOnGraph?: (entity: GraphEntityRef) => void;
  onOpenWiki?: (entity: GraphEntityRef) => void;
  onPointerEnter?: () => void;
  onPointerLeave?: () => void;
}

function formatConceptId(
  namespace: string | null,
  id: string | null,
): string | null {
  if (!id) return null;
  if (namespace) return `${namespace}:${id}`;
  return id;
}

const ENTITY_TYPE_PUBTATOR_PREFIX: Record<string, string> = {
  disease: "DISEASE",
  chemical: "CHEMICAL",
  gene: "GENE",
};

function pubtatorUrl(
  entityType: string | null,
  namespace: string | null,
  id: string | null,
): string | null {
  if (!entityType || !namespace || !id) return null;
  const prefix = ENTITY_TYPE_PUBTATOR_PREFIX[entityType.toLowerCase()];
  if (!prefix) return null;
  const ns = namespace.toUpperCase();
  if (ns !== "MESH" && ns !== "OMIM") return null;
  const query = `@${prefix}_${ns}:${id}`;
  return `https://www.ncbi.nlm.nih.gov/research/pubtator3/docsum?text=${encodeURIComponent(query)}`;
}

const neutralPill: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  fontSize: 8,
  lineHeight: 1,
  padding: "2px 4px",
  borderRadius: 4,
  whiteSpace: "nowrap",
  backgroundColor: "var(--graph-panel-input-bg)",
  color: "var(--graph-panel-text-dim)",
  border: "1px solid var(--graph-panel-border)",
};

export function EntityHoverCard({
  card,
  onShowOnGraph,
  onOpenWiki,
  onPointerEnter,
  onPointerLeave,
}: EntityHoverCardProps) {
  const conceptLabel = formatConceptId(card.conceptNamespace, card.conceptId);
  const conceptUrl = pubtatorUrl(card.entityType, card.conceptNamespace, card.conceptId);
  const canonicalAliases = card.aliases.filter((a) => a.isCanonical);
  const synonymAliases = card.aliases.filter((a) => !a.isCanonical);
  const displayAliases = [...canonicalAliases, ...synonymAliases].slice(0, 4);

  return (
    <FloatingHoverCard
      x={card.x}
      y={card.y}
      placement="above-start"
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      className="rounded-2xl px-3 py-2.5"
      minWidth={260}
      maxWidth={340}
      data-entity-type={card.entityType?.toLowerCase() ?? undefined}
    >
      <div className="flex flex-col gap-1.5">
        {/* ── Header: type + concept + name + actions ── */}
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              {card.entityType && (
                <span className="entity-accent-pill">
                  {card.entityType}
                </span>
              )}
              {conceptLabel && (conceptUrl ? (
                <a
                  href={conceptUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="truncate"
                  style={{
                    ...neutralPill,
                    flexShrink: 1,
                    minWidth: 0,
                    fontFamily: "var(--font-mono)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    textDecoration: "none",
                  }}
                  title="Open in PubTator3"
                  onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                >
                  {conceptLabel}
                </a>
              ) : (
                <span
                  className="truncate"
                  style={{
                    ...neutralPill,
                    flexShrink: 1,
                    minWidth: 0,
                    fontFamily: "var(--font-mono)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {conceptLabel}
                </span>
              ))}
            </div>
            <div
              className="mt-1"
              style={{
                ...panelTextStyle,
                fontSize: 12,
                lineHeight: 1.3,
                fontWeight: 600,
              }}
            >
              {card.label}
            </div>
          </div>

          {(onShowOnGraph || onOpenWiki) && (
            <div className="flex items-center gap-0.5" style={{ marginTop: 1 }}>
              {onShowOnGraph && (
                <Tooltip label="Show on graph" position="top" withArrow>
                  <ActionIcon
                    variant="transparent"
                    size="xs"
                    radius="md"
                    className="graph-icon-btn"
                    styles={iconBtnStyles}
                    onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                    onClick={() => onShowOnGraph(card.entity)}
                    aria-label="Show on graph"
                  >
                    <Orbit size={12} strokeWidth={1.6} />
                  </ActionIcon>
                </Tooltip>
              )}
              {onOpenWiki && (
                <Tooltip label="Open wiki" position="top" withArrow>
                  <ActionIcon
                    variant="transparent"
                    size="xs"
                    radius="md"
                    className="graph-icon-btn"
                    styles={iconBtnStyles}
                    onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                    onClick={() => onOpenWiki(card.entity)}
                    aria-label="Open wiki"
                  >
                    <BookOpenText size={12} strokeWidth={1.6} />
                  </ActionIcon>
                </Tooltip>
              )}
            </div>
          )}
        </div>

        {/* ── Stats ── */}
        {(typeof card.paperCount === "number" || !card.detailReady) && (
          <>
            <PanelDivider />
            <div className="flex items-center gap-3">
              {typeof card.paperCount === "number" && (
                <span className="inline-flex items-center gap-1">
                  <FileText
                    size={10}
                    strokeWidth={1.5}
                    style={{ color: "var(--graph-panel-text-dim)", flexShrink: 0 }}
                  />
                  <span style={panelTextMutedStyle}>
                    {card.paperCount.toLocaleString()}
                    <span style={panelTextDimStyle}> papers</span>
                  </span>
                </span>
              )}
              {!card.detailReady && <PanelInlineLoader size={8} />}
            </div>
          </>
        )}

        {/* ── Aliases ── */}
        {displayAliases.length > 0 && (
          <>
            <PanelDivider />
            <div className="flex flex-wrap items-center gap-1">
              <Tag
                size={9}
                strokeWidth={1.5}
                style={{ color: "var(--graph-panel-text-dim)", flexShrink: 0, marginRight: 1 }}
              />
              {displayAliases.map((alias) => (
                <span
                  key={alias.aliasText}
                  className={alias.isCanonical ? "entity-accent-pill" : undefined}
                  style={alias.isCanonical ? undefined : neutralPill}
                >
                  {alias.aliasText}
                </span>
              ))}
              {card.aliases.length > 4 && (
                <span style={{ ...panelTextDimStyle, fontSize: 8 }}>
                  +{card.aliases.length - 4}
                </span>
              )}
            </div>
          </>
        )}
      </div>
    </FloatingHoverCard>
  );
}
