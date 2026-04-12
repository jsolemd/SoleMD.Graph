"use client";
/**
 * NotoLibrary — browsable grid of every Lottie in the Noto library.
 *
 * Reads `/animations/_assets/lottie/library/noto/catalog.json`, groups
 * by tier (core / relevant / tangential), and renders each entry as a
 * small <NotoLottie> tile with a live-text filter. Each tile only
 * mounts its Lottie player once it has entered the viewport, so the
 * initial load fetches nothing until you scroll the card into view.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { canvasReveal } from "@/lib/motion";
import NotoLottie, {
  loadNotoCatalog,
  type NotoCatalogEntry,
} from "@/features/animations/lottie/NotoLottie";

type Catalog = {
  source: string;
  license: string;
  entries: NotoCatalogEntry[];
};

const TIER_ORDER = ["core", "relevant", "tangential"] as const;
const TIER_LABEL: Record<(typeof TIER_ORDER)[number], string> = {
  core: "Core",
  relevant: "Relevant",
  tangential: "Tangential",
};

function LazyTile({ entry }: { entry: NotoCatalogEntry }) {
  const ref = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    if (seen) return;
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true);
          io.disconnect();
        }
      },
      { rootMargin: "120px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);

  return (
    <div
      ref={ref}
      title={`${entry.emoji}  ${entry.slug}\n${entry.note}`}
      className="flex flex-col items-center gap-1 rounded-[0.5rem] p-2 transition-colors hover:bg-[var(--surface-alt)]"
    >
      {seen ? (
        <NotoLottie name={entry.slug} size={64} />
      ) : (
        <div
          aria-hidden
          style={{
            width: 64,
            height: 64,
            background: "var(--surface-alt)",
            borderRadius: 12,
          }}
        />
      )}
      <span
        className="max-w-full truncate text-[10px] font-mono"
        style={{ color: "var(--text-secondary)" }}
      >
        {entry.slug}
      </span>
    </div>
  );
}

export default function NotoLibrary() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    loadNotoCatalog()
      .then((c) => setCatalog(c as Catalog))
      .catch((err) => setError(String(err)));
  }, []);

  const groups = useMemo(() => {
    if (!catalog) return [];
    const q = query.trim().toLowerCase();
    const filtered = q
      ? catalog.entries.filter(
          (e) =>
            e.slug.includes(q) ||
            e.note.toLowerCase().includes(q) ||
            e.codepoint.includes(q) ||
            e.emoji.includes(q),
        )
      : catalog.entries;
    return TIER_ORDER.map((tier) => ({
      tier,
      items: filtered.filter((e) => e.tier === tier),
    })).filter((g) => g.items.length);
  }, [catalog, query]);

  if (error) {
    return (
      <div
        className="flex h-[200px] w-full items-center justify-center text-xs"
        style={{ color: "var(--text-secondary)" }}
      >
        Failed to load catalog: {error}
      </div>
    );
  }

  if (!catalog) {
    return (
      <div
        className="flex h-[200px] w-full items-center justify-center text-xs"
        style={{ color: "var(--text-secondary)" }}
      >
        loading noto library…
      </div>
    );
  }

  const totalFiltered = groups.reduce((sum, g) => sum + g.items.length, 0);

  return (
    <motion.div {...canvasReveal} className="flex w-full flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="filter: brain, anxious, sleep, heart…"
          className="flex-1 rounded-[0.5rem] border border-[var(--border-subtle)] bg-[var(--surface-alt)] px-3 py-1.5 text-xs font-mono outline-none focus:border-[var(--color-soft-blue)]"
          style={{ color: "var(--text-primary)" }}
        />
        <span
          className="shrink-0 text-xs font-mono"
          style={{ color: "var(--text-secondary)" }}
        >
          {totalFiltered} / {catalog.entries.length}
        </span>
      </div>

      {groups.map((g) => (
        <div key={g.tier} className="flex flex-col gap-2">
          <div className="flex items-baseline gap-3 border-b border-[var(--border-subtle)] pb-1">
            <span
              className="text-xs font-medium uppercase tracking-wide"
              style={{ color: "var(--text-primary)" }}
            >
              {TIER_LABEL[g.tier]}
            </span>
            <span
              className="text-xs font-mono"
              style={{ color: "var(--text-secondary)" }}
            >
              {g.items.length}
            </span>
          </div>
          <div className="grid grid-cols-4 gap-3 sm:grid-cols-6 md:grid-cols-8">
            {g.items.map((e) => (
              <LazyTile key={e.codepoint} entry={e} />
            ))}
          </div>
        </div>
      ))}

      {totalFiltered === 0 && (
        <div
          className="py-6 text-center text-xs"
          style={{ color: "var(--text-secondary)" }}
        >
          No matches for &ldquo;{query}&rdquo;
        </div>
      )}
    </motion.div>
  );
}
