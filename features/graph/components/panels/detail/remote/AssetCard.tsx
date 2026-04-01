"use client";

import { useState } from "react";
import Image from "next/image";
import {
  ActionIcon,
  Group,
  Modal,
  Stack,
  Text,
} from "@mantine/core";
import { ExternalLink, Maximize2 } from "lucide-react";
import type { GraphBundle, GraphDetailAsset, GraphPointRecord } from "@/features/graph/types";
import { useRefreshedAsset } from "../use-refreshed-asset";
import {
  RemoteStatus,
  panelTextDimStyle,
  panelTextStyle,
} from "../ui";

function AssetCard({
  bundle,
  node,
  asset,
}: {
  bundle: GraphBundle;
  node: GraphPointRecord;
  asset: GraphDetailAsset;
}) {
  const [previewOpened, setPreviewOpened] = useState(false);
  const { resolvedAsset, isRefreshing, refreshError, refresh } = useRefreshedAsset({
    bundle,
    node,
    asset,
  });

  if (!resolvedAsset) return null;

  const url = resolvedAsset.access?.url;
  const isPdf =
    resolvedAsset.asset_type === "pdf" || resolvedAsset.content_type?.includes("pdf");
  const isImage = Boolean(url) && !isPdf;
  const assetTitle = `${resolvedAsset.asset_type.charAt(0).toUpperCase() + resolvedAsset.asset_type.slice(1)}${
    resolvedAsset.page_number != null ? ` · p. ${resolvedAsset.page_number}` : ""
  }`;

  return (
    <>
      <div
        className="rounded-xl px-3 py-3"
        style={{
          backgroundColor: "var(--mode-accent-subtle)",
          border: "1px solid var(--mode-accent-border)",
        }}
      >
        <Group justify="space-between" align="flex-start" gap="sm">
          <div style={{ flex: 1 }}>
            <Text fw={600} style={panelTextStyle}>
              {assetTitle}
            </Text>
            {resolvedAsset.caption && (
              <Text mt={4} style={panelTextStyle}>
                {resolvedAsset.caption}
              </Text>
            )}
            {!resolvedAsset.caption && resolvedAsset.preview_text && (
              <Text mt={4} style={panelTextStyle}>
                {resolvedAsset.preview_text}
              </Text>
            )}
            {isRefreshing && <Text mt={4} style={panelTextDimStyle}>Refreshing asset access…</Text>}
            {refreshError && <Text mt={4} style={panelTextDimStyle}>{refreshError}</Text>}
          </div>
          <Group gap={6}>
            {isImage && (
              <ActionIcon
                variant="subtle"
                color="gray"
                size="sm"
                aria-label="Expand preview"
                onClick={() => setPreviewOpened(true)}
              >
                <Maximize2 size={14} />
              </ActionIcon>
            )}
            {url && (
              <ActionIcon
                component="a"
                href={url}
                target="_blank"
                rel="noreferrer"
                variant="subtle"
                color="gray"
                size="sm"
                aria-label="Open in new tab"
              >
                <ExternalLink size={14} />
              </ActionIcon>
            )}
          </Group>
        </Group>
        {isImage && (
          <button
            type="button"
            className="relative mt-3 block h-[240px] w-full overflow-hidden rounded-lg"
            style={{ background: "transparent", border: "none", padding: 0, cursor: "zoom-in" }}
            onClick={() => setPreviewOpened(true)}
          >
            <Image
              src={url!}
              alt={resolvedAsset.caption ?? `${resolvedAsset.asset_type} asset`}
              fill
              unoptimized
              sizes="(max-width: 768px) 100vw, 380px"
              className="rounded-lg object-contain"
              onError={refresh}
            />
          </button>
        )}
      </div>
      {isImage && (
        <Modal opened={previewOpened} onClose={() => setPreviewOpened(false)} title={assetTitle} centered size="xl">
          <Stack gap="sm">
            <Group justify="flex-end">
              {url && (
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1"
                  style={{ color: "var(--mode-accent)", fontSize: 11 }}
                >
                  Open in new tab
                  <ExternalLink size={12} />
                </a>
              )}
            </Group>
            <div className="relative h-[72vh] w-full overflow-hidden rounded-lg">
              <Image
              src={url!}
              alt={resolvedAsset.caption ?? `${resolvedAsset.asset_type} asset`}
                fill
                unoptimized
                sizes="100vw"
                className="rounded-lg object-contain"
                onError={refresh}
              />
            </div>
            {resolvedAsset.caption && <Text style={panelTextStyle}>{resolvedAsset.caption}</Text>}
          </Stack>
        </Modal>
      )}
    </>
  );
}

export function AssetGalleryContent({
  bundle,
  node,
  assets,
  loading,
  error,
  emptyLabel,
}: {
  bundle: GraphBundle;
  node: GraphPointRecord;
  assets: GraphDetailAsset[] | undefined;
  loading: boolean;
  error: string | null;
  emptyLabel: string;
}) {
  if (loading || error) {
    return <RemoteStatus loading={loading} error={error} label="Loading assets…" />;
  }
  if (!assets?.length) {
    return <Text style={panelTextDimStyle}>{emptyLabel}</Text>;
  }

  return (
    <Stack gap="md">
      {assets.map((asset) => (
        <AssetCard
          key={`${asset.asset_type}:${asset.asset_id ?? asset.storage_path}`}
          bundle={bundle}
          node={node}
          asset={asset}
        />
      ))}
    </Stack>
  );
}
