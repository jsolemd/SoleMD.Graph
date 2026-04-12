"use client";

import "@/features/learn/modules/ai-for-mds/register";

import Link from "next/link";
import {
  Card,
  Title,
  Text,
  Badge,
  Group,
  SimpleGrid,
  Stack,
} from "@mantine/core";
import { listModules } from "@/features/learn/registry";
import { accentCssVar } from "@/features/learn/tokens";
import type { ModuleManifest } from "@/features/learn/types";

function ModuleCard({ manifest }: { manifest: ModuleManifest }) {
  return (
    <Card
      component={Link}
      href={`/learn/${manifest.slug}`}
      radius="lg"
      shadow="sm"
      padding="xl"
      style={{
        borderLeft: `4px solid ${accentCssVar(manifest.accent)}`,
        textDecoration: "none",
        color: "inherit",
      }}
    >
      <Stack gap="sm">
        <Title order={3} size="h4">
          {manifest.title}
        </Title>
        <Text size="sm" c="dimmed">
          {manifest.audience}
        </Text>
        <Group gap="xs">
          <Badge variant="light" radius="xl" size="sm">
            {manifest.estimatedMinutes} min
          </Badge>
          <Badge variant="light" radius="xl" size="sm">
            v{manifest.version}
          </Badge>
        </Group>
        {manifest.wikiSlug && (
          <Text
            component={Link}
            href={`/wiki/${manifest.wikiSlug}`}
            size="xs"
            c="dimmed"
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
            style={{ textDecoration: "underline" }}
          >
            Wiki entry
          </Text>
        )}
      </Stack>
    </Card>
  );
}

export default function LearnIndex() {
  const modules = listModules();

  if (modules.length === 0) {
    return (
      <Stack align="center" justify="center" className="px-6 py-20">
        <Text size="lg" c="dimmed">
          No modules available yet.
        </Text>
      </Stack>
    );
  }

  return (
    <div className="px-6 py-8">
      <Stack gap="lg">
        <Title order={1}>Learn</Title>
        <Text c="dimmed">Interactive learning modules for physicians</Text>
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="lg">
          {modules.map((manifest) => (
            <ModuleCard key={manifest.slug} manifest={manifest} />
          ))}
        </SimpleGrid>
      </Stack>
    </div>
  );
}
