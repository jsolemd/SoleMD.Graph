"use client";

import { useEffect, useMemo, useRef } from "react";
import { useWikiStore } from "@/features/wiki/stores/wiki-store";
import {
  mountWikiGraph,
  toSimNode,
  toSimLink,
} from "@/features/wiki/graph-runtime";
import type { WikiGraphHandle, WikiGraphIntents } from "@/features/wiki/graph-runtime";
import { resolveNodeColorKey } from "@/features/wiki/graph-runtime/theme";

interface WikiGraphProps {
  intents: WikiGraphIntents;
}

export function WikiGraph({ intents }: WikiGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<WikiGraphHandle | null>(null);
  const graphData = useWikiStore((s) => s.graphData);
  const highlightGroups = useWikiStore((s) => s.graphHighlightGroups);
  const searchQuery = useWikiStore((s) => s.graphSearchQuery);

  // Compute the set of node IDs that should be highlighted
  const highlightNodeIds = useMemo(() => {
    if (!graphData) return undefined;
    const hasGroupFilter = highlightGroups !== null;
    const hasSearch = searchQuery.length > 0;
    if (!hasGroupFilter && !hasSearch) return undefined;

    const lowerQuery = searchQuery.toLowerCase();
    const ids = new Set<string>();

    for (const node of graphData.nodes) {
      const colorKey = resolveNodeColorKey({
        kind: node.kind,
        tags: node.tags,
        semanticGroup: node.semantic_group ?? null,
        entityType: node.entity_type,
      });

      const matchesGroup = !hasGroupFilter || highlightGroups.has(colorKey);
      const matchesSearch = !hasSearch || node.label.toLowerCase().includes(lowerQuery);

      if (matchesGroup && matchesSearch) {
        ids.add(node.id);
      }
    }
    return ids;
  }, [graphData, highlightGroups, searchQuery]);

  // Mount/unmount the Pixi scene — only depends on graphData + intents
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !graphData || graphData.nodes.length === 0) return;

    const nodes = graphData.nodes.map(toSimNode);
    const links = graphData.edges.map(toSimLink);

    let cancelled = false;

    mountWikiGraph({
      container: el,
      nodes,
      links,
      signature: graphData.signature,
      intents,
      highlightNodeIds,
    }).then((handle) => {
      if (cancelled) {
        handle.destroy();
      } else {
        handleRef.current = handle;
      }
    });

    return () => {
      cancelled = true;
      handleRef.current?.destroy();
      handleRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- highlightNodeIds applied via separate effect
  }, [graphData, intents]);

  // Apply highlight changes without remounting the scene
  useEffect(() => {
    handleRef.current?.applyHighlight(highlightNodeIds);
  }, [highlightNodeIds]);

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden"
      style={{ minHeight: 300 }}
    />
  );
}
