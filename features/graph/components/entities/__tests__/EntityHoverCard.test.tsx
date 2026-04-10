/**
 * @jest-environment jsdom
 */
import { render, screen } from "@testing-library/react";
import { EntityHoverCard } from "../EntityHoverCard";

describe("EntityHoverCard", () => {
  it("renders reusable entity detail content without editor-specific assumptions", () => {
    render(
      <EntityHoverCard
        card={{
          x: 12,
          y: 24,
          label: "Schizophrenia",
          entityType: "disease",
          paperCount: 1200,
          aliases: ["schizophrenic disorder", "schizophrenia spectrum disorder"],
          summary: null,
          detailReady: true,
        }}
      />,
    );

    expect(screen.getByText("Schizophrenia")).toBeTruthy();
    expect(screen.getByText("disease")).toBeTruthy();
    expect(screen.getByText("1,200 linked papers")).toBeTruthy();
    expect(
      screen.getByText(
        "Also known as schizophrenic disorder, schizophrenia spectrum disorder",
      ),
    ).toBeTruthy();
  });
});
