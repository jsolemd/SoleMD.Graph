"use client";

import { Button, Group } from "@mantine/core";
import { Copy, FileText, MessageSquareText, Orbit } from "lucide-react";
import { PANEL_ACCENT } from "@/features/graph/components/panels/PanelShell";

export function SelectionActionBar({
  onCopyNote,
  onAsk,
  onOpenGraphPaper,
  openGraphPaperLabel,
  pdfUrl,
  copyLabel,
}: {
  onCopyNote: () => void;
  onAsk: () => void;
  onOpenGraphPaper?: (() => void) | null;
  openGraphPaperLabel?: string;
  pdfUrl?: string | null;
  copyLabel: string;
}) {
  return (
    <Group gap="xs" wrap="wrap">
      <Button
        size="compact-sm"
        variant="light"
        color={PANEL_ACCENT}
        leftSection={<Copy size={14} />}
        onClick={onCopyNote}
      >
        {copyLabel}
      </Button>
      <Button
        size="compact-sm"
        variant="light"
        color={PANEL_ACCENT}
        leftSection={<MessageSquareText size={14} />}
        onClick={onAsk}
      >
        Ask
      </Button>
      {onOpenGraphPaper && (
        <Button
          size="compact-sm"
          variant="light"
          color={PANEL_ACCENT}
          leftSection={<Orbit size={14} />}
          onClick={onOpenGraphPaper}
        >
          {openGraphPaperLabel ?? "Open in graph"}
        </Button>
      )}
      {pdfUrl && (
        <Button
          size="compact-sm"
          variant="light"
          color={PANEL_ACCENT}
          component="a"
          href={pdfUrl}
          target="_blank"
          rel="noreferrer"
          leftSection={<FileText size={14} />}
        >
          Open PDF
        </Button>
      )}
    </Group>
  );
}
