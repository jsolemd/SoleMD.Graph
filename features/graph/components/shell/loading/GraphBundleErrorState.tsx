"use client";

import { Button, Stack, Text } from "@mantine/core";
import { panelSurfaceStyle, panelTextStyle, panelTextDimStyle } from "../../panels/PanelShell";

export function GraphBundleErrorState({ error }: { error: Error }) {
  return (
    <div
      className="fixed inset-0 flex items-center justify-center px-6"
      style={{ backgroundColor: "var(--graph-bg)" }}
    >
      <div
        className="w-[min(520px,92vw)] rounded-3xl px-6 py-7"
        style={panelSurfaceStyle}
      >
        <Stack gap="md">
          <div>
            <Text
              size="xs"
              fw={700}
              style={{
                color: "var(--graph-panel-text-muted)",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              Graph Bundle
            </Text>
            <Text
              mt={4}
              size="lg"
              fw={600}
              style={panelTextStyle}
            >
              Bundle load failed
            </Text>
          </div>

          <Text size="sm" style={panelTextDimStyle}>
            {error.message}
          </Text>

          <Button
            variant="outline"
            onClick={() => window.location.reload()}
            styles={{
              root: {
                alignSelf: "flex-start",
                borderColor: "var(--brand-accent)",
                color: "var(--graph-panel-text)",
              },
            }}
          >
            Reload
          </Button>
        </Stack>
      </div>
    </div>
  );
}
