"use client";

import { useEffect, useMemo, useRef } from "react";
import { useWikiStore } from "@/features/wiki/stores/wiki-store";
import {
  mountWikiGraph,
  toSimNode,
  toSimLink,
} from "@/features/wiki/graph-runtime";
import type { WikiGraphIntents } from "@/features/wiki/graph-runtime";
import type { WikiGraphNode, WikiGraphEdge } from "@/lib/engine/wiki-types";

interface WikiLocalGraphProps {
  slug: string;
  onNavigate: (slug: string) => void;
}

/**
 * Small local graph showing the current page's immediate neighborhood.
 * Rendered in the page view like Quartz's local graph widget.
 */
export function WikiLocalGraph({ slug, onNavigate }: WikiLocalGraphProps) {
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
    let cleanup: (() => void) | null = null;

    mountWikiGraph({
      container: el,
      nodes,
      links,
      signature: localGraph.signature,
      intents,
    }).then((fn) => {
      if (cancelled) {
        fn();
      } else {
        cleanup = fn;
      }
    });

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [localGraph, intents]);

  if (!localGraph) return null;

  return (
    <div
      className="overflow-hidden rounded-md border"
      style={{
        height: 180,
        borderColor: "var(--graph-panel-border, rgba(255,255,255,0.08))",
        background: "var(--graph-panel-bg)",
      }}
    >
      <div ref={containerRef} className="relative h-full w-full overflow-hidden" />
    </div>
  );
}
