"use client";

import { Group, Title, Badge, Text } from "@mantine/core";
import type { ModuleManifest } from "@/features/wiki/module-runtime/types";
import { useWikiStore } from "@/features/wiki/stores/wiki-store";

interface ModuleHeaderProps {
  manifest: ModuleManifest;
}

export function ModuleHeader({ manifest }: ModuleHeaderProps) {
  const navigateToPage = useWikiStore((state) => state.navigateToPage);
  const setModulePopped = useWikiStore((state) => state.setModulePopped);

  const handleReturnToWikiPage = () => {
    navigateToPage(manifest.wikiPageSlug);
    setModulePopped(false);
  };

  return (
    <header>
      <Group justify="space-between" align="flex-start" wrap="wrap">
        <div>
          <Text
            component="button"
            type="button"
            onClick={handleReturnToWikiPage}
            size="sm"
            style={{
              color: "var(--text-secondary)",
              background: "none",
              border: 0,
              cursor: "pointer",
              padding: 0,
            }}
          >
            ← Back to wiki page
          </Text>
          <Title order={1} mt="xs">
            {manifest.title}
          </Title>
          <Group gap="sm" mt="sm">
            <Badge style={{ backgroundColor: "var(--module-accent)" }}>
              {manifest.audience}
            </Badge>
            <Badge style={{ backgroundColor: "var(--module-accent)" }}>
              {manifest.estimatedMinutes} min
            </Badge>
            <Badge variant="outline" style={{ borderColor: "var(--module-accent)", color: "var(--module-accent)" }}>
              v{manifest.version}
            </Badge>
          </Group>
        </div>
      </Group>
    </header>
  );
}
