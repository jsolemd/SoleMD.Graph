/**
 * @jest-environment jsdom
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { EntityHoverCard } from "../EntityHoverCard";

describe("EntityHoverCard", () => {
  it("renders entity detail with metadata pills and action icons", () => {
    const handleShowOnGraph = jest.fn();
    const handleOpenWiki = jest.fn();

    render(
      <MantineProvider>
        <EntityHoverCard
          card={{
            x: 12,
            y: 24,
            entity: {
              entityType: "disease",
              conceptNamespace: "mesh",
              conceptId: "D012559",
              sourceIdentifier: "MESH:D012559",
              canonicalName: "Schizophrenia",
            },
            label: "Schizophrenia",
            entityType: "disease",
            conceptId: "D012559",
            conceptNamespace: "mesh",
            paperCount: 1200,
            aliases: [
              { aliasText: "schizophrenic disorder", isCanonical: true, aliasSource: "mesh" },
              { aliasText: "schizophrenia spectrum disorder", isCanonical: false, aliasSource: null },
            ],
            detailReady: true,
          }}
          onShowOnGraph={handleShowOnGraph}
          onOpenWiki={handleOpenWiki}
        />
      </MantineProvider>,
    );

    expect(screen.getByText("Schizophrenia")).toBeTruthy();
    expect(screen.getByText("disease")).toBeTruthy();
    expect(screen.getByText("mesh:D012559")).toBeTruthy();
    expect(screen.getByText(/1,200/)).toBeTruthy();
    expect(screen.getByText("schizophrenic disorder")).toBeTruthy();
    expect(screen.getByText("schizophrenia spectrum disorder")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Show on graph" }));
    fireEvent.click(screen.getByRole("button", { name: "Open wiki" }));

    expect(handleShowOnGraph).toHaveBeenCalledWith({
      entityType: "disease",
      conceptNamespace: "mesh",
      conceptId: "D012559",
      sourceIdentifier: "MESH:D012559",
      canonicalName: "Schizophrenia",
    });
    expect(handleOpenWiki).toHaveBeenCalledWith({
      entityType: "disease",
      conceptNamespace: "mesh",
      conceptId: "D012559",
      sourceIdentifier: "MESH:D012559",
      canonicalName: "Schizophrenia",
    });
  });

  it("positions the hover card above the hovered entity anchor", () => {
    const { container } = render(
      <EntityHoverCard
        card={{
          x: 12,
          y: 24,
          entity: {
            entityType: "disease",
            conceptNamespace: "mesh",
            conceptId: "D012559",
            sourceIdentifier: "MESH:D012559",
            canonicalName: "Schizophrenia",
          },
          label: "Schizophrenia",
          entityType: "disease",
          conceptId: "D012559",
          conceptNamespace: "mesh",
          paperCount: 1200,
          aliases: [],
          detailReady: true,
        }}
      />,
    );

    const card = container.firstElementChild as HTMLDivElement;

    expect(card.style.top).toBe("24px");
    expect(card.style.transform).toBe("translateY(-100%)");
    expect(card.style.pointerEvents).toBe("auto");
  });
});
