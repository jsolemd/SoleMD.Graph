"use client";

import { useEffect, useRef } from "react";
import { fetchGraphEntityMatches } from "@solemd/api-client/client/entity-service";
import type { GraphEntityTextMatch } from "@solemd/api-client/shared/graph-entity";
import { useEntityHover } from "./use-entity-hover";

/* ───────── constants ───────── */

/** Selectors whose text we skip during extraction (already highlighted by
 *  other surfaces). We deliberately exclude `.entity-highlight-zone-mark`
 *  (our own marks) so that extractText() returns stable text regardless of
 *  whether our annotations are present — prevents observer→re-annotate loops. */
const SKIP_SELECTORS = [
  ".wiki-entity-mention:not(.entity-highlight-zone-mark)",
  ".wiki-link",
  ".tiptap-entity-highlight",
].join(",");

const MARK_CLASS = "wiki-entity-mention entity-highlight-zone-mark";
const CACHE_TTL_MS = 60_000;
const CACHE_SWEEP_MS = 30_000;
const DEFAULT_DEBOUNCE_MS = 300;

/* ───────── module-scoped match cache ───────── */

interface CacheEntry {
  promise: Promise<readonly GraphEntityTextMatch[]>;
  settledAt: number | null;
}

const matchCache = new Map<string, CacheEntry>();

let sweepTimer: ReturnType<typeof setInterval> | null = null;

function ensureSweep() {
  if (sweepTimer !== null) return;
  sweepTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of matchCache) {
      if (entry.settledAt !== null && now - entry.settledAt > CACHE_TTL_MS) {
        matchCache.delete(key);
      }
    }
    if (matchCache.size === 0 && sweepTimer !== null) {
      clearInterval(sweepTimer);
      sweepTimer = null;
    }
  }, CACHE_SWEEP_MS);
}

function isFresh(entry: CacheEntry): boolean {
  if (entry.settledAt === null) return true;
  return Date.now() - entry.settledAt < CACHE_TTL_MS;
}

/* ───────── text extraction ───────── */

interface TextSegment {
  node: Text;
  globalStart: number;
  length: number;
}

function extractText(container: HTMLElement): {
  text: string;
  segments: TextSegment[];
} {
  const segments: TextSegment[] = [];
  let offset = 0;

  const walker = document.createTreeWalker(
    container,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        const parent = node.parentElement;
        if (parent?.closest(SKIP_SELECTORS)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    },
  );

  const parts: string[] = [];
  let current = walker.nextNode() as Text | null;
  while (current) {
    const len = current.textContent?.length ?? 0;
    if (len > 0) {
      segments.push({ node: current, globalStart: offset, length: len });
      parts.push(current.textContent!);
      offset += len;
    }
    current = walker.nextNode() as Text | null;
  }

  return { text: parts.join(""), segments };
}

/* ───────── dedup + annotation helpers ───────── */

function dedupFirstOccurrence(
  matches: readonly GraphEntityTextMatch[],
): GraphEntityTextMatch[] {
  const seen = new Set<string>();
  const sorted = [...matches].sort((a, b) => a.startOffset - b.startOffset);
  const result: GraphEntityTextMatch[] = [];

  for (const m of sorted) {
    if (seen.has(m.sourceIdentifier)) continue;
    seen.add(m.sourceIdentifier);
    result.push(m);
  }

  return result;
}

function findSegment(
  segments: TextSegment[],
  globalOffset: number,
): { segment: TextSegment; localOffset: number } | null {
  for (const seg of segments) {
    const segEnd = seg.globalStart + seg.length;
    if (globalOffset >= seg.globalStart && globalOffset < segEnd) {
      return { segment: seg, localOffset: globalOffset - seg.globalStart };
    }
  }
  return null;
}

function clearMarks(container: HTMLElement) {
  const marks = container.querySelectorAll(".entity-highlight-zone-mark");
  for (const mark of marks) {
    const parent = mark.parentNode;
    if (!parent) continue;
    while (mark.firstChild) {
      parent.insertBefore(mark.firstChild, mark);
    }
    parent.removeChild(mark);
    parent.normalize();
  }
}

/* ───────── options ───────── */

export interface UseDomEntityHighlightsOptions {
  enabled?: boolean;
  matchLimit?: number;
  debounceMs?: number;
}

/* ───────── hook ───────── */

/**
 * DOM-level entity highlighting for arbitrary React content.
 *
 * After React paints the container, extracts visible text via TreeWalker,
 * resolves entity matches via the match API (cached), and annotates the DOM
 * with `<mark>` elements that reuse the `.wiki-entity-mention` CSS contract.
 *
 * A MutationObserver re-annotates when React updates the subtree.
 * Event delegation on the container connects hover cards via useEntityHover().
 */
export function useDomEntityHighlights(
  containerRef: React.RefObject<HTMLElement | null>,
  options?: UseDomEntityHighlightsOptions,
): void {
  const enabled = options?.enabled ?? true;
  const matchLimit = options?.matchLimit;
  const debounceMs = options?.debounceMs ?? DEFAULT_DEBOUNCE_MS;

  const hoverCtx = useEntityHover();
  const hoverRef = useRef(hoverCtx);
  hoverRef.current = hoverCtx;

  useEffect(() => {
    if (!enabled) return;

    const container = containerRef.current;
    if (!container) return;

    let abortController: AbortController | null = null;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;
    /** Text fingerprint of last successful annotation — skip if unchanged. */
    let lastAnnotatedText = "";
    /** Observer is disconnected during our own DOM mutations. */
    let observer: MutationObserver | null = null;

    /* ── annotate pipeline ── */

    async function annotate() {
      const el = containerRef.current;
      if (!el || disposed) return;

      // Stage 1: extract text
      const { text } = extractText(el);
      if (text.trim().length < 2) return;

      // If the text hasn't changed since last annotation, skip entirely.
      // This prevents the MutationObserver→annotate loop: our DOM mutations
      // change the tree structure but not the visible text content.
      if (text === lastAnnotatedText) return;

      // Stage 2: fetch matches (cached)
      abortController?.abort();
      const controller = new AbortController();
      abortController = controller;

      const requestPayload: { text: string; limit?: number } = { text };
      if (matchLimit !== undefined) requestPayload.limit = matchLimit;
      const cacheKey = JSON.stringify(requestPayload);
      let entry = matchCache.get(cacheKey);

      if (!entry || !isFresh(entry)) {
        if (entry) matchCache.delete(cacheKey);

        const newEntry: CacheEntry = {
          promise: null as unknown as Promise<readonly GraphEntityTextMatch[]>,
          settledAt: null,
        };

        newEntry.promise = fetchGraphEntityMatches(
          requestPayload,
          { signal: controller.signal },
        )
          .then((res) => {
            newEntry.settledAt = Date.now();
            return res.matches;
          })
          .catch((err) => {
            matchCache.delete(cacheKey);
            if (
              err instanceof DOMException && err.name === "AbortError"
            ) {
              return [] as GraphEntityTextMatch[];
            }
            return [] as GraphEntityTextMatch[];
          });

        matchCache.set(cacheKey, newEntry);
        ensureSweep();
        entry = newEntry;
      }

      let matches: readonly GraphEntityTextMatch[];
      try {
        matches = await entry.promise;
      } catch {
        return;
      }

      if (disposed || controller.signal.aborted) return;

      // Stage 3: first-occurrence dedup
      const deduped = dedupFirstOccurrence(matches);

      // Stage 4: DOM annotation — disconnect observer, mutate, reconnect.
      // All mutations are synchronous so there's no window where the
      // observer can fire on our own changes.
      observer?.disconnect();

      clearMarks(el);

      if (deduped.length > 0) {
        // Re-extract segments after clearing (text nodes may have merged)
        const fresh = extractText(el);

        // Process in reverse offset order so splitText doesn't invalidate
        // earlier offsets.
        const reversed = [...deduped].sort(
          (a, b) => b.startOffset - a.startOffset,
        );

        for (const m of reversed) {
          const hit = findSegment(fresh.segments, m.startOffset);
          if (!hit) continue;

          const { segment, localOffset } = hit;
          const matchLen = m.endOffset - m.startOffset;

          if (localOffset + matchLen > segment.length) continue;

          try {
            const textNode = segment.node;

            // Split: [before | matched | after]
            const matchedNode =
              localOffset > 0 ? textNode.splitText(localOffset) : textNode;
            if (matchLen < (matchedNode.textContent?.length ?? 0)) {
              matchedNode.splitText(matchLen);
            }

            const mark = document.createElement("mark");
            mark.className = MARK_CLASS;
            mark.dataset.entityType = m.entityType;
            mark.dataset.entitySourceId = m.sourceIdentifier;
            mark.dataset.entityCanonical = m.canonicalName;
            if (m.conceptId) mark.dataset.entityConceptId = m.conceptId;
            if (m.conceptNamespace)
              mark.dataset.entityConceptNs = m.conceptNamespace;

            matchedNode.parentNode!.insertBefore(mark, matchedNode);
            mark.appendChild(matchedNode);
          } catch {
            // splitText can throw if DOM was mutated concurrently — skip
          }
        }
      }

      lastAnnotatedText = text;
      reconnectObserver();
    }

    /* ── debounced trigger ── */

    function scheduleAnnotate() {
      if (debounceTimer !== null) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        void annotate();
      }, debounceMs);
    }

    /* ── MutationObserver ── */

    function reconnectObserver() {
      if (disposed || !container) return;
      observer?.disconnect();
      observer?.observe(container, {
        childList: true,
        subtree: true,
        characterData: true,
      });
    }

    observer = new MutationObserver(() => {
      scheduleAnnotate();
    });

    /* ── initial run ── */

    scheduleAnnotate();
    reconnectObserver();

    /* ── Stage 5: event delegation ── */

    function resolveEntityTarget(e: Event): HTMLElement | null {
      return (
        ((e.target as HTMLElement)?.closest?.(
          "[data-entity-source-id]",
        ) as HTMLElement | null) ?? null
      );
    }

    function buildShowArgs(target: HTMLElement, x: number, y: number, pinned: boolean) {
      return {
        entity: {
          entityType: target.dataset.entityType ?? "",
          sourceIdentifier: target.dataset.entitySourceId ?? "",
          canonicalName: target.dataset.entityCanonical ?? "",
          conceptId: target.dataset.entityConceptId ?? "",
          conceptNamespace: target.dataset.entityConceptNs ?? null,
        },
        x,
        y,
        pinned,
      };
    }

    function onPointerOver(e: PointerEvent) {
      // Touch uses click-to-pin; pointerover on touch would flash the card
      // for the duration of the tap, which is worse than nothing.
      if (e.pointerType === "touch") return;
      const target = resolveEntityTarget(e);
      if (!target) return;
      hoverRef.current.show(buildShowArgs(target, e.clientX, e.clientY, false));
    }

    function onPointerOut(e: PointerEvent) {
      if (e.pointerType === "touch") return;
      const target = (e.target as HTMLElement)?.closest?.(
        "[data-entity-source-id]",
      );
      if (!target) return;
      const related = e.relatedTarget as HTMLElement | null;
      if (related && target.contains(related)) return;
      hoverRef.current.hide();
    }

    // Latch the originating pointerType from pointerdown so the subsequent
    // click handler can reliably distinguish a finger tap from a mouse
    // click. Chrome Android does dispatch click as a PointerEvent, but
    // older WebViews and some synthetic events still deliver a plain
    // MouseEvent — check once at the source.
    let lastPointerType: string = "mouse";
    function onPointerDown(e: PointerEvent) {
      lastPointerType = e.pointerType || "mouse";
    }

    function onClick(e: MouseEvent) {
      // Only the touch flow uses click-to-pin; mouse click would conflict
      // with text-selection semantics and we already show on hover.
      if (lastPointerType !== "touch") return;
      const target = resolveEntityTarget(e);
      if (!target) return;
      hoverRef.current.show(buildShowArgs(target, e.clientX, e.clientY, true));
    }

    container.addEventListener("pointerover", onPointerOver);
    container.addEventListener("pointerout", onPointerOut);
    container.addEventListener("pointerdown", onPointerDown);
    container.addEventListener("click", onClick);

    /* ── cleanup ── */

    return () => {
      disposed = true;
      if (debounceTimer !== null) clearTimeout(debounceTimer);
      abortController?.abort();
      observer?.disconnect();
      observer = null;
      container.removeEventListener("pointerover", onPointerOver);
      container.removeEventListener("pointerout", onPointerOut);
      container.removeEventListener("pointerdown", onPointerDown);
      container.removeEventListener("click", onClick);
      clearMarks(container);
    };
  }, [enabled, matchLimit, debounceMs, containerRef]);
}
