/**
 * Cosmograph widget theme overrides.
 *
 * queryWidgetThemeVars  — panel-context widgets (histograms, bars inside info/filter panels)
 * timelineWidgetThemeVars — canvas-context timeline in the bottom chrome bar
 *
 * Both override Cosmograph's default :root CSS variables set in globals.css.
 * Inline overrides handle context-specific differences (text color, bar coloring).
 */

/** Panel-context theme — widgets rendered inside graph panels. */
export const queryWidgetThemeVars: React.CSSProperties = {
  "--cosmograph-ui-background": "transparent",
  "--cosmograph-ui-text": "var(--graph-panel-text)",
  "--cosmograph-ui-tick-font-size": "9px",
  "--cosmograph-ui-font-size": "10px",
  "--cosmograph-ui-font-family": "inherit",
  "--cosmograph-ui-element-color": "var(--filter-bar-base)",
  "--cosmograph-ui-highlighted-element-color": "var(--filter-bar-active)",
  "--cosmograph-ui-selection-control-color":
    "color-mix(in srgb, var(--mode-accent) 45%, transparent)",
  "--cosmograph-scrollbar-background": "rgba(255, 255, 255, 0.12)",
  "--cosmograph-histogram-bar-color": "var(--filter-bar-base)",
  "--cosmograph-histogram-highlighted-bar-color": "var(--filter-bar-active)",
  "--cosmograph-histogram-background": "transparent",
  "--cosmograph-histogram-axis-color": "var(--graph-panel-text)",
  "--cosmograph-histogram-selection-color":
    "color-mix(in srgb, var(--mode-accent) 45%, transparent)",
  "--cosmograph-bars-background": "var(--filter-bar-base)",
  "--cosmograph-bars-highlighted-color": "var(--filter-bar-active)",
  "--cosmograph-bars-font-color": "var(--graph-panel-text)",
  "--cosmograph-bars-font-size": "8px",
  "--cosmograph-bars-bar-height": "12px",
  "--cosmograph-bars-bar-bottom-margin": "1px",
  "--cosmograph-bars-ui-font-size": "8px",
} as React.CSSProperties;

/**
 * Canvas-context theme — timeline widget in the bottom chrome bar.
 * Uses --text-tertiary (not --graph-panel-text) because the timeline
 * sits on the graph background, not inside a panel.
 * Timeline-specific vars (--cosmograph-timeline-font-size) are already
 * set in globals.css and inherit automatically — only overrides listed here.
 */
export const timelineWidgetThemeVars: React.CSSProperties = {
  "--cosmograph-ui-background": "transparent",
  "--cosmograph-ui-text": "var(--text-tertiary)",
  "--cosmograph-ui-tick-font-size": "10px",
  "--cosmograph-ui-font-size": "10px",
  "--cosmograph-ui-element-color": "var(--filter-bar-base)",
  "--cosmograph-ui-highlighted-element-color": "var(--mode-accent)",
  "--cosmograph-ui-selection-control-color":
    "color-mix(in srgb, var(--mode-accent) 45%, transparent)",
  "--cosmograph-timeline-background": "transparent",
  "--cosmograph-timeline-bar-color": "var(--filter-bar-base)",
  "--cosmograph-timeline-highlighted-bar-color": "var(--mode-accent)",
  "--cosmograph-timeline-axis-color": "var(--text-tertiary)",
} as React.CSSProperties;
