import { jest } from "@jest/globals";

/**
 * Swap the useCosmograph mock to return a different value for null-cosmograph
 * test suites. Avoids jest.resetModules() which creates a second React
 * instance and breaks hook rules.
 */
export function swapCosmographMock(
  mockCosmograph: Record<string, unknown> | null,
) {
  (
    jest.requireMock("@cosmograph/react") as Record<string, unknown>
  ).useCosmograph = () => ({ cosmograph: mockCosmograph });
}
