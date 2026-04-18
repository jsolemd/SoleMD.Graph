import type { ModuleAccent } from "./types";
import {
  brandPastelCssVar,
  brandPastelVarNameByKey,
} from "@/lib/theme/pastel-tokens";

const ACCENT_TO_CSS_VAR = brandPastelVarNameByKey satisfies Record<ModuleAccent, string>;

export function accentCssVar(accent: ModuleAccent): string {
  return brandPastelCssVar(accent);
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
