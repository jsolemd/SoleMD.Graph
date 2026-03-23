import { useMemo, useState } from "react";
import { ArcLayer } from "@deck.gl/layers";
import { hexToRgba } from "@/features/graph/lib/colors";
import type { GeoNode, GeoLink, GeoCitationLink } from "@/features/graph/types";

/** Stable arc color tuples — module-level to avoid useMemo churn. */
const ARC_COLLAB_DARK: [number, number, number, number] = [168, 197, 233, 100];
const ARC_COLLAB_LIGHT: [number, number, number, number] = [108, 123, 180, 120];
const ARC_CITATION_DARK: [number, number, number, number] = [233, 197, 118, 100];
const ARC_CITATION_LIGHT: [number, number, number, number] = [180, 140, 60, 120];

export interface HoveredArc {
  x: number;
  y: number;
  source: string;
  target: string;
  paperCount: number;
}

/**
 * Builds deck.gl ArcLayers for collaboration + citation arcs.
 * Returns the layers array and the hovered-arc tooltip state.
 */
export function useDeckArcs(
  geoLinks: GeoLink[],
  geoCitationLinks: GeoCitationLink[],
  renderLinks: boolean,
  renderCitationLinks: boolean,
  isDark: boolean,
  selectedSet: Set<number> | null,
  indexToNode: globalThis.Map<number, GeoNode>,
) {
  const [hoveredArc, setHoveredArc] = useState<HoveredArc | null>(null);

  const arcLayers = useMemo(() => {
    const layers: ArcLayer[] = [];
    const fallback = isDark ? ARC_COLLAB_DARK : ARC_COLLAB_LIGHT;

    // Collaboration arcs
    if (renderLinks && geoLinks.length) {
      const minPapers = selectedSet ? 1 : 2;
      const filteredLinks = (
        selectedSet
          ? geoLinks.filter(
              (l) =>
                selectedSet.has(l.sourceIndex) ||
                selectedSet.has(l.targetIndex),
            )
          : geoLinks
      ).filter((l) => l.paperCount >= minPapers);

      if (filteredLinks.length > 0) {
        layers.push(
          new ArcLayer<GeoLink>({
            id: "geo-arcs",
            data: filteredLinks,
            getSourcePosition: (d) => [d.sourceLng, d.sourceLat],
            getTargetPosition: (d) => [d.targetLng, d.targetLat],
            getSourceColor: (d) => {
              const node = indexToNode.get(d.sourceIndex);
              return node
                ? hexToRgba(isDark ? node.color : node.colorLight)
                : fallback;
            },
            getTargetColor: (d) => {
              const node = indexToNode.get(d.targetIndex);
              return node
                ? hexToRgba(isDark ? node.color : node.colorLight)
                : fallback;
            },
            getWidth: (d) => Math.max(1, Math.sqrt(d.paperCount)),
            greatCircle: true,
            widthMinPixels: 1,
            widthMaxPixels: 8,
            pickable: true,
            autoHighlight: true,
            highlightColor: [255, 255, 255, 80],
            onHover: (info) => {
              if (info.object) {
                const src = indexToNode.get(info.object.sourceIndex);
                const tgt = indexToNode.get(info.object.targetIndex);
                setHoveredArc({
                  x: info.x,
                  y: info.y,
                  source: src?.institution ?? "Unknown",
                  target: tgt?.institution ?? "Unknown",
                  paperCount: info.object.paperCount,
                });
              } else {
                setHoveredArc(null);
              }
            },
          }),
        );
      }
    }

    // Citation arcs — warm amber, thinner to distinguish from collaboration
    if (renderCitationLinks && geoCitationLinks.length) {
      const citationColor = isDark ? ARC_CITATION_DARK : ARC_CITATION_LIGHT;
      const minCitations = selectedSet ? 1 : 2;
      const filteredCitations = (
        selectedSet
          ? geoCitationLinks.filter(
              (l) =>
                selectedSet.has(l.sourceIndex) ||
                selectedSet.has(l.targetIndex),
            )
          : geoCitationLinks
      ).filter((l) => l.citationCount >= minCitations);

      if (filteredCitations.length > 0) {
        layers.push(
          new ArcLayer<GeoCitationLink>({
            id: "geo-citation-arcs",
            data: filteredCitations,
            getSourcePosition: (d) => [d.sourceLng, d.sourceLat],
            getTargetPosition: (d) => [d.targetLng, d.targetLat],
            getSourceColor: citationColor,
            getTargetColor: citationColor,
            getWidth: (d) =>
              Math.max(0.5, Math.sqrt(d.citationCount) * 0.8),
            greatCircle: true,
            widthMinPixels: 1,
            widthMaxPixels: 6,
            pickable: true,
            autoHighlight: true,
            highlightColor: [255, 255, 255, 80],
            onHover: (info) => {
              if (info.object) {
                const src = indexToNode.get(info.object.sourceIndex);
                const tgt = indexToNode.get(info.object.targetIndex);
                setHoveredArc({
                  x: info.x,
                  y: info.y,
                  source: src?.institution ?? "Unknown",
                  target: tgt?.institution ?? "Unknown",
                  paperCount: info.object.citationCount,
                });
              } else {
                setHoveredArc(null);
              }
            },
          }),
        );
      }
    }

    return layers;
  }, [
    geoLinks,
    geoCitationLinks,
    renderLinks,
    renderCitationLinks,
    isDark,
    selectedSet,
    indexToNode,
  ]);

  return { arcLayers, hoveredArc } as const;
}
