"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useDebouncedValue } from "@mantine/hooks";

import type {
  GraphBundleQueries,
  GraphSearchResult,
  GraphLayer,
} from "@solemd/graph";

interface UseSearchResultsArgs {
  queries: GraphBundleQueries;
  activeLayer: GraphLayer;
  field: string;
  query: string;
  disabled: boolean;
}

interface UseSearchResultsResult {
  canSearch: boolean;
  loading: boolean;
  results: GraphSearchResult[];
  error: string | null;
}

export function useSearchResults({
  queries,
  activeLayer,
  field,
  query,
  disabled,
}: UseSearchResultsArgs): UseSearchResultsResult {
  const [results, setResults] = useState<GraphSearchResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [lastResolvedKey, setLastResolvedKey] = useState<string | null>(null);
  const [debouncedQuery] = useDebouncedValue(query.trim(), 140);
  const deferredQuery = useDeferredValue(debouncedQuery);
  const canSearch = !disabled && deferredQuery.length >= 2;
  const [debouncedField] = useDebouncedValue(field, 100);
  const requestKey = useMemo(
    () =>
      canSearch
        ? JSON.stringify({
            activeLayer,
            field: debouncedField,
            query: deferredQuery,
          })
        : null,
    [activeLayer, canSearch, deferredQuery, debouncedField],
  );
  const loading = canSearch && lastResolvedKey !== requestKey;

  useEffect(() => {
    if (!canSearch || !requestKey) {
      setResults([]);
      setError(null);
      setLastResolvedKey(null);
      return;
    }

    let cancelled = false;

    queries
      .searchPoints({
        layer: activeLayer,
        column: debouncedField,
        query: deferredQuery,
      })
      .then((next) => {
        if (cancelled) {
          return;
        }

        setResults(next);
        setError(null);
        setLastResolvedKey(requestKey);
      })
      .catch((searchError: unknown) => {
        if (cancelled) {
          return;
        }

        setResults([]);
        setError(
          searchError instanceof Error
            ? searchError.message
            : "Search failed",
        );
        setLastResolvedKey(requestKey);
      });

    return () => {
      cancelled = true;
    };
  }, [activeLayer, canSearch, deferredQuery, debouncedField, queries, requestKey]);

  return {
    canSearch,
    loading,
    results,
    error,
  };
}
