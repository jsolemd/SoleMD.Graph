import Link from "next/link";
import { Paper, Stack, Title, Text, Button } from "@mantine/core";
import type { ModuleManifest } from "@/features/learn/types";

interface ModuleFooterProps {
  manifest: ModuleManifest;
  nextModule?: ModuleManifest;
}

export function ModuleFooter({ manifest, nextModule }: ModuleFooterProps) {
  return (
    <footer>
      <Stack gap="xl">
        {manifest.citations.length > 0 && (
          <Paper style={{ backgroundColor: "var(--surface-alt)" }}>
            <Title order={3} mb="md">
              References
            </Title>
            <ol style={{ paddingLeft: "1.5rem", margin: 0 }}>
              {manifest.citations.map((citation) => (
                <li key={citation.id} style={{ marginBottom: 4 }}>
                  <Text
                    size="sm"
                    component="span"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {citation.url ? (
                      <a
                        href={citation.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: "var(--module-accent)" }}
                      >
                        {citation.text}
                      </a>
                    ) : (
                      citation.text
                    )}
                  </Text>
                </li>
              ))}
            </ol>
          </Paper>
        )}

        {nextModule && (
          <Stack align="center" gap="sm" py="xl">
            <Text size="sm" style={{ color: "var(--text-tertiary)" }}>
              Next module
            </Text>
            <Button
              component={Link}
              href={`/learn/${nextModule.slug}`}
              size="lg"
              style={{ backgroundColor: "var(--module-accent)" }}
            >
              {nextModule.title} →
            </Button>
          </Stack>
        )}
      </Stack>
    </footer>
  );
}
