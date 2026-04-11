"use client";

import { useEffect, useRef } from "react";
import { useWikiStore } from "@/features/wiki/stores/wiki-store";
import {
  mountWikiGraph,
  toSimNode,
  toSimLink,
} from "@/features/wiki/graph-runtime";
import type { WikiGraphIntents } from "@/features/wiki/graph-runtime";

interface WikiGraphProps {
  intents: WikiGraphIntents;
}

export function WikiGraph({ intents }: WikiGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const graphData = useWikiStore((s) => s.graphData);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !graphData || graphData.nodes.length === 0) return;

    const nodes = graphData.nodes.map(toSimNode);
    const links = graphData.edges.map(toSimLink);

    let cancelled = false;
    let cleanup: (() => void) | null = null;

    mountWikiGraph({
      container: el,
      nodes,
      links,
      signature: graphData.signature,
      intents,
    }).then((fn) => {
      if (cancelled) {
        // Component unmounted before mount resolved — tear down immediately
        fn();
      } else {
        cleanup = fn;
      }
    });

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [graphData, intents]);

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden"
      style={{ minHeight: 300 }}
    />
  );
}
