"use client";

import { Text } from "@mantine/core";
import type {
  AliasNode,
  RelationAssertionNode,
  TermNode,
} from "@/features/graph/types";
import {
  InlineStats,
  panelTextDimStyle,
  panelTextStyle,
  sectionLabelStyle,
} from "../ui";

export function TermSection({ node }: { node: TermNode }) {
  return (
    <div>
      <Text size="xs" fw={600} mb={8} style={sectionLabelStyle}>
        Term
      </Text>
      <Text style={panelTextStyle}>
        {node.canonicalName ?? node.displayLabel ?? "Unnamed term"}
      </Text>
      {node.category && (
        <Text size="xs" c="dimmed" mt={2}>{node.category}</Text>
      )}
      {node.definition && (
        <Text size="xs" mt={8} style={{ ...panelTextDimStyle, lineHeight: 1.5 }}>
          {node.definition}
        </Text>
      )}
      <div className="mt-2">
        <InlineStats
          items={[
            { label: "mentions", value: node.mentionCount },
            { label: "papers", value: node.paperCount },
            { label: "chunks", value: node.chunkCount },
            { label: "relations", value: node.relationCount },
            { label: "aliases", value: node.aliasCount },
          ]}
        />
      </div>
      {(node.semanticTypes || node.semanticGroups || node.organSystems) && (
        <div className="mt-2">
          {node.semanticTypes && <Text style={panelTextDimStyle}>Types: {node.semanticTypes}</Text>}
          {node.semanticGroups && <Text style={panelTextDimStyle}>Groups: {node.semanticGroups}</Text>}
          {node.organSystems && <Text style={panelTextDimStyle}>Systems: {node.organSystems}</Text>}
        </div>
      )}
      {node.aliasesCsv && (
        <div className="mt-2">
          <Text style={panelTextDimStyle}>Aliases: {node.aliasesCsv}</Text>
        </div>
      )}
    </div>
  );
}

export function AliasSection({ node }: { node: AliasNode }) {
  return (
    <div>
      <Text size="xs" fw={600} mb={8} style={sectionLabelStyle}>
        Alias
      </Text>
      <Text style={panelTextStyle}>{node.aliasText ?? node.displayLabel ?? "Unnamed alias"}</Text>
      {node.canonicalName && (
        <Text mt={4} style={panelTextDimStyle}>
          Canonical term: {node.canonicalName}
        </Text>
      )}
      <div className="mt-2">
        <InlineStats
          items={[
            { label: "mentions", value: node.mentionCount },
            { label: "papers", value: node.paperCount },
            { label: "quality", value: node.aliasQualityScore != null ? Number(node.aliasQualityScore.toFixed(2)) : null },
          ]}
        />
      </div>
      {(node.aliasType || node.aliasSource) && (
        <Text mt={6} style={panelTextDimStyle}>
          {[node.aliasType, node.aliasSource].filter(Boolean).join(" · ")}
        </Text>
      )}
    </div>
  );
}

export function RelationAssertionSection({ node }: { node: RelationAssertionNode }) {
  return (
    <div>
      <Text size="xs" fw={600} mb={8} style={sectionLabelStyle}>
        Relation
      </Text>
      <Text style={panelTextStyle}>{node.relationType ?? node.displayLabel ?? "Relation assertion"}</Text>
      <div className="mt-2">
        <InlineStats
          items={[
            { label: "papers", value: node.paperCount },
            { label: "chunks", value: node.chunkCount },
          ]}
        />
      </div>
      <Text mt={6} style={panelTextDimStyle}>
        {[
          node.relationCategory,
          node.relationDirection,
          node.relationCertainty,
          node.assertionStatus,
          node.evidenceStatus,
        ]
          .filter(Boolean)
          .join(" · ") || "No assertion metadata available."}
      </Text>
      {node.chunkPreview && (
        <div
          className="rounded-xl px-3 py-3 mt-3"
          style={{
            backgroundColor: "var(--mode-accent-subtle)",
            border: "1px solid var(--mode-accent-border)",
          }}
        >
          <Text style={{ ...panelTextStyle, whiteSpace: "pre-wrap" }}>{node.chunkPreview}</Text>
        </div>
      )}
    </div>
  );
}
