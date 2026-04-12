import type { GlossaryEntry } from "./types";

const entries: GlossaryEntry[] = [];

const byTerm = new Map<string, GlossaryEntry>();

function rebuildIndex() {
  byTerm.clear();
  for (const entry of entries) {
    byTerm.set(entry.term.toLowerCase(), entry);
    for (const alias of entry.aliases ?? []) {
      byTerm.set(alias.toLowerCase(), entry);
    }
  }
}

export function registerGlossaryEntries(newEntries: GlossaryEntry[]): void {
  entries.push(...newEntries);
  rebuildIndex();
}

export function lookupGlossary(term: string): GlossaryEntry | undefined {
  return byTerm.get(term.toLowerCase());
}

export function allGlossaryEntries(): readonly GlossaryEntry[] {
  return entries;
}
