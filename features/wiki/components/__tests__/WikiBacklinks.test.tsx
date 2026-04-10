/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import { MantineProvider } from "@mantine/core";
import { WikiBacklinks } from "../WikiBacklinks";

// Mock framer-motion
jest.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...rest }: React.PropsWithChildren<Record<string, unknown>>) => (
      <div {...rest}>{children}</div>
    ),
  },
  AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

const mockBacklinks = [
  { slug: "entities/sleep", title: "Sleep", entity_type: "Disease", family_key: null, tags: [] },
  { slug: "entities/circadian", title: "Circadian Rhythm", entity_type: "Gene", family_key: null, tags: [] },
];

describe("WikiBacklinks", () => {
  it("renders nothing when backlinks is empty", () => {
    render(
      <MantineProvider>
        <WikiBacklinks backlinks={[]} onNavigate={jest.fn()} />
      </MantineProvider>,
    );
    expect(screen.queryByText("Backlinks")).not.toBeInTheDocument();
  });

  it("renders backlink titles", () => {
    render(
      <MantineProvider>
        <WikiBacklinks backlinks={mockBacklinks} onNavigate={jest.fn()} />
      </MantineProvider>,
    );
    expect(screen.getByText("Backlinks")).toBeInTheDocument();
    expect(screen.getByText("Sleep")).toBeInTheDocument();
    expect(screen.getByText("Circadian Rhythm")).toBeInTheDocument();
  });

  it("calls onNavigate on click", () => {
    const onNavigate = jest.fn();
    render(
      <MantineProvider>
        <WikiBacklinks backlinks={mockBacklinks} onNavigate={onNavigate} />
      </MantineProvider>,
    );
    fireEvent.click(screen.getByText("Sleep"));
    expect(onNavigate).toHaveBeenCalledWith("entities/sleep");
  });
});
