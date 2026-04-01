const HIDDEN_LABEL_STYLE = "display: none;";

export function resolveClusterLabelClassName(text: string) {
  const normalized = text.trim().toLowerCase();
  return !normalized || normalized === "null" || normalized === "undefined"
    ? HIDDEN_LABEL_STYLE
    : "";
}
