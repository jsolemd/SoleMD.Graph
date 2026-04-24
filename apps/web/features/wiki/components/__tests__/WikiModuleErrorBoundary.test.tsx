/**
 * @jest-environment jsdom
 */
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { MantineProvider } from "@mantine/core";
import React from "react";

import { WikiModuleErrorBoundary } from "../WikiModuleErrorBoundary";

function Explode({ message = "boom" }: { message?: string }): never {
  throw new Error(message);
}

function renderWithProvider(ui: React.ReactElement) {
  return render(<MantineProvider>{ui}</MantineProvider>);
}

describe("WikiModuleErrorBoundary", () => {
  const errorSpy = jest
    .spyOn(console, "error")
    .mockImplementation(() => undefined);

  afterAll(() => {
    errorSpy.mockRestore();
  });

  beforeEach(() => {
    errorSpy.mockClear();
  });

  it("renders children when no error", () => {
    renderWithProvider(
      <WikiModuleErrorBoundary resetKey="modules/a">
        <div>ok-content</div>
      </WikiModuleErrorBoundary>,
    );
    expect(screen.getByText("ok-content")).toBeInTheDocument();
  });

  it("renders fallback with retry button when a child throws", () => {
    renderWithProvider(
      <WikiModuleErrorBoundary resetKey="modules/a">
        <Explode message="chunk load failed" />
      </WikiModuleErrorBoundary>,
    );

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText(/module failed to load/i)).toBeInTheDocument();
    expect(screen.getByText(/chunk load failed/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /retry/i }),
    ).toBeInTheDocument();
    expect(errorSpy).toHaveBeenCalled();
  });

  it("resets to children when retry is clicked after the child stops throwing", async () => {
    const user = userEvent.setup();
    let shouldThrow = true;

    function Flaky() {
      if (shouldThrow) throw new Error("transient");
      return <div>recovered</div>;
    }

    renderWithProvider(
      <WikiModuleErrorBoundary resetKey="modules/a">
        <Flaky />
      </WikiModuleErrorBoundary>,
    );

    expect(screen.getByRole("alert")).toBeInTheDocument();

    shouldThrow = false;
    await user.click(screen.getByRole("button", { name: /retry/i }));

    expect(screen.getByText("recovered")).toBeInTheDocument();
  });

  it("auto-resets when resetKey (slug) changes", () => {
    let shouldThrow = true;
    function Flaky() {
      if (shouldThrow) throw new Error("first-slug-error");
      return <div>second-slug-ok</div>;
    }

    const { rerender } = renderWithProvider(
      <WikiModuleErrorBoundary resetKey="modules/a">
        <Flaky />
      </WikiModuleErrorBoundary>,
    );

    expect(screen.getByRole("alert")).toBeInTheDocument();

    shouldThrow = false;
    act(() => {
      rerender(
        <MantineProvider>
          <WikiModuleErrorBoundary resetKey="modules/b">
            <Flaky />
          </WikiModuleErrorBoundary>
        </MantineProvider>,
      );
    });

    expect(screen.getByText("second-slug-ok")).toBeInTheDocument();
  });
});
