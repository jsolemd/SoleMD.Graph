"use client";

import { UnstyledButton, Stack, Text } from "@mantine/core";
import type { ModuleSection } from "@/features/learn/types";

interface ModuleNavProps {
  sections: ModuleSection[];
  activeSection?: string;
}

export function ModuleNav({ sections, activeSection }: ModuleNavProps) {
  function scrollTo(id: string) {
    const el = document.getElementById(`section-${id}`);
    if (el) el.scrollIntoView({ behavior: "smooth" });
  }

  return (
    <nav
      style={{
        position: "sticky",
        top: "1rem",
        alignSelf: "flex-start",
      }}
      className="hidden md:block"
    >
      <Stack gap={4}>
        {sections.map((section) => {
          const isActive = section.id === activeSection;
          return (
            <UnstyledButton
              key={section.id}
              onClick={() => scrollTo(section.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 12px",
                borderRadius: 8,
                backgroundColor: isActive
                  ? "color-mix(in srgb, var(--module-accent) 15%, transparent)"
                  : "transparent",
              }}
            >
              <div
                style={{
                  width: 3,
                  height: 20,
                  borderRadius: 2,
                  backgroundColor: isActive
                    ? "var(--module-accent)"
                    : "var(--border-subtle)",
                  transition: "background-color 150ms ease",
                }}
              />
              <Text
                size="sm"
                style={{
                  color: isActive
                    ? "var(--text-primary)"
                    : "var(--text-secondary)",
                  fontWeight: isActive ? 600 : 400,
                  transition: "color 150ms ease",
                }}
              >
                {section.title}
              </Text>
            </UnstyledButton>
          );
        })}
      </Stack>
    </nav>
  );
}
