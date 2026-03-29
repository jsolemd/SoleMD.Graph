"use client";

import { useCallback, useEffect, useState } from "react";
import type { GraphBundle, GraphDetailAsset, GraphPointRecord } from "@/features/graph/types";
import { refreshGraphAssetUrl } from "@/features/graph/lib/detail-service";

export function getSignedAssetRefreshDelayMs(asset: GraphDetailAsset | null | undefined) {
  const access = asset?.access;
  if (!access || access.access_kind !== "signed" || !access.url) {
    return null;
  }

  const issuedAt = Date.parse(access.issued_at);
  const ttlSeconds = access.expires_in_seconds ?? null;
  if (!Number.isFinite(issuedAt) || ttlSeconds == null || ttlSeconds <= 0) {
    return null;
  }

  const refreshAtMs = issuedAt + Math.max(30, Math.floor(ttlSeconds * 0.8)) * 1000;
  return Math.max(0, refreshAtMs - Date.now());
}

export function useRefreshedAsset({
  bundle,
  node,
  asset,
}: {
  bundle: GraphBundle;
  node: GraphPointRecord;
  asset: GraphDetailAsset | null | undefined;
}) {
  const [resolvedAsset, setResolvedAsset] = useState<GraphDetailAsset | null | undefined>(asset);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    setResolvedAsset(asset);
    setRefreshError(null);
  }, [asset]);

  const refresh = useCallback(() => {
    if (!asset?.storage_path) return;

    setIsRefreshing(true);
    refreshGraphAssetUrl({ bundle, node, asset })
      .then((refreshed) => {
        setResolvedAsset((current) =>
          current
            ? {
                ...current,
                access: refreshed.access,
              }
            : current
        );
        setRefreshError(null);
      })
      .catch((error) => {
        setRefreshError(error instanceof Error ? error.message : "Failed to refresh asset access");
      })
      .finally(() => {
        setIsRefreshing(false);
      });
  }, [asset, bundle, node]);

  useEffect(() => {
    const delayMs = getSignedAssetRefreshDelayMs(resolvedAsset);
    if (delayMs == null) return;
    const timer = window.setTimeout(refresh, delayMs);
    return () => window.clearTimeout(timer);
  }, [refresh, resolvedAsset]);

  return {
    resolvedAsset,
    isRefreshing,
    refreshError,
    refresh,
  };
}
