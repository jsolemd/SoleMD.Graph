/**
 * @jest-environment jsdom
 */
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";

let mockColorScheme: "light" | "dark" = "light";

jest.mock("@mantine/core", () => {
  const actual = jest.requireActual("@mantine/core");
  return {
    ...actual,
    useComputedColorScheme: () => mockColorScheme,
  };
});

import { MantineProvider } from "@mantine/core";
import { useDashboardStore } from "@/features/graph/stores";
import { getGraphPaletteColors, getPaletteColors } from "@/features/graph/lib/colors";
import { ColorConfig } from "../ColorConfig";

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

function normalizeBackgroundColor(color: string) {
  const probe = document.createElement("div");
  probe.style.backgroundColor = color;
  return probe.style.backgroundColor;
}

beforeAll(() => {
  global.ResizeObserver = ResizeObserverMock as typeof ResizeObserver;
});

beforeEach(() => {
  useDashboardStore.setState({
    ...useDashboardStore.getInitialState(),
    colorScheme: "rainbow",
  });
  mockColorScheme = "light";
});

describe("ColorConfig", () => {
  it("mirrors the graph render palette in light mode instead of the UI-theme palette", () => {
    render(
      <MantineProvider>
        <ColorConfig activeLayer="corpus" />
      </MantineProvider>,
    );

    const preview = screen.getByRole("img", { name: "rainbow color palette" });
    const swatches = preview.querySelectorAll<HTMLDivElement>("div[aria-hidden='true']");

    expect(preview).toHaveClass("graph-render-color-preview");
    expect(swatches).toHaveLength(getGraphPaletteColors("rainbow").length);
    expect(swatches[0]?.style.backgroundColor).toBe(
      normalizeBackgroundColor(getGraphPaletteColors("rainbow")[0]),
    );
    expect(swatches[0]?.style.backgroundColor).not.toBe(
      normalizeBackgroundColor(getPaletteColors("rainbow", "light")[0]),
    );
  });
});
