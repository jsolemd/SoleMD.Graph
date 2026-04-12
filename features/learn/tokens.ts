import type { ModuleAccent } from "./types";

const ACCENT_TO_CSS_VAR: Record<ModuleAccent, string> = {
  "soft-blue": "--color-soft-blue",
  "muted-indigo": "--color-muted-indigo",
  "golden-yellow": "--color-golden-yellow",
  "fresh-green": "--color-fresh-green",
  "warm-coral": "--color-warm-coral",
  "soft-pink": "--color-soft-pink",
  "soft-lavender": "--color-soft-lavender",
  paper: "--color-paper",
};

export function accentCssVar(accent: ModuleAccent): string {
  return `var(${ACCENT_TO_CSS_VAR[accent]})`;
}

export function accentVarName(accent: ModuleAccent): string {
  return ACCENT_TO_CSS_VAR[accent];
}

export function setModuleAccent(
  element: HTMLElement,
  accent: ModuleAccent,
): void {
  element.style.setProperty("--module-accent", accentCssVar(accent));
}
