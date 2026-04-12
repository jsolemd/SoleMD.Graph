"use client";

import { type ComponentProps, type ReactNode, type Ref, useRef } from "react";
import { Text, Switch } from "@mantine/core";
import { LottiePulseLoader } from "@/features/animations/lottie/LottiePulseLoader";
import {
  PANEL_ACCENT,
  interactivePillBase,
  panelScaledPx,
  panelSwitchStyles,
  panelTextDimStyle,
  pillActiveColors,
  pillInactiveColors,
} from "./panel-styles";

/** Thin section divider — renders between groups inside panel bodies. */
export function PanelDivider() {
  return (
    <div
      className="mx-auto w-[calc(100%-8px)]"
      style={{ height: panelScaledPx(1), backgroundColor: "var(--graph-panel-border)", opacity: 0.5 }}
    />
  );
}

interface PanelBodyProps {
  children: ReactNode;
  viewportClassName?: string;
  innerClassName?: string;
  viewportRef?: Ref<HTMLDivElement>;
  paddingX?: number;
  paddingTop?: number;
  paddingBottom?: number;
  /**
   * When true the viewport clips instead of scrolling and the inner div is
   * height-constrained so a child component can own the scroll.  Use this when
   * the child renders its own overflow-y-auto container (e.g. WikiPageView).
   *
   * Without this flag, adding `overflow-hidden` via viewportClassName silently
   * loses to the base `overflow-y-auto` in Tailwind CSS 4's cascade (longhand
   * beats shorthand at equal specificity).
   */
  innerScroll?: boolean;
}

const PANEL_BODY_VIEWPORT_SCROLL = "flex-1 min-h-0 overflow-y-auto";
const PANEL_BODY_VIEWPORT_CLIP = "flex-1 min-h-0 overflow-x-hidden overflow-y-hidden";
export const PANEL_BODY_VIEWPORT_CLASS = PANEL_BODY_VIEWPORT_SCROLL;
export const PANEL_BODY_INNER_CLASS = "flex min-h-full flex-col";
const PANEL_BODY_INNER_CONSTRAINED = "flex h-full flex-col";

export function PanelBody({
  children,
  viewportClassName,
  innerClassName,
  viewportRef,
  paddingX = 10,
  paddingTop = 0,
  paddingBottom = 10,
  innerScroll = false,
}: PanelBodyProps) {
  const viewportBase = innerScroll ? PANEL_BODY_VIEWPORT_CLIP : PANEL_BODY_VIEWPORT_SCROLL;
  const innerBase = innerScroll ? PANEL_BODY_INNER_CONSTRAINED : PANEL_BODY_INNER_CLASS;

  return (
    <div
      ref={viewportRef}
      className={[viewportBase, viewportClassName].filter(Boolean).join(" ")}
    >
      <div
        className={[innerBase, innerClassName].filter(Boolean).join(" ")}
        style={{
          paddingLeft: panelScaledPx(paddingX),
          paddingRight: panelScaledPx(paddingX),
          paddingTop: panelScaledPx(paddingTop),
          paddingBottom: panelScaledPx(paddingBottom),
        }}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * Shared inline loading indicator — mode-accent Lottie spinner at any size.
 * Single source of truth for every loader in the app. Delegates to
 * LottiePulseLoader (which handles recolor, reduced-motion, fallback).
 */
export function PanelInlineLoader({
  label,
  size = 10,
}: {
  label?: string;
  size?: number;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="shrink-0 overflow-hidden leading-none" style={{ width: size, height: size }}>
        <LottiePulseLoader size={size} />
      </span>
      {label && (
        <Text component="span" style={panelTextDimStyle}>
          {label}
        </Text>
      )}
    </span>
  );
}

/**
 * Panel switch with a visual gate — dims the track when checked but the gate
 * condition is inactive (e.g. panel scale too low).  The toggle still works
 * at any time; the dimming just signals "preference saved, not yet active."
 *
 * Pass `override` + `onOverrideChange` to show an inline "Always" toggle
 * that bypasses the gate.  Pre-wired with panelSwitchStyles / xs / accent.
 */
export function GatedSwitch({
  gateActive,
  checked,
  label,
  override,
  onOverrideChange,
  onChange,
  ...rest
}: Omit<ComponentProps<typeof Switch>, "size" | "styles"> & {
  gateActive: boolean;
  override?: boolean;
  onOverrideChange?: (on: boolean) => void;
}) {
  // Mantine wraps the entire Switch (input + label) in a <label htmlFor>,
  // so clicking the "Always" pill triggers native label→input forwarding
  // regardless of stopPropagation/preventDefault on the inner span.
  // Guard onChange with a ref to swallow the spurious toggle.
  const suppressChange = useRef(false);
  const suppressed = !!checked && !gateActive && !override;

  return (
    <Switch
      size="xs"
      color={PANEL_ACCENT}
      checked={checked}
      onChange={(event) => {
        if (suppressChange.current) {
          suppressChange.current = false;
          return;
        }
        onChange?.(event);
      }}
      label={
        onOverrideChange ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            {label}
            {checked && (
              <span
                role="button"
                tabIndex={0}
                onClick={(event) => {
                  event.stopPropagation();
                  event.preventDefault();
                  suppressChange.current = true;
                  onOverrideChange(!override);
                  queueMicrotask(() => {
                    suppressChange.current = false;
                  });
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    event.stopPropagation();
                    suppressChange.current = true;
                    onOverrideChange(!override);
                    queueMicrotask(() => {
                      suppressChange.current = false;
                    });
                  }
                }}
                style={{
                  ...interactivePillBase,
                  ...(override ? pillActiveColors : pillInactiveColors),
                }}
              >
                Always
              </span>
            )}
          </span>
        ) : label
      }
      styles={{
        ...panelSwitchStyles,
        track: {
          ...panelSwitchStyles.track,
          opacity: suppressed ? 0.45 : undefined,
        },
      }}
      {...rest}
    />
  );
}
