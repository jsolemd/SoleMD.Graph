import type { CalloutProps } from "@/features/wiki/lib/markdown-pipeline";

/** Callout type → icon character for compact display. */
const CALLOUT_ICONS: Record<string, string> = {
  note: "ℹ",
  tip: "💡",
  warning: "⚠",
  danger: "🔴",
  important: "❗",
  example: "📋",
  quote: "❝",
  abstract: "📄",
  info: "ℹ",
  caution: "⚠",
};

/**
 * Obsidian-style callout block.
 * Renders as a mode-accent card with optional title.
 */
export function Callout({ type, title, children }: CalloutProps) {
  const icon = CALLOUT_ICONS[type] ?? CALLOUT_ICONS.note;
  const displayTitle = title || type.charAt(0).toUpperCase() + type.slice(1);

  return (
    <div className={`wiki-callout wiki-callout--${type}`}>
      <div className="wiki-callout-header">
        <span className="wiki-callout-icon">{icon}</span>
        <span className="wiki-callout-title">{displayTitle}</span>
      </div>
      <div className="wiki-callout-body">{children}</div>
    </div>
  );
}
