import { Button, Title, Text, Stack } from "@mantine/core";
import { Home } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4">
      <Stack gap="xl" align="center" className="max-w-md text-center">
        <div>
          <Text
            className="text-8xl font-bold"
            style={{ color: "var(--brand-accent-alt)", opacity: 0.3 }}
          >
            404
          </Text>
          <Title order={2} style={{ color: "var(--foreground)" }}>
            Page not found
          </Title>
          <Text
            size="lg"
            className="mt-2"
            style={{ color: "var(--text-secondary)" }}
          >
            The page you are looking for does not exist or has been moved.
          </Text>
        </div>

        <Button
          component="a"
          href="/"
          leftSection={<Home size={16} />}
          variant="filled"
          styles={{
            root: { backgroundColor: "var(--brand-accent-alt)" },
          }}
        >
          Go home
        </Button>
      </Stack>
    </div>
  );
}
