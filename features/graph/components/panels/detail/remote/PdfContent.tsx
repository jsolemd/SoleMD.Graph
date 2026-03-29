"use client";

import { Stack, Text } from "@mantine/core";
import type { GraphBundle, GraphDetailAsset, GraphPointRecord } from "@/features/graph/types";
import { useRefreshedAsset } from "../use-refreshed-asset";
import { ExtLink, RemoteStatus, panelTextDimStyle } from "../ui";

export function PdfContent({
  bundle,
  node,
  asset,
  loading,
  error,
}: {
  bundle: GraphBundle;
  node: GraphPointRecord;
  asset: GraphDetailAsset | null | undefined;
  loading: boolean;
  error: string | null;
}) {
  const { resolvedAsset, isRefreshing, refreshError, refresh } = useRefreshedAsset({
    bundle,
    node,
    asset,
  });

  if (loading || error) {
    return <RemoteStatus loading={loading} error={error} label="Loading PDF access…" />;
  }

  const url = resolvedAsset?.access?.url;
  if (!url) {
    return <Text style={panelTextDimStyle}>No PDF available.</Text>;
  }

  return (
    <Stack gap="sm">
      <ExtLink href={url} label="Open PDF" />
      {isRefreshing && <Text style={panelTextDimStyle}>Refreshing PDF access…</Text>}
      {refreshError && <Text style={panelTextDimStyle}>{refreshError}</Text>}
      <div
        className="overflow-hidden rounded-xl"
        style={{
          border: "1px solid var(--graph-panel-border)",
          backgroundColor: "var(--graph-panel-surface)",
        }}
      >
        <iframe src={url} title="Paper PDF" className="h-[360px] w-full" onError={refresh} />
      </div>
    </Stack>
  );
}
