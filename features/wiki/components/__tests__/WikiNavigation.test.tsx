/**
 * @jest-environment jsdom
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { MantineProvider } from "@mantine/core";
import { useWikiStore } from "@/features/wiki/stores/wiki-store";

// Mock framer-motion (used by Mantine Tooltip)
jest.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...rest }: React.PropsWithChildren<Record<string, unknown>>) => (
      <div {...rest}>{children}</div>
    ),
  },
  AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

import { WikiNavigation } from "../WikiNavigation";

function renderNav() {
  return render(
    <MantineProvider>
      <WikiNavigation />
    </MantineProvider>,
  );
}

describe("WikiNavigation", () => {
  beforeEach(() => {
    useWikiStore.getState().reset();
  });

  it("disables both buttons when no history", () => {
    renderNav();
    expect(screen.getByLabelText("Go back")).toBeDisabled();
    expect(screen.getByLabelText("Go forward")).toBeDisabled();
  });

  it("enables back after navigating to a second page", () => {
    const { navigateTo } = useWikiStore.getState();
    navigateTo("page-a");
    navigateTo("page-b");
    renderNav();
    expect(screen.getByLabelText("Go back")).not.toBeDisabled();
    expect(screen.getByLabelText("Go forward")).toBeDisabled();
  });

  it("enables forward after going back", () => {
    const { navigateTo, goBack } = useWikiStore.getState();
    navigateTo("page-a");
    navigateTo("page-b");
    goBack();
    renderNav();
    expect(screen.getByLabelText("Go back")).toBeDisabled();
    expect(screen.getByLabelText("Go forward")).not.toBeDisabled();
  });

  it("navigateTo is idempotent for current slug", () => {
    const { navigateTo } = useWikiStore.getState();
    navigateTo("page-a");
    navigateTo("page-a"); // should not create duplicate
    expect(useWikiStore.getState().slugHistory).toEqual(["page-a"]);
    expect(useWikiStore.getState().historyIndex).toBe(0);
  });
});
