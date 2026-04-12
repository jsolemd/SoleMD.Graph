"use client";

import { type ReactNode, useCallback, useMemo, useRef, useState } from "react";
import { fetchGraphEntityDetail } from "@/features/graph/lib/entity-service";
import type { GraphEntityDetailResponsePayload } from "@/features/graph/types/entity-service";
import { EntityHoverCard } from "./EntityHoverCard";
import type { EntityHoverCardModel } from "./entity-hover-card";
import {
  EntityHoverCtx,
  type EntityHoverContext,
  type EntityHoverShowArgs,
} from "./use-entity-hover";
import type { GraphEntityRef } from "@/features/graph/types/entity-service";

const DISMISS_DELAY_MS = 120;

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
  const sequenceRef = useRef(0);
  const pointerInsideRef = useRef(false);
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
        .catch(() => {});
    },
    [cancelDismiss],
  );

  const hide = useCallback(() => {
    scheduleDismiss();
  }, [scheduleDismiss]);

  const pointerEnterCard = useCallback(() => {
    pointerInsideRef.current = true;
    cancelDismiss();
  }, [cancelDismiss]);

  const pointerLeaveCard = useCallback(() => {
    pointerInsideRef.current = false;
    scheduleDismiss();
  }, [scheduleDismiss]);

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
