/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import { MantineProvider } from "@mantine/core";
import { PanelChrome } from "../PanelChrome";

// Mock framer-motion
jest.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...rest }: React.PropsWithChildren<Record<string, unknown>>) => (
      <div {...rest}>{children}</div>
    ),
  },
  AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

describe("PanelChrome", () => {
  it("renders title text", () => {
    render(
      <MantineProvider>
        <PanelChrome title="Test" onClose={jest.fn()}>
          <div>content</div>
        </PanelChrome>
      </MantineProvider>,
    );
    expect(screen.getByText("Test")).toBeInTheDocument();
  });

  it("renders children", () => {
    render(
      <MantineProvider>
        <PanelChrome title="Test" onClose={jest.fn()}>
          <div data-testid="child">content</div>
        </PanelChrome>
      </MantineProvider>,
    );
    expect(screen.getByTestId("child")).toBeInTheDocument();
  });

  it("renders headerActions", () => {
    render(
      <MantineProvider>
        <PanelChrome
          title="Test"
          onClose={jest.fn()}
          headerActions={<span data-testid="action">action</span>}
        >
          <div>content</div>
        </PanelChrome>
      </MantineProvider>,
    );
    expect(screen.getByTestId("action")).toBeInTheDocument();
  });

  it("renders headerNavigation", () => {
    render(
      <MantineProvider>
        <PanelChrome
          title="Test"
          onClose={jest.fn()}
          headerNavigation={<span data-testid="nav">nav</span>}
        >
          <div>content</div>
        </PanelChrome>
      </MantineProvider>,
    );
    expect(screen.getByTestId("nav")).toBeInTheDocument();
  });

  it("calls onClose on Escape", () => {
    const onClose = jest.fn();
    render(
      <MantineProvider>
        <PanelChrome title="Test" onClose={onClose}>
          <div>content</div>
        </PanelChrome>
      </MantineProvider>,
    );
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose on close button click", () => {
    const onClose = jest.fn();
    render(
      <MantineProvider>
        <PanelChrome title="Test" onClose={onClose}>
          <div>content</div>
        </PanelChrome>
      </MantineProvider>,
    );
    screen.getByLabelText("Close test panel").click();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("only starts drag from the title handle, not header controls", () => {
    const onTitlePointerDown = jest.fn();
    const { container } = render(
      <MantineProvider>
        <PanelChrome
          title="Test"
          onClose={jest.fn()}
          onTitlePointerDown={onTitlePointerDown}
          headerNavigation={<button type="button">Back</button>}
          headerActions={<button type="button">Search</button>}
        >
          <div>content</div>
        </PanelChrome>
      </MantineProvider>,
    );

    const dragHandle = container.querySelector('[data-panel-drag-handle="true"]');

    fireEvent.pointerDown(dragHandle as HTMLElement);
    expect(onTitlePointerDown).toHaveBeenCalledTimes(1);

    fireEvent.pointerDown(screen.getByText("Test"));
    expect(onTitlePointerDown).toHaveBeenCalledTimes(2);

    fireEvent.pointerDown(screen.getByText("Back"));
    fireEvent.pointerDown(screen.getByText("Search"));
    fireEvent.pointerDown(screen.getByLabelText("Close test panel"));
    expect(onTitlePointerDown).toHaveBeenCalledTimes(2);
  });

  it("renders and calls panel zoom controls", () => {
    const onIncreaseScale = jest.fn();
    const onDecreaseScale = jest.fn();
    const onResetScale = jest.fn();

    render(
      <MantineProvider>
        <PanelChrome
          title="Test"
          onClose={jest.fn()}
          panelScale={1.2}
          canIncreaseScale
          canDecreaseScale
          onIncreaseScale={onIncreaseScale}
          onDecreaseScale={onDecreaseScale}
          onResetScale={onResetScale}
        >
          <div>content</div>
        </PanelChrome>
      </MantineProvider>,
    );

    expect(screen.getByText("120%")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Increase panel text size"));
    fireEvent.click(screen.getByLabelText("Decrease panel text size"));
    fireEvent.click(screen.getByLabelText("Reset panel text size"));
    expect(onIncreaseScale).toHaveBeenCalledTimes(1);
    expect(onDecreaseScale).toHaveBeenCalledTimes(1);
    expect(onResetScale).toHaveBeenCalledTimes(1);
  });
});
