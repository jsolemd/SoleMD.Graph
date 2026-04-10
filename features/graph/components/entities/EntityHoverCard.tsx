"use client";

import type { EntityHoverCardModel } from "./entity-hover-card";

interface EntityHoverCardProps {
  card: EntityHoverCardModel;
}

export function EntityHoverCard({ card }: EntityHoverCardProps) {
  return (
    <div
      className="rounded-2xl px-3 py-2"
      style={{
        position: "absolute",
        top: card.y,
        left: card.x,
        minWidth: 220,
        maxWidth: 320,
        zIndex: 5,
        backgroundColor: "var(--graph-prompt-bg)",
        border: "1px solid var(--graph-prompt-border)",
        boxShadow: "var(--graph-prompt-shadow)",
      }}
    >
      <div style={{ fontSize: "0.82rem", fontWeight: 600 }}>{card.label}</div>
      {card.entityType && (
        <div style={descriptionStyle}>{card.entityType}</div>
      )}
      {typeof card.paperCount === "number" && (
        <div style={descriptionStyle}>
          {card.paperCount.toLocaleString()} linked papers
        </div>
      )}
      {card.aliases.length > 0 && (
        <div style={descriptionStyle}>
          Also known as {card.aliases.slice(0, 3).join(", ")}
        </div>
      )}
      {card.summary && <div style={snippetStyle}>{card.summary}</div>}
      {!card.detailReady && !card.summary && (
        <div style={descriptionStyle}>Loading entity detail…</div>
      )}
    </div>
  );
}

const descriptionStyle = {
  fontSize: "0.72rem",
  lineHeight: 1.4,
  color: "var(--graph-prompt-placeholder)",
};

const snippetStyle = {
  marginTop: 6,
  fontSize: "0.74rem",
  lineHeight: 1.45,
  color: "var(--graph-prompt-text)",
};
