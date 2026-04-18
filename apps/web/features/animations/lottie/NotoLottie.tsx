"use client";
/**
 * NotoLottie — reusable renderer for Lotties in the Noto library.
 *
 * Resolves a slug (or codepoint) against `catalog.json` and plays the
 * matching Lottie file from `/animations/_assets/lottie/library/noto/`.
 * License: SIL Open Font License 1.1 (see LICENSE.txt in the library dir).
 *
 * Example:
 *   <NotoLottie name="brain" size={128} />
 *   <NotoLottie name="1f630" size={64} loop={false} />
 */
import { useEffect, useState, type CSSProperties } from "react";
import Lottie from "lottie-react";
import { useReducedMotionConfig as useReducedMotion } from "framer-motion";

type Tier = "core" | "relevant" | "tangential";

export type NotoCatalogEntry = {
  codepoint: string;
  emoji: string;
  slug: string;
  tier: Tier;
  note: string;
  file: string;
  bytes: number;
  source_url: string;
};

type Catalog = {
  source: string;
  license: string;
  entries: NotoCatalogEntry[];
};

const CATALOG_URL = "/animations/_assets/lottie/library/noto/catalog.json";
const LOTTIE_BASE = "/animations/_assets/lottie/library/noto/";

let catalogPromise: Promise<Catalog> | null = null;
export function loadNotoCatalog(): Promise<Catalog> {
  if (!catalogPromise) {
    catalogPromise = fetch(CATALOG_URL).then((r) => {
      if (!r.ok) throw new Error(`catalog ${r.status}`);
      return r.json();
    });
  }
  return catalogPromise;
}

const jsonCache = new Map<string, Promise<unknown>>();
function loadLottieJson(file: string): Promise<unknown> {
  let cached = jsonCache.get(file);
  if (!cached) {
    cached = fetch(LOTTIE_BASE + file).then((r) => {
      if (!r.ok) throw new Error(`lottie ${file} ${r.status}`);
      return r.json();
    });
    jsonCache.set(file, cached);
  }
  return cached;
}

export function findNotoEntry(
  catalog: Catalog,
  nameOrCodepoint: string,
): NotoCatalogEntry | undefined {
  const key = nameOrCodepoint.toLowerCase();
  return catalog.entries.find(
    (e) => e.slug === key || e.codepoint === key,
  );
}

export default function NotoLottie({
  name,
  size = 120,
  loop = true,
  className,
  style,
}: {
  name: string;
  size?: number;
  loop?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  const reduced = useReducedMotion();
  const [data, setData] = useState<unknown>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setMissing(false);
    setData(null);
    loadNotoCatalog()
      .then((catalog) => {
        const entry = findNotoEntry(catalog, name);
        if (!entry) {
          if (!cancelled) setMissing(true);
          return null;
        }
        return loadLottieJson(entry.file);
      })
      .then((json) => {
        if (!cancelled && json) setData(json);
      })
      .catch(() => {
        if (!cancelled) setMissing(true);
      });
    return () => {
      cancelled = true;
    };
  }, [name]);

  const boxStyle: CSSProperties = { width: size, height: size, ...style };

  if (missing) {
    return (
      <div
        aria-label={`noto:${name} (missing)`}
        className={className}
        style={{
          ...boxStyle,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--surface-alt)",
          borderRadius: 12,
          color: "var(--text-secondary)",
          fontSize: 10,
          fontFamily: "ui-monospace, SFMono-Regular, monospace",
        }}
      >
        ?
      </div>
    );
  }

  if (!data) {
    return (
      <div
        aria-hidden
        className={className}
        style={{
          ...boxStyle,
          background: "var(--surface-alt)",
          borderRadius: 12,
        }}
      />
    );
  }

  return (
    <Lottie
      animationData={data}
      loop={loop && !reduced}
      autoplay={!reduced}
      className={className}
      style={boxStyle}
    />
  );
}
