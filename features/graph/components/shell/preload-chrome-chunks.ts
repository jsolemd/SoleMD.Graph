/**
 * Fire-and-forget prefetch for the lazy chrome chunks that block first-click
 * interactions on the dashboard shell. Call once after the canvas is live so
 * the browser has the chunks cached before the user clicks a panel or toggle.
 *
 * Keeps the chunks split (they are not eagerly bundled into the shell) — this
 * just triggers the network fetch early so the eventual `next/dynamic` mount
 * is a cache hit rather than a cold load.
 *
 * Extracted from the viewport component so tests can mock it without dragging
 * every lazy module through jest's transform chain.
 */
export function preloadChromeChunks(): void {
  void import("../chrome/TimelineBar");
  void import("../explore/data-table");
  void import("../explore/CanvasControls");
  void import("../panels/DetailPanel");
  void import("../panels/AboutPanel");
  void import("../explore/ConfigPanel");
  void import("../explore/FiltersPanel");
  void import("../explore/info-panel");
  void import("../explore/query-panel");
  void import("@/features/wiki/components/WikiPanel");
}
