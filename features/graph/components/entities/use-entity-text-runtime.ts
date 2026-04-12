"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchGraphEntityMatches,
} from "@/features/graph/lib/entity-service";
import type {
  GraphEntityTextMatch,
} from "@/features/graph/types/entity-service";
import {
  recordMatchAbort,
  recordMatchCacheHit,
  recordMatchCacheMiss,
  recordMatchLatency,
  recordMatchRequest,
} from "./entity-match-metrics";
import type { EntityTextScope } from "./entity-text-runtime";

const EMPTY_ENTITY_MATCHES = Object.freeze([]) as readonly GraphEntityTextMatch[];
const ENTITY_MATCH_DEBOUNCE_MS = 320;
const MIN_ENTITY_MATCH_TEXT_LENGTH = 2;
const CURATED_ALIAS_SOURCES = new Set(["umls", "umls_tradename", "vocab", "canonical_name"]);
const DEFAULT_ENTITY_MATCH_LIMIT = 24;
const MATCH_CACHE_TTL_MS = 60_000;
const MULTISPACE_RE = /\s+/g;

interface MatchCacheEntry {
  promise: Promise<readonly GraphEntityTextMatch[]>;
  settledAt: number | null;
}

interface UseEntityTextRuntimeArgs {
  enabled: boolean;
  matchLimit?: number;
}

interface UseEntityTextRuntimeState {
  entityMatches: readonly GraphEntityTextMatch[];
  handleTextScopeChange: (scope: EntityTextScope | null) => void;
}

function normalizeEntityScopeKey(scope: EntityTextScope | null): string {
  if (!scope) return "";
  return scope.text.trim().replace(MULTISPACE_RE, " ").toLowerCase();
}

function isMatchCacheEntryFresh(entry: MatchCacheEntry): boolean {
  if (entry.settledAt === null) return true;
  return Date.now() - entry.settledAt < MATCH_CACHE_TTL_MS;
}

function isAbortError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === "AbortError") return true;
  return (
    error !== null &&
    typeof error === "object" &&
    "name" in error &&
    (error as { name: string }).name === "AbortError"
  );
}

/**
 * Runtime entity text matching — debounced API calls with TTL-based caching.
 *
 * Hover card display is handled by the shared EntityHoverCardProvider
 * (via useEntityHover context). This hook only manages match resolution.
 */
export function useEntityTextRuntime({
  enabled,
  matchLimit = DEFAULT_ENTITY_MATCH_LIMIT,
}: UseEntityTextRuntimeArgs): UseEntityTextRuntimeState {
  const [textScope, setTextScope] = useState<EntityTextScope | null>(null);
  const [entityMatches, setEntityMatches] =
    useState<readonly GraphEntityTextMatch[]>(EMPTY_ENTITY_MATCHES);

  const matchCacheRef = useRef(new Map<string, MatchCacheEntry>());
  const matchSequenceRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  const handleTextScopeChange = useCallback((nextScope: EntityTextScope | null) => {
    setTextScope((current) => {
      if (
        current?.text === nextScope?.text &&
        current?.textFrom === nextScope?.textFrom
      ) {
        return current;
      }
      return nextScope;
    });
  }, []);

  const stableScopeKey = normalizeEntityScopeKey(textScope);

  useEffect(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;

    const normalizedText = textScope?.text.trim() ?? "";
    if (
      !enabled ||
      normalizedText.length < MIN_ENTITY_MATCH_TEXT_LENGTH
    ) {
      setEntityMatches(EMPTY_ENTITY_MATCHES);
      return;
    }

    const requestKey = JSON.stringify({
      text: normalizedText,
      matchLimit,
    });

    matchSequenceRef.current += 1;
    const matchSequence = matchSequenceRef.current;

    // Debounce the entire request+commit cycle so continuous typing does not
    // hit the network on every keystroke. Only a stable text window (no new
    // changes for ENTITY_MATCH_DEBOUNCE_MS) triggers a fetch.
    const timer = window.setTimeout(() => {
      const existingEntry = matchCacheRef.current.get(requestKey);

      if (existingEntry && isMatchCacheEntryFresh(existingEntry)) {
        recordMatchCacheHit();
        void existingEntry.promise.then((matches) => {
          if (matchSequenceRef.current !== matchSequence) return;
          setEntityMatches(Object.freeze(matches));
        });
        return;
      }

      if (existingEntry) {
        matchCacheRef.current.delete(requestKey);
      }

      const controller = new AbortController();
      abortControllerRef.current = controller;
      const fetchStart = Date.now();

      recordMatchRequest();
      recordMatchCacheMiss();

      const entry: MatchCacheEntry = {
        promise: null as unknown as Promise<readonly GraphEntityTextMatch[]>,
        settledAt: null,
      };

      entry.promise = fetchGraphEntityMatches(
        { text: normalizedText, limit: matchLimit },
        { signal: controller.signal },
      )
        .then((response) => {
          entry.settledAt = Date.now();
          recordMatchLatency(Date.now() - fetchStart);
          return response.matches;
        })
        .catch((error) => {
          matchCacheRef.current.delete(requestKey);
          if (isAbortError(error)) {
            recordMatchAbort();
          }
          return EMPTY_ENTITY_MATCHES;
        });

      matchCacheRef.current.set(requestKey, entry);

      void entry.promise.then((matches) => {
        if (matchSequenceRef.current !== matchSequence) return;
        const filtered = matches.filter(
          (m) =>
            m.matchedText.length >= MIN_ENTITY_MATCH_TEXT_LENGTH ||
            CURATED_ALIAS_SOURCES.has(m.aliasSource),
        );
        setEntityMatches(Object.freeze(filtered));
      });
    }, ENTITY_MATCH_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
    };
  // stableScopeKey is derived from textScope.text via normalizeEntityScopeKey,
  // so it already captures text changes. The effect reads textScope.text.trim()
  // via closure, which is safe because React batches state updates before
  // running effects and stableScopeKey changes iff the normalized text changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, matchLimit, stableScopeKey]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      for (const [key, entry] of matchCacheRef.current) {
        if (!isMatchCacheEntryFresh(entry)) {
          matchCacheRef.current.delete(key);
        }
      }
    }, 30_000);
    return () => window.clearInterval(interval);
  }, []);

  return {
    entityMatches,
    handleTextScopeChange,
  };
}
