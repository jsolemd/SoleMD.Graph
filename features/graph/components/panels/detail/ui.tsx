"use client";

import { Group, Loader, Text } from "@mantine/core";
import { ExternalLink } from "lucide-react";
import {
  panelTextDimStyle,
  panelTextStyle,
  sectionLabelStyle,
} from "@/features/graph/components/panels/PanelShell";
import { formatNumber } from "@/lib/helpers";

export function InlineStats({
  items,
}: {
  items: Array<{ label: string; value: number | null | undefined }>;
}) {
  const parts = items
    .filter((metric) => metric.value != null)
    .map((metric) => `${formatNumber(metric.value!)} ${metric.label}`);

  if (parts.length === 0) return null;

  return <Text style={panelTextDimStyle}>{parts.join(" · ")}</Text>;
}

export function KV({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <Text style={panelTextDimStyle}>{label}</Text>
      <Text fw={600} style={panelTextStyle}>
        {value}
      </Text>
    </div>
  );
}

export function ExtLink({
  href,
  label,
}: {
  href: string | null;
  label: string;
}) {
  if (!href) return null;

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1"
      style={{ color: "var(--mode-accent)", fontSize: 11 }}
    >
      {label}
      <ExternalLink size={11} />
    </a>
  );
}

export function RemoteStatus({
  loading,
  error,
  label,
}: {
  loading: boolean;
  error: string | null;
  label: string;
}) {
  if (loading) {
    return (
      <Group gap="xs">
        <Loader size="xs" color="var(--mode-accent)" />
        <Text style={panelTextDimStyle}>{label}</Text>
      </Group>
    );
  }

  if (error) {
    return <Text style={panelTextDimStyle}>{error}</Text>;
  }

  return null;
}

export { panelTextDimStyle, panelTextStyle, sectionLabelStyle };
