"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { panelTextStyle } from "@/features/graph/components/panels/PanelShell";
import { useWikiStore } from "@/features/wiki/stores/wiki-store";

interface TocEntry {
  depth: number;
  text: string;
  slug: string;
}

interface WikiTocProps {
  scrollRef: React.RefObject<HTMLDivElement | null>;
}

/**
 * Minimalist Table of Contents — toggled from the header icon.
 * Reads heading IDs set by rehypeSlug, highlights current section
 * via IntersectionObserver (Quartz pattern).
 */
export function WikiToc({ scrollRef }: WikiTocProps) {
  const tocOpen = useWikiStore((s) => s.tocOpen);
  const [entries, setEntries] = useState<TocEntry[]>([]);
  const [inView, setInView] = useState<Set<string>>(new Set());
  const observerRef = useRef<IntersectionObserver | null>(null);

  // Extract headings after content renders
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const raf = requestAnimationFrame(() => {
      const headings = el.querySelectorAll<HTMLElement>(
        "h1[id], h2[id], h3[id], h4[id], h5[id], h6[id]",
      );
      const tocEntries: TocEntry[] = [];
      for (const h of headings) {
        tocEntries.push({
          depth: parseInt(h.tagName[1], 10),
          text: h.textContent?.trim() ?? "",
          slug: h.id,
        });
      }
      setEntries(tocEntries);

      observerRef.current?.disconnect();
      const observer = new IntersectionObserver(
        (observed) => {
          setInView((prev) => {
            const next = new Set(prev);
            for (const entry of observed) {
              if (entry.isIntersecting) next.add(entry.target.id);
              else next.delete(entry.target.id);
            }
            return next;
          });
        },
        { root: el, rootMargin: "0px 0px -80% 0px" },
      );
      observerRef.current = observer;
      for (const h of headings) observer.observe(h);
    });

    return () => {
      cancelAnimationFrame(raf);
      observerRef.current?.disconnect();
    };
  }, [scrollRef]);

  const handleClick = useCallback(
    (slug: string) => {
      scrollRef.current
        ?.querySelector(`#${CSS.escape(slug)}`)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    },
    [scrollRef],
  );

  if (!tocOpen || entries.length === 0) return null;

  const minDepth = Math.min(...entries.map((e) => e.depth));

  return (
    <div
      className="flex flex-col gap-0.5 pb-1.5 mb-1.5"
      style={{ borderBottom: "1px solid var(--graph-panel-border)" }}
    >
      {entries.map((entry) => (
        <button
          key={entry.slug}
          type="button"
          onClick={() => handleClick(entry.slug)}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "var(--mode-accent-subtle)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "";
          }}
          style={{
            all: "unset",
            display: "block",
            width: "100%",
            padding: "2px 6px",
            paddingLeft: `${(entry.depth - minDepth) * 10 + 6}px`,
            borderRadius: 4,
            cursor: "pointer",
            boxSizing: "border-box" as const,
            transition: "opacity 150ms, background-color 150ms",
            opacity: inView.has(entry.slug) ? 1 : 0.75,
            ...panelTextStyle,
            fontSize: 10,
            lineHeight: "1.6",
          }}
        >
          {entry.text}
        </button>
      ))}
    </div>
  );
}
