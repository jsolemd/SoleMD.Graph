"use client";

import { useEffect, useState } from "react";
import { getWikiBacklinks } from "@/app/actions/wiki";
import type { WikiPageSummary } from "@/lib/engine/wiki-types";

export function useWikiBacklinks(slug: string | null) {
  const [backlinks, setBacklinks] = useState<WikiPageSummary[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!slug) {
      setBacklinks([]);
      return;
    }

    let cancelled = false;
    setLoading(true);
    getWikiBacklinks(slug)
      .then((result) => {
        if (!cancelled) {
          setBacklinks(result.backlinks);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setBacklinks([]);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [slug]);

  return { backlinks, loading };
}
