"use client";

import { HoverCard, Text, Group, Stack } from "@mantine/core";
import { lookupGlossary } from "@/features/wiki/module-runtime/glossary";

interface GlossaryHoverProps {
  term: string;
  children?: React.ReactNode;
}

export function GlossaryHover({ term, children }: GlossaryHoverProps) {
  const entry = lookupGlossary(term);
  const display = children ?? term;

  if (!entry) {
    return <>{display}</>;
  }

  return (
    <HoverCard width={320} shadow="md" openDelay={200} closeDelay={100}>
      <HoverCard.Target>
        <span
          role="term"
          tabIndex={0}
          style={{
            textDecoration: "underline",
            textDecorationStyle: "dotted",
            textUnderlineOffset: "3px",
            color: "var(--module-accent)",
            cursor: "help",
          }}
        >
          {display}
        </span>
      </HoverCard.Target>
      <HoverCard.Dropdown style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <Stack gap="xs">
          <Text fw={700} style={{ color: "var(--text-primary)" }}>
            {entry.term}
          </Text>
          <Text size="sm" style={{ color: "var(--text-secondary)" }}>
            {entry.definition}
          </Text>
          {entry.related && entry.related.length > 0 && (
            <Group gap="xs">
              <Text size="xs" style={{ color: "var(--text-tertiary)" }}>
                Related:
              </Text>
              {entry.related.map((r) => (
                <Text
                  key={r}
                  size="xs"
                  style={{ color: "var(--module-accent)", cursor: "default" }}
                >
                  {r}
                </Text>
              ))}
            </Group>
          )}
          {entry.sources && entry.sources.length > 0 && (
            <Text size="xs" style={{ color: "var(--text-tertiary)" }}>
              Sources: {entry.sources.join(", ")}
            </Text>
          )}
        </Stack>
      </HoverCard.Dropdown>
    </HoverCard>
  );
}
