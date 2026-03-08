"use client";

import { Button, Title, Text, Stack } from "@mantine/core";
import { RefreshCw, Home } from "lucide-react";

export default function Error({
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
            style={{ color: "var(--color-warm-coral)", opacity: 0.3 }}
          >
            Error
          </Text>
          <Title order={2} style={{ color: "var(--foreground)" }}>
            Something went wrong
          </Title>
          <Text
            size="lg"
            className="mt-2"
            style={{ color: "var(--text-secondary)" }}
          >
            An unexpected error occurred. Please try again or return to the
            homepage.
          </Text>
        </div>

        <div className="flex gap-3">
          <Button
            onClick={reset}
            leftSection={<RefreshCw size={16} />}
            variant="filled"
            styles={{
              root: { backgroundColor: "var(--brand-accent-alt)" },
            }}
          >
            Try again
          </Button>
          <Button
            component="a"
            href="/"
            leftSection={<Home size={16} />}
            variant="outline"
            styles={{
              root: {
                borderColor: "var(--border-default)",
                color: "var(--foreground)",
              },
            }}
          >
            Go home
          </Button>
        </div>
      </Stack>
    </div>
  );
}
