"use client";

import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { fetchGraphEntityDetail } from "@solemd/api-client/client/entity-service";
import type { GraphEntityDetailResponsePayload } from "@solemd/api-client/shared/graph-entity";
import { EntityHoverCard } from "./EntityHoverCard";
import type { EntityHoverCardModel } from "./entity-hover-card";
import {
  EntityHoverCtx,
  type EntityHoverContext,
  type EntityHoverShowArgs,
} from "./use-entity-hover";
import type { GraphEntityRef } from "@solemd/api-client/shared/graph-entity";

const DISMISS_DELAY_MS = 120;
const HOVER_CARD_SHELL_ATTR = "data-entity-hover-card";

interface EntityHoverCardProviderProps {
  children: ReactNode;
  onShowOnGraph?: (entity: GraphEntityRef) => void;
  onOpenWiki?: (entity: GraphEntityRef) => void;
}

export function EntityHoverCardProvider({
  children,
  onShowOnGraph,
  onOpenWiki,
}: EntityHoverCardProviderProps) {
  const [card, setCard] = useState<EntityHoverCardModel | null>(null);
  const [pinned, setPinned] = useState(false);
  const sequenceRef = useRef(0);
  const pointerInsideRef = useRef(false);
  const pinnedRef = useRef(false);
  const clearTimerRef = useRef<number | null>(null);
  const detailCacheRef = useRef(
    new Map<string, Promise<GraphEntityDetailResponsePayload>>(),
  );

  const cancelDismiss = useCallback(() => {
    if (clearTimerRef.current !== null) {
      window.clearTimeout(clearTimerRef.current);
      clearTimerRef.current = null;
    }
  }, []);

  const scheduleDismiss = useCallback(() => {
    cancelDismiss();
    clearTimerRef.current = window.setTimeout(() => {
      clearTimerRef.current = null;
      if (pointerInsideRef.current) return;
      sequenceRef.current += 1;
      setCard(null);
    }, DISMISS_DELAY_MS);
  }, [cancelDismiss]);

  const show = useCallback(
    (args: EntityHoverShowArgs) => {
      pointerInsideRef.current = false;
      cancelDismiss();
      sequenceRef.current += 1;
      const seq = sequenceRef.current;

      pinnedRef.current = Boolean(args.pinned);
      setPinned(pinnedRef.current);
      setCard(buildModel(args, null));

      const cacheKey = `${args.entity.entityType}:${args.entity.sourceIdentifier}`;
      const cached = detailCacheRef.current.get(cacheKey);
      const detailPromise =
        cached ??
        fetchGraphEntityDetail({
          entityType: args.entity.entityType,
          sourceIdentifier: args.entity.sourceIdentifier,
        }).catch((error) => {
          detailCacheRef.current.delete(cacheKey);
          throw error;
        });
      if (!cached) detailCacheRef.current.set(cacheKey, detailPromise);

      void detailPromise
        .then((detail) => {
          if (sequenceRef.current !== seq) return;
          setCard(buildModel(args, detail));
        })
        .catch((error: unknown) => {
          console.error("[EntityHoverCardProvider] fetchGraphEntityDetail failed", error);
        });
    },
    [cancelDismiss],
  );

  const hide = useCallback(() => {
    // Pinned cards (touch flow) are dismissed only by an outside click,
    // not by the source element losing the pointer.
    if (pinnedRef.current) return;
    scheduleDismiss();
  }, [scheduleDismiss]);

  const pointerEnterCard = useCallback(() => {
    pointerInsideRef.current = true;
    cancelDismiss();
  }, [cancelDismiss]);

  const pointerLeaveCard = useCallback(() => {
    pointerInsideRef.current = false;
    if (pinnedRef.current) return;
    scheduleDismiss();
  }, [scheduleDismiss]);

  // Outside-click dismissal for the pinned (touch) path. A tap on another
  // entity still fires that entity's click handler first, which calls
  // `show()` again with the new target — the dismissal here is benign
  // because show() resets card+pinned on the same frame.
  useEffect(() => {
    if (!pinned || !card) return;
    const handler = (event: MouseEvent) => {
      const target = event.target as Element | null;
      if (target?.closest(`[${HOVER_CARD_SHELL_ATTR}]`)) return;
      if (target?.closest("[data-entity-source-id]")) return;
      pinnedRef.current = false;
      setPinned(false);
      sequenceRef.current += 1;
      setCard(null);
    };
    document.addEventListener("click", handler, true);
    return () => document.removeEventListener("click", handler, true);
  }, [pinned, card]);

  const ctx: EntityHoverContext = useMemo(
    () => ({ show, hide, pointerEnterCard, pointerLeaveCard }),
    [show, hide, pointerEnterCard, pointerLeaveCard],
  );

  return (
    <EntityHoverCtx.Provider value={ctx}>
      {children}
      {card && (
        <div
          className="fixed inset-0 z-50"
          style={{ pointerEvents: "none", overflow: "visible" }}
          {...{ [HOVER_CARD_SHELL_ATTR]: true }}
        >
          <EntityHoverCard
            card={card}
            onShowOnGraph={onShowOnGraph}
            onOpenWiki={onOpenWiki}
            onPointerEnter={pointerEnterCard}
            onPointerLeave={pointerLeaveCard}
          />
        </div>
      )}
    </EntityHoverCtx.Provider>
  );
}

function buildModel(
  args: EntityHoverShowArgs,
  detail: GraphEntityDetailResponsePayload | null,
): EntityHoverCardModel {
  return {
    x: args.x,
    y: args.y,
    entity: detail
      ? {
          entityType: detail.entityType,
          conceptNamespace: detail.conceptNamespace,
          conceptId: detail.conceptId,
          sourceIdentifier: detail.sourceIdentifier,
          canonicalName: detail.canonicalName,
        }
      : args.entity,
    label: detail?.canonicalName ?? args.entity.canonicalName,
    entityType: detail?.entityType ?? args.entity.entityType,
    conceptId: detail?.conceptId ?? args.entity.conceptId ?? null,
    conceptNamespace:
      detail?.conceptNamespace ?? args.entity.conceptNamespace ?? null,
    paperCount: detail?.paperCount ?? args.paperCount ?? null,
    aliases:
      detail?.aliases.filter(
        (alias) =>
          alias.aliasText.trim().toLowerCase() !==
          detail.canonicalName.trim().toLowerCase(),
      ) ?? [],
    detailReady: Boolean(detail),
  };
}
