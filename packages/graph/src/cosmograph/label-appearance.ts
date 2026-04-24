const HIDDEN_LABEL_CLASS = "sol-cluster-label-hidden";
const LABEL_SCOPE_SELECTOR = "[data-graph-canvas]";
const LABEL_RADIUS = "4px";
const CSS_LABEL_SELECTOR = `${LABEL_SCOPE_SELECTOR} .css-label--label`;

export const NATIVE_COSMOGRAPH_LABEL_THEME_CSS = `
${LABEL_SCOPE_SELECTOR} {
  --css-label-background-color: var(--graph-label-bg);
  --css-label-brightness: none;
}

${CSS_LABEL_SELECTOR} {
  background-color: var(--graph-label-bg) !important;
  background-image: none !important;
  box-shadow: var(--graph-label-shadow) !important;
  border: 1px solid var(--graph-label-border) !important;
  border-radius: ${LABEL_RADIUS} !important;
  filter: none !important;
  backdrop-filter: none !important;
  opacity: 1 !important;
  text-shadow: var(--graph-label-text-shadow) !important;
  -webkit-text-stroke: var(--graph-label-text-stroke);
}

${CSS_LABEL_SELECTOR}:empty,
${CSS_LABEL_SELECTOR}.${HIDDEN_LABEL_CLASS} {
  display: none !important;
}
`.trim();

/**
 * Returns a className for Cosmograph's clusterLabelClassName hook.
 *
 * Empty / "null" / "undefined" cluster labels are hidden via a dedicated CSS
 * class — NOT by returning an inline style string, which Cosmograph would
 * treat as a className and produce invalid DOM (`class="display: none;"`).
 */
export function resolveClusterLabelClassName(text: string | null | undefined): string {
  if (text == null) {
    return HIDDEN_LABEL_CLASS;
  }
  const normalized = text.trim().toLowerCase();
  if (!normalized || normalized === "null" || normalized === "undefined") {
    return HIDDEN_LABEL_CLASS;
  }
  return "";
}

export { HIDDEN_LABEL_CLASS as HIDDEN_CLUSTER_LABEL_CLASS_NAME };
