"use client";

import { useEffect, useMemo, useRef } from "react";
import { useWikiStore } from "@/features/wiki/stores/wiki-store";
import {
  mountWikiGraph,
  toSimNode,
  toSimLink,
} from "@/features/wiki/graph-runtime";
import type { WikiGraphHandle, WikiGraphIntents } from "@/features/wiki/graph-runtime";
import type { WikiGraphNode, WikiGraphEdge } from "@solemd/api-client/shared/wiki-types";

interface WikiLocalGraphProps {
  slug: string;
  onNavigate: (slug: string) => void;
  height?: number;
  className?: string;
}

/**
 * Small local graph showing the current page's immediate neighborhood.
 * Rendered in the page view like Quartz's local graph widget.
 */
export function WikiLocalGraph({
  slug,
  onNavigate,
  height,
  className,
}: WikiLocalGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const graphData = useWikiStore((s) => s.graphData);

  // Extract local subgraph: current page + 1-hop neighbors
  const localGraph = useMemo(() => {
    if (!graphData) return null;

    const currentNodeId = `page:${slug}`;
    const neighborIds = new Set<string>([currentNodeId]);

    // Find all edges connected to the current page
    const localEdges: WikiGraphEdge[] = [];
    for (const edge of graphData.edges) {
      if (edge.source === currentNodeId) {
        neighborIds.add(edge.target);
        localEdges.push(edge);
      } else if (edge.target === currentNodeId) {
        neighborIds.add(edge.source);
        localEdges.push(edge);
      }
    }

    // Collect neighbor nodes
    const localNodes: WikiGraphNode[] = [];
    for (const node of graphData.nodes) {
      if (neighborIds.has(node.id)) {
        localNodes.push(node);
      }
    }

    if (localNodes.length <= 1) return null; // Just self, no neighbors

    return { nodes: localNodes, edges: localEdges, signature: `local:${slug}` };
  }, [graphData, slug]);

  const intents: WikiGraphIntents = useMemo(
    () => ({
      onOpenPage: onNavigate,
    }),
    [onNavigate],
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !localGraph) return;

    const nodes = localGraph.nodes.map(toSimNode);
    const links = localGraph.edges.map(toSimLink);

    let cancelled = false;
    let handle: WikiGraphHandle | null = null;

    mountWikiGraph({
      container: el,
      nodes,
      links,
      signature: localGraph.signature,
      intents,
    }).then((h) => {
      if (cancelled) {
        h.destroy();
      } else {
        handle = h;
      }
    });

    return () => {
      cancelled = true;
      handle?.destroy();
    };
  }, [localGraph, intents]);

  if (!localGraph) return null;

  return (
    <div
      className={`overflow-hidden rounded-xl border ${className ?? ""}`.trim()}
      data-testid="wiki-local-graph"
      style={{
        ...(height != null ? { height } : {}),
        borderColor: "var(--graph-panel-border, rgba(255,255,255,0.08))",
        background: "var(--graph-panel-bg)",
      }}
    >
      <div ref={containerRef} className="relative h-full w-full overflow-hidden" />
    </div>
  );
}
