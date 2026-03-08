import type { Metadata } from "next";
import { Title, Text, Stack, Badge } from "@mantine/core";
import { BookOpen } from "lucide-react";

export const metadata: Metadata = {
  title: "AI For MD",
  description:
    "Master the fundamentals of artificial intelligence in healthcare — interactive learning modules for medical professionals.",
};

export default function AIForMDPage() {
  return (
    <div
      className="min-h-[70vh] flex items-center justify-center px-4"
      style={{ backgroundColor: "var(--background)" }}
    >
      <Stack gap="xl" align="center" className="max-w-lg text-center">
        <div
          className="w-20 h-20 rounded-2xl flex items-center justify-center"
          style={{ backgroundColor: "var(--color-fresh-green)" }}
        >
          <BookOpen className="h-10 w-10 text-white" />
        </div>

        <div>
          <Badge
            size="lg"
            variant="light"
            color="green"
            radius="xl"
            className="mb-4"
          >
            In Development
          </Badge>
          <Title order={1} style={{ color: "var(--foreground)" }}>
            AI For MD: Foundations
          </Title>
          <Text
            size="lg"
            className="mt-4"
            style={{ color: "var(--foreground)", opacity: 0.7 }}
          >
            Interactive learning modules bridging artificial intelligence and
            clinical medicine are being rebuilt with a modern, graph-native
            architecture. Check back soon.
          </Text>
        </div>
      </Stack>
    </div>
  );
}
