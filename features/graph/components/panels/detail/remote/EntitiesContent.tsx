"use client";

import { Badge, Group, Stack, Text } from "@mantine/core";
import type { GraphDetailChunkEntity } from "@/features/graph/types";
import {
  RemoteStatus,
  panelTextDimStyle,
  panelTextStyle,
} from "../ui";

export function EntitiesContent({
  entities,
  loading,
  error,
}: {
  entities: GraphDetailChunkEntity[] | undefined;
  loading: boolean;
  error: string | null;
}) {
  if (loading || error) {
    return <RemoteStatus loading={loading} error={error} label="Loading entities…" />;
  }
  if (!entities?.length) {
    return <Text style={panelTextDimStyle}>No entities available.</Text>;
  }

  return (
    <Stack gap="md">
      {entities.map((entity) => (
        <div
          key={entity.entity_id}
          className="rounded-xl px-3 py-3"
          style={{
            backgroundColor: "var(--mode-accent-subtle)",
            border: "1px solid var(--mode-accent-border)",
          }}
        >
          <Group gap={6} mb={6}>
            <Badge size="xs" variant="outline" color="gray">
              {entity.label}
            </Badge>
            {entity.is_negated && (
              <Badge size="xs" color="red" variant="light">
                Negated
              </Badge>
            )}
            {entity.temporal_status && (
              <Badge size="xs" variant="light" color="gray">
                {entity.temporal_status}
              </Badge>
            )}
          </Group>
          <Text fw={600} style={panelTextStyle}>
            {entity.text}
          </Text>
          <Text mt={4} style={panelTextDimStyle}>
            {[entity.umls_cui, entity.rxnorm_cui, entity.semantic_types[0] ?? null]
              .filter(Boolean)
              .join(" · ")}
          </Text>
        </div>
      ))}
    </Stack>
  );
}
