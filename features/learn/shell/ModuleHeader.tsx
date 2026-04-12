"use client";

import Link from "next/link";
import { Group, Title, Badge, Text } from "@mantine/core";
import type { ModuleManifest } from "@/features/learn/types";

interface ModuleHeaderProps {
  manifest: ModuleManifest;
}

export function ModuleHeader({ manifest }: ModuleHeaderProps) {
  const wikiHref = `/wiki/${manifest.wikiSlug ?? manifest.slug}`;

  return (
    <header>
      <Group justify="space-between" align="flex-start" wrap="wrap">
        <div>
          <Text
            component={Link}
            href={wikiHref}
            size="sm"
            style={{ color: "var(--text-secondary)" }}
          >
            ← Wiki entry
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
