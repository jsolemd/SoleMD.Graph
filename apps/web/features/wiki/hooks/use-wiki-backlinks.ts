"use client";

import { useEffect, useState } from "react";
import type { WikiPageSummary } from "@solemd/api-client/shared/wiki-types";
import { fetchWikiBacklinksClient } from "@solemd/api-client/client/wiki-client";

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

export function useWikiBacklinks(slug: string | null) {
  const [backlinks, setBacklinks] = useState<WikiPageSummary[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!slug) {
      setBacklinks([]);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setBacklinks([]);
    setLoading(true);
    fetchWikiBacklinksClient(slug, { signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) {
          setBacklinks(result.backlinks);
          setLoading(false);
        }
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted && !isAbortError(error)) {
          setBacklinks([]);
          setLoading(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [slug]);

  return { backlinks, loading };
}
