"use client";

import { Button, Title, Text, Stack } from "@mantine/core";
import { RefreshCw, BookOpen } from "lucide-react";

export default function EducationError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4">
      <Stack gap="xl" align="center" className="max-w-md text-center">
        <div>
          <Text
            className="text-6xl font-bold"
            style={{ color: "var(--color-fresh-green)", opacity: 0.3 }}
          >
            Error
          </Text>
          <Title order={2} style={{ color: "var(--foreground)" }}>
            Education module error
          </Title>
          <Text
            size="lg"
            className="mt-2"
            style={{ color: "var(--foreground)", opacity: 0.7 }}
          >
            This education module encountered an error. Please try again or
            explore other modules.
          </Text>
        </div>

        <div className="flex gap-3">
          <Button
            onClick={reset}
            leftSection={<RefreshCw size={16} />}
            variant="filled"
            radius="xl"
            styles={{
              root: {
                backgroundColor: "var(--color-fresh-green)",
              },
            }}
          >
            Try again
          </Button>
          <Button
            component="a"
            href="/education"
            leftSection={<BookOpen size={16} />}
            variant="outline"
            radius="xl"
            styles={{
              root: {
                borderColor: "var(--border)",
                color: "var(--foreground)",
              },
            }}
          >
            Browse modules
          </Button>
        </div>
      </Stack>
    </div>
  );
}
