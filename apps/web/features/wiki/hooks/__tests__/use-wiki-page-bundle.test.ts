/**
 * @jest-environment jsdom
 */
import { act, renderHook, waitFor } from "@testing-library/react";

import {
  fetchWikiBacklinksClient,
  fetchWikiPageClient,
  fetchWikiPageContextClient,
} from "@solemd/api-client/client/wiki-client";
import { useWikiPageBundle } from "../use-wiki-page-bundle";

jest.mock("@solemd/api-client/client/wiki-client", () => ({
  fetchWikiPageClient: jest.fn(),
  fetchWikiBacklinksClient: jest.fn(),
  fetchWikiPageContextClient: jest.fn(),
}));

const fetchWikiPageClientMock = jest.mocked(fetchWikiPageClient);
const fetchWikiBacklinksClientMock = jest.mocked(fetchWikiBacklinksClient);
const fetchWikiPageContextClientMock = jest.mocked(fetchWikiPageContextClient);

type DeferredMap = Map<string, { resolve: (value: unknown) => void }>;

function makeDeferredPageFetch() {
  const pending: DeferredMap = new Map();
  fetchWikiPageClientMock.mockImplementation((slug: string) => {
    return new Promise((resolve) => {
      pending.set(slug, { resolve: resolve as (value: unknown) => void });
    });
  });
  return pending;
}

describe("useWikiPageBundle — abort race", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    fetchWikiBacklinksClientMock.mockResolvedValue({
      slug: "",
      backlinks: [],
    });
    fetchWikiPageContextClientMock.mockResolvedValue(null);
  });

  it("ignores fetch-1's late resolution when fetch-2 has already resolved for a newer slug", async () => {
    const pending = makeDeferredPageFetch();

    const page1 = { slug: "sections/slug-1", title: "Slug 1" } as unknown;
    const page2 = { slug: "sections/slug-2", title: "Slug 2" } as unknown;

    const { result, rerender } = renderHook(
      ({ slug }: { slug: string }) => useWikiPageBundle(slug),
      { initialProps: { slug: "sections/slug-1" } },
    );

    // Fire slug-2 before slug-1 resolves
    rerender({ slug: "sections/slug-2" });

    await waitFor(() => {
      expect(pending.has("sections/slug-2")).toBe(true);
    });

    // Resolve slug-2 first (the new request wins the race)
    await act(async () => {
      pending.get("sections/slug-2")!.resolve(page2);
    });

    await waitFor(() => {
      expect(result.current.page).toBe(page2);
    });

    // Now resolve slug-1's late response. It must NOT clobber slug-2.
    await act(async () => {
      pending.get("sections/slug-1")!.resolve(page1);
    });

    // Give any stray microtasks a chance to flush.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.page).toBe(page2);
    expect(result.current.page).not.toBe(page1);
  });

  it("does not transition into the error state after abort", async () => {
    fetchWikiPageClientMock.mockImplementation(
      (_slug: string, _rev: string | undefined, opts?: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          opts?.signal?.addEventListener("abort", () => {
            const err = new Error("aborted");
            err.name = "AbortError";
            reject(err);
          });
        }),
    );

    const { result, rerender, unmount } = renderHook(
      ({ slug }: { slug: string | null }) => useWikiPageBundle(slug),
      { initialProps: { slug: "sections/a" } },
    );

    rerender({ slug: null });
    unmount();

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.error).toBeNull();
  });
});
