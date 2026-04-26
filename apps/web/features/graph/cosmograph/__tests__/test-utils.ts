import { jest } from "@jest/globals";

/**
 * Swap the cosmograph mocks for null-cosmograph test suites. Avoids
 * jest.resetModules() which creates a second React instance and breaks hook
 * rules. Both useCosmograph (the throwing upstream hook) and
 * useCosmographInternal (the null-tolerant variant our adapters use) are
 * swapped together so adapters that switched to the internal hook still
 * observe the swap.
 */
export function swapCosmographMock(
  mockCosmograph: Record<string, unknown> | null,
) {
  const reactMock = jest.requireMock("@cosmograph/react") as Record<
    string,
    unknown
  >;
  reactMock.useCosmograph = () => ({ cosmograph: mockCosmograph });
  reactMock.useCosmographInternal = () =>
    mockCosmograph != null ? { cosmograph: mockCosmograph } : null;
}
