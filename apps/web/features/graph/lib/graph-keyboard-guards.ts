const GRAPH_SHORTCUT_SKIP_TAGS = new Set([
  "INPUT",
  "TEXTAREA",
  "SELECT",
  "BUTTON",
]);

export function isGraphKeyboardEditableTarget(active: Element | null): boolean {
  if (!active) return false;
  if (
    active.tagName === "INPUT" ||
    active.tagName === "TEXTAREA" ||
    active.tagName === "SELECT"
  ) {
    return true;
  }

  const element = active as HTMLElement;
  if (element.isContentEditable) return true;

  // jsdom does not always reflect contenteditable through the
  // isContentEditable IDL property, so keep the attribute fallback here.
  const editable = active.getAttribute("contenteditable");
  if (editable === "" || editable === "true") return true;

  const role = active.getAttribute("role");
  return role === "textbox";
}

export function shouldSkipGraphKeyboardShortcut(
  active: Element | null,
): boolean {
  if (!active) return false;
  if (GRAPH_SHORTCUT_SKIP_TAGS.has(active.tagName)) return true;
  if (isGraphKeyboardEditableTarget(active)) return true;

  const role = active.getAttribute("role");
  return role === "button";
}
