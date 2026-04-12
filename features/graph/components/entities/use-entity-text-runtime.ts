"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchGraphEntityDetail,
  fetchGraphEntityMatches,
} from "@/features/graph/lib/entity-service";
import type {
  GraphEntityDetailResponsePayload,
  GraphEntityTextMatch,
} from "@/features/graph/types/entity-service";
import type { EntityHoverCardModel } from "./entity-hover-card";
import {
  recordMatchAbort,
  recordMatchCacheHit,
  recordMatchCacheMiss,
  recordMatchLatency,
  recordMatchRequest,
} from "./entity-match-metrics";
import type { EntityHoverTarget, EntityTextScope } from "./entity-text-runtime";

const EMPTY_ENTITY_MATCHES = Object.freeze([]) as readonly GraphEntityTextMatch[];
const ENTITY_MATCH_DEBOUNCE_MS = 320;
const ENTITY_HOVER_CARD_CLEAR_DELAY_MS = 120;
const MIN_ENTITY_MATCH_TEXT_LENGTH = 4;
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
  entityHoverCard: EntityHoverCardModel | null;
  handleTextScopeChange: (scope: EntityTextScope | null) => void;
  handleEntityHoverTargetChange: (target: EntityHoverTarget | null) => void;
  handleHoverCardPointerEnter: () => void;
  handleHoverCardPointerLeave: () => void;
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

export function useEntityTextRuntime({
  enabled,
  matchLimit = DEFAULT_ENTITY_MATCH_LIMIT,
}: UseEntityTextRuntimeArgs): UseEntityTextRuntimeState {
  const [textScope, setTextScope] = useState<EntityTextScope | null>(null);
  const [entityMatches, setEntityMatches] =
    useState<readonly GraphEntityTextMatch[]>(EMPTY_ENTITY_MATCHES);
  const [entityHoverCard, setEntityHoverCard] =
    useState<EntityHoverCardModel | null>(null);

  const matchCacheRef = useRef(new Map<string, MatchCacheEntry>());
  const detailCacheRef = useRef(
    new Map<string, Promise<GraphEntityDetailResponsePayload>>(),
  );
  const matchSequenceRef = useRef(0);
  const hoverSequenceRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const hoverCardPointerInsideRef = useRef(false);
  const hoverCardClearTimerRef = useRef<number | null>(null);

  const clearHoverCardClearTimer = useCallback(() => {
    if (hoverCardClearTimerRef.current) {
      window.clearTimeout(hoverCardClearTimerRef.current);
      hoverCardClearTimerRef.current = null;
    }
  }, []);

  const scheduleEntityHoverCardClear = useCallback(() => {
    clearHoverCardClearTimer();
    hoverCardClearTimerRef.current = window.setTimeout(() => {
      hoverCardClearTimerRef.current = null;
      if (hoverCardPointerInsideRef.current) {
        return;
      }
      hoverSequenceRef.current += 1;
      setEntityHoverCard(null);
    }, ENTITY_HOVER_CARD_CLEAR_DELAY_MS);
  }, [clearHoverCardClearTimer]);

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

  const handleEntityHoverTargetChange = useCallback(
    (target: EntityHoverTarget | null) => {
      if (!target) {
        scheduleEntityHoverCardClear();
        return;
      }

      hoverCardPointerInsideRef.current = false;
      clearHoverCardClearTimer();
      hoverSequenceRef.current += 1;
      const hoverSequence = hoverSequenceRef.current;

      setEntityHoverCard(buildEntityHoverCardModel(target, null));
      const detailKey = buildEntityDetailCacheKey(target);
      const detailRequest =
        detailCacheRef.current.get(detailKey) ??
        fetchGraphEntityDetail({
          entityType: target.entity.entityType,
          sourceIdentifier: target.entity.sourceIdentifier,
        }).catch((error) => {
          detailCacheRef.current.delete(detailKey);
          throw error;
        });
      detailCacheRef.current.set(detailKey, detailRequest);

      void detailRequest
        .then((detail) => {
          if (hoverSequenceRef.current !== hoverSequence) {
            return;
          }

          setEntityHoverCard(buildEntityHoverCardModel(target, detail));
        })
        .catch(() => {
          if (hoverSequenceRef.current !== hoverSequence) {
            return;
          }

          setEntityHoverCard(buildEntityHoverCardModel(target, null));
        });
    },
    [clearHoverCardClearTimer, scheduleEntityHoverCardClear],
  );

  const handleHoverCardPointerEnter = useCallback(() => {
    hoverCardPointerInsideRef.current = true;
    clearHoverCardClearTimer();
  }, [clearHoverCardClearTimer]);

  const handleHoverCardPointerLeave = useCallback(() => {
    hoverCardPointerInsideRef.current = false;
    scheduleEntityHoverCardClear();
  }, [scheduleEntityHoverCardClear]);

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
          (m) => m.matchedText.length >= MIN_ENTITY_MATCH_TEXT_LENGTH,
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

  useEffect(() => {
    return () => {
      clearHoverCardClearTimer();
    };
  }, [clearHoverCardClearTimer]);

  return {
    entityMatches,
    entityHoverCard,
    handleTextScopeChange,
    handleEntityHoverTargetChange,
    handleHoverCardPointerEnter,
    handleHoverCardPointerLeave,
  };
}

function buildEntityDetailCacheKey(target: EntityHoverTarget) {
  return `${target.entity.entityType}:${target.entity.sourceIdentifier}`;
}

function buildEntityHoverCardModel(
  target: EntityHoverTarget,
  detail: GraphEntityDetailResponsePayload | null,
): EntityHoverCardModel {
  return {
    x: target.x,
    y: target.y,
    entity: detail
      ? {
          entityType: detail.entityType,
          conceptNamespace: detail.conceptNamespace,
          conceptId: detail.conceptId,
          sourceIdentifier: detail.sourceIdentifier,
          canonicalName: detail.canonicalName,
        }
      : target.entity,
    label: detail?.canonicalName ?? target.entity.canonicalName,
    entityType: detail?.entityType ?? target.entity.entityType,
    conceptId: detail?.conceptId ?? target.entity.conceptId ?? null,
    conceptNamespace: detail?.conceptNamespace ?? target.entity.conceptNamespace ?? null,
    paperCount: detail?.paperCount ?? target.paperCount,
    aliases:
      detail?.aliases.filter(
        (alias) =>
          alias.aliasText.trim().toLowerCase() !==
          detail.canonicalName.trim().toLowerCase(),
      ) ?? [],
    detailReady: Boolean(detail),
  };
}
