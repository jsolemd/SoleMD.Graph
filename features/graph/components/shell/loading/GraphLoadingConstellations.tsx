"use client";

import { useViewportSize } from "@mantine/hooks";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EntityHoverCard } from "@/features/graph/components/entities/EntityHoverCard";
import type { EntityHoverCardModel } from "@/features/graph/components/entities/entity-hover-card";
import {
  GRAPH_LOADING_CONSTELLATIONS,
  type GraphLoadingConstellation,
  type GraphLoadingConstellationNode,
} from "./graph-loading-constellations";
import {
  type LoadingConstellationFrame,
  resolveConstellationLayoutMap,
} from "./graph-loading-constellation-layout";

const CARD_DISMISS_DELAY_MS = 120;
const HERO_DOT = 16;
const MAJOR_DOT = 10;
const MINOR_DOT = 7;

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

type CardState = EntityHoverCardModel & { constellationId: string };

export function GraphLoadingConstellations() {
  const [card, setCard] = useState<CardState | null>(null);
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const insideCard = useRef(false);
  const timer = useRef<number | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const { width, height } = useViewportSize();

  const frames = useMemo(
    () => resolveConstellationLayoutMap(GRAPH_LOADING_CONSTELLATIONS, width || 1440, height || 900),
    [width, height],
  );

  const cancelDismiss = useCallback(() => {
    if (timer.current !== null) { clearTimeout(timer.current); timer.current = null; }
  }, []);

  const scheduleDismiss = useCallback(() => {
    if (pinnedId) return;
    cancelDismiss();
    timer.current = window.setTimeout(() => {
      timer.current = null;
      if (!insideCard.current) setCard(null);
    }, CARD_DISMISS_DELAY_MS);
  }, [cancelDismiss, pinnedId]);

  const activate = useCallback((c: GraphLoadingConstellation, el: HTMLElement) => {
    if (pinnedId && pinnedId !== c.id) return;
    cancelDismiss();
    insideCard.current = false;
    const r = el.getBoundingClientRect();
    setCard({
      constellationId: c.id, x: r.left, y: r.top,
      entity: c.entity, label: c.entity.canonicalName,
      entityType: c.entity.entityType, conceptId: c.entity.conceptId,
      conceptNamespace: c.entity.conceptNamespace,
      paperCount: c.paperCount, aliases: c.aliases, detailReady: true,
    });
  }, [cancelDismiss, pinnedId]);

  const togglePin = useCallback((c: GraphLoadingConstellation, el: HTMLElement) => {
    cancelDismiss();
    insideCard.current = false;
    if (pinnedId === c.id) { setPinnedId(null); setCard(null); return; }
    const r = el.getBoundingClientRect();
    setPinnedId(c.id);
    setCard({
      constellationId: c.id, x: r.left, y: r.top,
      entity: c.entity, label: c.entity.canonicalName,
      entityType: c.entity.entityType, conceptId: c.entity.conceptId,
      conceptNamespace: c.entity.conceptNamespace,
      paperCount: c.paperCount, aliases: c.aliases, detailReady: true,
    });
  }, [cancelDismiss, pinnedId]);

  useEffect(() => () => { if (timer.current !== null) clearTimeout(timer.current); }, []);

  useEffect(() => {
    if (!pinnedId) return;
    const handler = (e: PointerEvent) => {
      const t = e.target;
      if (!(t instanceof Node)) return;
      if (rootRef.current?.contains(t) || cardRef.current?.contains(t)) return;
      setPinnedId(null); setCard(null); insideCard.current = false;
    };
    document.addEventListener("pointerdown", handler, true);
    return () => document.removeEventListener("pointerdown", handler, true);
  }, [pinnedId]);

  const activeId = pinnedId ?? card?.constellationId ?? null;

  return (
    <div className="pointer-events-none absolute inset-0 z-[5] overflow-hidden" data-testid="loading-constellations" ref={rootRef}>
      {GRAPH_LOADING_CONSTELLATIONS.map((c) => {
        const f = frames[c.id];
        if (!f) return null;
        const on = activeId === c.id;
        const seed = hash(c.id);
        return (
          <div
            key={c.id}
            className={`absolute pointer-events-auto ${c.mobileVisible ? "" : "hidden lg:block"}`}
            data-entity-type={c.entity.entityType.toLowerCase()}
            data-testid={`loading-constellation-${c.id}`}
            style={{
              width: f.width, height: f.height, left: f.left, top: f.top,
              animation: `constellation-drift-${seed % 3} ${12 + (seed % 6)}s ease-in-out ${-(seed % 8)}s infinite`,
            }}
          >
            <svg className="absolute inset-0 h-full w-full overflow-visible" style={{ pointerEvents: "none" }}>
              {c.edges.map(([sId, tId]) => {
                const s = c.nodes.find((n) => n.id === sId);
                const t = c.nodes.find((n) => n.id === tId);
                if (!s || !t) return null;
                return (
                  <line key={`${sId}-${tId}`}
                    x1={`${s.x}%`} y1={`${s.y}%`} x2={`${t.x}%`} y2={`${t.y}%`}
                    stroke={on ? "color-mix(in srgb, var(--entity-accent) 45%, transparent)" : "color-mix(in srgb, var(--entity-accent) 12%, transparent)"}
                    strokeLinecap="round" vectorEffect="non-scaling-stroke"
                    strokeWidth={on ? 1 : 0.5} opacity={on ? 0.6 : 0.18}
                    style={{ transition: "stroke 0.3s, opacity 0.3s" }}
                  />
                );
              })}
            </svg>

            {c.nodes.map((n) => (
              <Dot key={n.id} node={n} constellation={c} active={on}
                pinned={pinnedId === c.id} onActivate={activate}
                onTogglePin={togglePin} onDeactivate={scheduleDismiss} />
            ))}
          </div>
        );
      })}

      {card && (
        <div className="fixed inset-0 z-[62]" style={{ pointerEvents: "none", overflow: "visible" }} data-testid="loading-constellation-card" ref={cardRef}>
          <EntityHoverCard card={card}
            onPointerEnter={() => { insideCard.current = true; cancelDismiss(); }}
            onPointerLeave={() => { insideCard.current = false; scheduleDismiss(); }} />
        </div>
      )}
    </div>
  );
}

function Dot({ node: n, constellation: c, active, pinned, onActivate, onTogglePin, onDeactivate }: {
  node: GraphLoadingConstellationNode;
  constellation: GraphLoadingConstellation;
  active: boolean; pinned: boolean;
  onActivate: (c: GraphLoadingConstellation, el: HTMLElement) => void;
  onTogglePin: (c: GraphLoadingConstellation, el: HTMLElement) => void;
  onDeactivate: () => void;
}) {
  const isHero = n.size === "hero";
  const dot = isHero ? HERO_DOT : n.size === "major" ? MAJOR_DOT : MINOR_DOT;
  const hit = isHero ? 40 : dot + 14;
  const on = active || isHero;
  const seed = hash(n.id);

  return (
    <div
      className="absolute"
      data-entity-type={n.entityType.toLowerCase()}
      style={{
        left: `calc(${n.x}% - ${hit / 2}px)`, top: `calc(${n.y}% - ${hit / 2}px)`,
        width: hit, height: hit,
        animation: `constellation-drift-${seed % 3} ${(isHero ? 10 : 7) + (seed % 4)}s ease-in-out ${-(seed % 6)}s infinite`,
      }}
    >
      <button
        type="button"
        className="flex h-full w-full items-center justify-center rounded-full border-0 p-0"
        style={{ appearance: "none", background: "transparent", cursor: "pointer" }}
        data-testid={isHero ? `loading-constellation-trigger-${c.id}` : `loading-constellation-node-${c.id}-${n.id}`}
        aria-label={isHero ? n.label : `${n.label}, related to ${c.entity.canonicalName}`}
        aria-pressed={pinned || undefined}
        onPointerEnter={(e) => onActivate(c, e.currentTarget)}
        onPointerLeave={onDeactivate}
        onClick={(e) => onTogglePin(c, e.currentTarget)}
      >
        <span className="block rounded-full" style={{
          width: dot, height: dot,
          backgroundColor: "var(--entity-accent)",
          opacity: on ? 1 : 0.4,
          boxShadow: on
            ? `0 0 ${isHero ? 14 : 8}px ${isHero ? 4 : 2}px color-mix(in srgb, var(--entity-accent) ${isHero ? 40 : 30}%, transparent)`
            : `0 0 3px 1px color-mix(in srgb, var(--entity-accent) 12%, transparent)`,
          transition: "opacity 0.3s, box-shadow 0.3s",
          animation: `constellation-glow ${on ? 2 : 3.5}s ease-in-out infinite`,
        }} />
      </button>

      {(isHero || active) && (
        <div className="absolute left-1/2 text-center tracking-wide uppercase" style={{
          top: hit + 2, transform: "translateX(-50%)", width: isHero ? 140 : 100,
          pointerEvents: "none", fontSize: isHero ? 10 : 9, fontWeight: isHero ? 600 : 400,
          lineHeight: 1.15, opacity: active ? 0.85 : isHero ? 0.55 : 0,
          color: active ? "var(--text-primary)" : "var(--text-secondary)",
          transition: "opacity 0.22s", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>
          {n.label}
        </div>
      )}
    </div>
  );
}
