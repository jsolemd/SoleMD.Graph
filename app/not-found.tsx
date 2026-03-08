import Link from "next/link";
import { Button, Title, Text, Stack } from "@mantine/core";
import { Home } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4">
      <Stack gap="xl" align="center" className="max-w-md text-center">
        <div>
          <Text
            className="text-8xl font-bold"
            style={{ color: "var(--color-soft-blue)", opacity: 0.3 }}
          >
            404
          </Text>
          <Title order={2} style={{ color: "var(--foreground)" }}>
            Page not found
          </Title>
          <Text
            size="lg"
            className="mt-2"
            style={{ color: "var(--foreground)", opacity: 0.7 }}
          >
            The page you are looking for does not exist or has been moved.
          </Text>
        </div>

        <Button
          component={Link}
          href="/"
          leftSection={<Home size={16} />}
          variant="filled"
          radius="xl"
          styles={{
            root: {
              backgroundColor: "var(--color-soft-blue)",
            },
          }}
        >
          Go home
        </Button>
      </Stack>
    </div>
  );
}
