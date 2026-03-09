"use client";

import { useMemo } from "react";
import { CosmographPopup } from "@cosmograph/react";
import { useGraphStore } from "@/lib/graph/stores";
import { escapeHtml } from "@/lib/helpers";

/**
 * Hover tooltip anchored to the point under the cursor.
 * Renders as a callout card with a colored left accent border (cluster color),
 * paper title, chunk preview, and metadata breadcrumbs.
 *
 * CosmographPopup only accepts an HTML string — no React children —
 * so the card is built as a template literal with inline styles referencing
 * our CSS custom properties for automatic light/dark theming.
 */
export function HoverPopup() {
  const hoveredNode = useGraphStore((s) => s.hoveredNode);
  const selectedNode = useGraphStore((s) => s.selectedNode);

  // Suppress hover popup when a point is selected (DetailPanel is visible)
  const node = selectedNode ? null : hoveredNode;

  const content = useMemo(() => {
    if (!node) return "";

    const title = escapeHtml(String(node.paperTitle ?? "Untitled"));
    const cluster = escapeHtml(
      String(node.clusterLabel ?? `Cluster ${node.clusterId}`)
    );
    const preview = node.chunkPreview
      ? escapeHtml(node.chunkPreview.slice(0, 200))
      : null;
    const metaParts = [node.journal, node.year, node.sectionCanonical]
      .filter(Boolean)
      .map((v) => escapeHtml(String(v)));

    const metaHtml = metaParts.length
      ? `<span style="margin-left:2px">\u00b7</span> ${metaParts.join(" \u00b7 ")}`
      : "";

    return [
      // Outer card
      `<div style="max-width:340px;min-width:200px;border-radius:12px;overflow:hidden;`,
      `background:var(--graph-panel-bg);border:1px solid var(--graph-panel-border);`,
      `box-shadow:var(--graph-panel-shadow);font-family:var(--font-sans)">`,

      // Inner content with colored left accent border
      `<div style="border-left:3px solid ${node.color};padding:10px 14px 10px 12px">`,

      // Title — up to 3 lines
      `<div style="font-size:12.5px;font-weight:600;line-height:1.35;`,
      `color:var(--graph-panel-text);`,
      `display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden">`,
      title,
      `</div>`,

      // Chunk preview — italic, 2-line clamp, in quotation marks
      preview
        ? [
            `<div style="margin-top:6px;font-size:11px;line-height:1.4;`,
            `color:var(--graph-panel-text-dim);font-style:italic;`,
            `display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">`,
            `\u201c${preview}\u201d`,
            `</div>`,
          ].join("")
        : "",

      // Meta footer — cluster dot + label · journal · year · section
      `<div style="margin-top:8px;display:flex;align-items:center;gap:4px;`,
      `font-size:10px;color:var(--graph-panel-text-muted);line-height:1">`,
      `<span style="display:inline-block;width:6px;height:6px;border-radius:50%;`,
      `background:${node.color};flex-shrink:0"></span>`,
      `<span>${cluster}</span>`,
      metaHtml,
      `</div>`,

      `</div>`, // close inner
      `</div>`, // close outer
    ].join("");
  }, [node]);

  if (!node) return null;

  return (
    <CosmographPopup
      content={content}
      bindTo={node.index}
      placement="top"
      offset={[0, 14]}
    />
  );
}
