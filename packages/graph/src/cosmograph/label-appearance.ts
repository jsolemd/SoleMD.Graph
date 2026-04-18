const HIDDEN_LABEL_STYLE = "display: none;";
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

${CSS_LABEL_SELECTOR}:empty {
  display: none !important;
}
`.trim();

export function resolveClusterLabelClassName(text: string) {
  const normalized = text.trim().toLowerCase();
  return !normalized || normalized === "null" || normalized === "undefined"
    ? HIDDEN_LABEL_STYLE
    : "";
}
