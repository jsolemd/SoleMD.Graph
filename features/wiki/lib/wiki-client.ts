import {
  normalizeWikiPageBundleResponse,
  normalizeWikiPageContextResponse,
  normalizeWikiPageResponse,
} from "@/lib/engine/wiki-normalize";
import {
  buildWikiPageBundleClientPath,
  buildWikiPageClientPath,
  buildWikiPageContextClientPath,
  encodeWikiSlug,
} from "@/lib/engine/wiki-paths";
import type {
  WikiBacklinksResponse,
  WikiGraphResponse,
  WikiPageBundleResponse,
  WikiPageContextResponse,
  WikiPageResponse,
  WikiSearchResponse,
} from "@/lib/engine/wiki-types";

interface WikiErrorPayload {
  detail?: unknown;
  error?: unknown;
  error_message?: unknown;
  message?: unknown;
}

export class WikiRequestError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "WikiRequestError";
    this.status = status;
  }
}

function resolveWikiErrorMessage(
  status: number,
  payload: WikiErrorPayload | null,
  fallback: string,
): string {
  if (!payload || typeof payload !== "object") {
    return `${fallback} (${status})`;
  }

  for (const candidate of [
    payload.message,
    payload.error,
    payload.error_message,
    payload.detail,
  ]) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate;
    }
  }

  return `${fallback} (${status})`;
}

async function requestWikiJson<TResponse>(
  input: string,
  init?: RequestInit,
  fallbackMessage = "Wiki request failed",
): Promise<TResponse> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(input, {
    ...init,
    headers,
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => null)) as
    | TResponse
    | WikiErrorPayload
    | null;

  if (!response.ok) {
    throw new WikiRequestError(
      response.status,
      resolveWikiErrorMessage(
        response.status,
        payload as WikiErrorPayload | null,
        fallbackMessage,
      ),
    );
  }

  return payload as TResponse;
}

export async function fetchWikiPageBundleClient(
  slug: string,
  graphReleaseId?: string,
  options?: { signal?: AbortSignal },
): Promise<WikiPageBundleResponse | null> {
  const path = buildWikiPageBundleClientPath(slug, { graphReleaseId });

  try {
    return normalizeWikiPageBundleResponse(
      await requestWikiJson<WikiPageBundleResponse>(
        path,
        { method: "GET", signal: options?.signal },
        "Failed to load wiki page bundle",
      ),
    );
  } catch (error) {
    if (error instanceof WikiRequestError && error.status === 404) {
      return null;
    }
    throw error;
  }
}

export async function fetchWikiPageClient(
  slug: string,
  graphReleaseId?: string,
  options?: { signal?: AbortSignal },
): Promise<WikiPageResponse | null> {
  const path = buildWikiPageClientPath(slug, {
    graphReleaseId,
  });

  try {
    return normalizeWikiPageResponse(
      await requestWikiJson<WikiPageResponse>(
        path,
        { method: "GET", signal: options?.signal },
        "Failed to load wiki page",
      ),
    );
  } catch (error) {
    if (error instanceof WikiRequestError && error.status === 404) {
      return null;
    }
    throw error;
  }
}

export async function fetchWikiPageContextClient(
  slug: string,
  graphReleaseId?: string,
  options?: { signal?: AbortSignal },
): Promise<WikiPageContextResponse | null> {
  const path = buildWikiPageContextClientPath(slug, {
    graphReleaseId,
  });

  try {
    return normalizeWikiPageContextResponse(
      await requestWikiJson<WikiPageContextResponse | null>(
        path,
        { method: "GET", signal: options?.signal },
        "Failed to load wiki page context",
      ),
    );
  } catch (error) {
    if (error instanceof WikiRequestError && error.status === 404) {
      return null;
    }
    throw error;
  }
}

export async function fetchWikiBacklinksClient(
  slug: string,
  options?: { signal?: AbortSignal },
): Promise<WikiBacklinksResponse> {
  return requestWikiJson<WikiBacklinksResponse>(
    `/api/wiki/backlinks/${encodeWikiSlug(slug)}`,
    { method: "GET", signal: options?.signal },
    "Failed to load wiki backlinks",
  );
}

export async function searchWikiPagesClient(
  query: string,
  limit = 20,
  options?: { signal?: AbortSignal },
): Promise<WikiSearchResponse> {
  const params = new URLSearchParams({
    q: query,
    limit: String(limit),
  });

  return requestWikiJson<WikiSearchResponse>(
    `/api/wiki/search?${params.toString()}`,
    { method: "GET", signal: options?.signal },
    "Failed to search wiki pages",
  );
}

export async function fetchWikiGraphClient(
  graphReleaseId: string,
  options?: { signal?: AbortSignal },
): Promise<WikiGraphResponse> {
  const params = new URLSearchParams({
    graph_release_id: graphReleaseId,
  });

  return requestWikiJson<WikiGraphResponse>(
    `/api/wiki/graph?${params.toString()}`,
    { method: "GET", signal: options?.signal },
    "Failed to load wiki graph",
  );
}
