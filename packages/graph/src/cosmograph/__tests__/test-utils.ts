import { jest } from "@jest/globals";

/**
 * Swap the useCosmograph mock for null-cosmograph suites without resetting
 * modules and creating a second React instance.
 */
export function swapCosmographMock(mockCosmograph: Record<string, unknown> | null) {
  (jest.requireMock("@cosmograph/react") as Record<string, unknown>).useCosmograph = () => ({
    cosmograph: mockCosmograph,
  });
}
