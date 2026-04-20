"use client";

import {
  useEffect,
  useMemo,
  useRef,
  type CSSProperties,
  type ReactNode,
} from "react";
import { BLOB_HOTSPOT_COUNT } from "@/features/ambient-field";

// Static 41-node hotspot pool. Mirrors Maze's index.html:87-149 where the
// full set of `.afr-hotspot` divs is pre-declared inside `.afr-stage`.
// Projection (transform + opacity) is written imperatively by
// `BlobController.writeHotspotDom`; per-hotspot CSS keyframes animate the
// ring/dot via the `is-animating` class that the controller toggles per
// phase. Per-hotspot `animationend` fires an independent reseed so each
// hotspot's pulse cadence stays out of phase with its neighbors.

const POOL_SIZE = BLOB_HOTSPOT_COUNT;
const CARD_SLOT_COUNT = 3;
const RED_SLOT_COUNT = 21;

export interface AmbientFieldHotspotPoolProps {
  onRegisterRefs?: (nodes: Array<HTMLDivElement | null>) => void;
  onRegisterCardRefs?: (nodes: Array<HTMLDivElement | null>) => void;
  onHotspotAnimationEnd?: (index: number) => void;
  renderCard?: (index: number) => ReactNode;
}

function samplePoolDelayMs(index: number): number {
  return (index * 137) % 2000;
}

export function AmbientFieldHotspotPool({
  onRegisterRefs,
  onRegisterCardRefs,
  onHotspotAnimationEnd,
  renderCard,
}: AmbientFieldHotspotPoolProps) {
  const refsRef = useRef<Array<HTMLDivElement | null>>([]);
  const cardRefsRef = useRef<Array<HTMLDivElement | null>>([]);

  // Pre-declared per-slot metadata. Stable across renders so React can
  // reconcile by index without ever remounting a node.
  const slots = useMemo(
    () =>
      Array.from({ length: POOL_SIZE }, (_, index) => ({
        index,
        variant: index < RED_SLOT_COUNT ? ("red" as const) : ("cyan" as const),
        hasCard: index < CARD_SLOT_COUNT,
        delayMs: samplePoolDelayMs(index),
      })),
    [],
  );

  useEffect(() => {
    onRegisterRefs?.(refsRef.current);
  }, [onRegisterRefs]);

  useEffect(() => {
    onRegisterCardRefs?.(cardRefsRef.current);
  }, [onRegisterCardRefs]);

  return (
    <>
      {slots.map((slot) => {
        const slotStyle: CSSProperties = {
          ["--afr-delay" as string]: `${slot.delayMs}ms`,
        };
        return (
          <div
            key={slot.index}
            ref={(node) => {
              refsRef.current[slot.index] = node;
            }}
            className={`afr-hotspot${slot.variant === "red" ? " afr-hotspot--red" : ""}`}
            data-variant={slot.variant}
            {...(slot.hasCard ? { "data-card": "true" } : {})}
            style={slotStyle}
            onAnimationEnd={() => onHotspotAnimationEnd?.(slot.index)}
          >
            <svg className="afr-svg-circle" viewBox="0 0 220 220">
              <circle cx="110" cy="110" r="100" />
            </svg>
            {slot.hasCard && renderCard ? (
              <div
                ref={(node) => {
                  cardRefsRef.current[slot.index] = node;
                }}
                className="afr-hotspot__card-seat"
              >
                {renderCard(slot.index)}
              </div>
            ) : null}
          </div>
        );
      })}
    </>
  );
}
