"use client";

import {
  type ChangeEvent,
  type KeyboardEventHandler,
  type MouseEventHandler,
  type PointerEventHandler,
  type TouchEventHandler,
  useEffect,
  useRef,
} from "react";
import { TextInput, type TextInputProps } from "@mantine/core";
import {
  SearchToggleLottie,
  type SearchToggleMode,
} from "@/features/animations/lottie/SearchToggleLottie";
import { useShellVariantContext } from "@/features/graph/components/shell/ShellVariantContext";
import { panelSelectStyles } from "./panel-styles";

const SEARCH_ICON_SCALE = 2 / 3;
const SEARCH_ICON_MIN_SIZE = 10;

interface PanelSearchFieldProps {
  value: string;
  onValueChange: (value: string) => void;
  placeholder: string;
  ariaLabel: string;
  actionLabel: string;
  actionMode: SearchToggleMode;
  onAction: () => void;
  open?: boolean;
  collapsible?: boolean;
  disabled?: boolean;
  width?: number | string;
  size?: TextInputProps["size"];
  onKeyDown?: KeyboardEventHandler<HTMLInputElement>;
  styles?: TextInputProps["styles"];
  className?: string;
  autoFocusOnOpen?: boolean;
  collapsedActionSize?: number;
  inputActionSize?: number;
  actionPlacement?: "start" | "end";
  slotHeight?: number | string;
}

const stopPointerPropagation: PointerEventHandler<HTMLElement> = (event) => {
  event.stopPropagation();
};

const stopMousePropagation: MouseEventHandler<HTMLElement> = (event) => {
  event.stopPropagation();
};

const stopTouchPropagation: TouchEventHandler<HTMLElement> = (event) => {
  event.stopPropagation();
};

function SearchActionButton({
  mode,
  label,
  onClick,
  hitTargetSize,
  frameSize,
  iconSize,
  pressed = false,
  disabled = false,
}: {
  mode: SearchToggleMode;
  label: string;
  onClick: () => void;
  hitTargetSize: number;
  frameSize: number;
  iconSize: number;
  pressed?: boolean;
  disabled?: boolean;
}) {
  const iconColor = "var(--graph-panel-text)";

  return (
    <div
      style={{
        position: "relative",
        width: frameSize,
        height: frameSize,
        flexShrink: 0,
      }}
    >
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onClick();
        }}
        onPointerDown={stopPointerPropagation}
        onPointerMove={stopPointerPropagation}
        onMouseDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        onTouchStart={stopTouchPropagation}
        onTouchMove={stopTouchPropagation}
        onTouchEnd={stopTouchPropagation}
        onTouchCancel={stopTouchPropagation}
        disabled={disabled}
        aria-label={label}
        aria-pressed={pressed || undefined}
        className="panel-icon-btn inline-flex items-center justify-center disabled:pointer-events-none disabled:opacity-35"
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          width: hitTargetSize,
          height: hitTargetSize,
          padding: 0,
          border: "none",
          borderRadius: 9999,
          background: "none",
          color: iconColor,
          cursor: disabled ? "default" : "pointer",
          transform: "translate(-50%, -50%)",
        }}
      >
        <span
          aria-hidden="true"
          style={{
            display: "inline-flex",
            width: frameSize,
            height: frameSize,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <SearchToggleLottie mode={mode} size={iconSize} />
        </span>
      </button>
    </div>
  );
}

export function PanelSearchField({
  value,
  onValueChange,
  placeholder,
  ariaLabel,
  actionLabel,
  actionMode,
  onAction,
  open = true,
  collapsible = false,
  disabled = false,
  width,
  size = "xs",
  onKeyDown,
  styles = panelSelectStyles,
  className,
  autoFocusOnOpen = collapsible,
  collapsedActionSize = 20,
  inputActionSize = 18,
  actionPlacement = "end",
  slotHeight,
}: PanelSearchFieldProps) {
  const shellVariant = useShellVariantContext();
  const isMobile = shellVariant === "mobile";
  const localInputRef = useRef<HTMLInputElement | null>(null);
  const effectiveCollapsedActionSize = isMobile
    ? Math.max(collapsedActionSize, 26)
    : Math.max(collapsedActionSize, 18);
  const actionFrameSize = Math.max(inputActionSize, 16);
  const effectiveActionIconSize = Math.max(
    SEARCH_ICON_MIN_SIZE,
    Math.round(actionFrameSize * SEARCH_ICON_SCALE),
  );
  const isExpanded = open || !collapsible;
  const expandedWidth = width ?? "100%";
  // Root stays at the collapsed action size when collapsible — the expanded
  // TextInput is absolutely positioned and overlays out of the root, so hosts
  // that size themselves to the collapsed icon (e.g. `w-fit` legend) don't
  // grow when the search opens.
  const rootWidth = collapsible ? effectiveCollapsedActionSize : expandedWidth;
  const actionInset = 2;
  const inputActionSectionWidth = actionFrameSize + actionInset + 4;
  const isActionOnStart = actionPlacement === "start";
  const stableSlotHeight = slotHeight ?? Math.max(effectiveCollapsedActionSize, actionFrameSize);
  const inputSectionProps = isActionOnStart
    ? {
        leftSectionWidth: inputActionSectionWidth,
        leftSectionPointerEvents: "none" as const,
        leftSection: <span aria-hidden />,
      }
    : {
        rightSectionWidth: inputActionSectionWidth,
        rightSectionPointerEvents: "none" as const,
        rightSection: <span aria-hidden />,
      };
  const sharedInputProps = {
    ref: localInputRef,
    value,
    onChange: (event: ChangeEvent<HTMLInputElement>) =>
      onValueChange(event.currentTarget.value),
    onKeyDown,
    placeholder,
    size,
    disabled,
    styles,
    "aria-label": ariaLabel,
    ...inputSectionProps,
  };

  const handleAction = () => {
    if (isExpanded && actionMode === "search") {
      localInputRef.current?.focus();
    }
    onAction();
  };

  useEffect(() => {
    if (!autoFocusOnOpen || !open) {
      return;
    }

    const frame = requestAnimationFrame(() => {
      localInputRef.current?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [autoFocusOnOpen, open]);

  return (
    <div
      className={className ? `relative block ${className}` : "relative block"}
      onPointerDown={stopPointerPropagation}
      onPointerMove={stopPointerPropagation}
      onMouseDown={stopMousePropagation}
      onClick={stopMousePropagation}
      onTouchStart={stopTouchPropagation}
      onTouchMove={stopTouchPropagation}
      onTouchEnd={stopTouchPropagation}
      onTouchCancel={stopTouchPropagation}
      style={{
        width: rootWidth,
        minHeight: stableSlotHeight,
      }}
    >
      {collapsible && isExpanded ? (
        <div
          style={{
            position: "absolute",
            top: "50%",
            [isActionOnStart ? "left" : "right"]: 0,
            width: expandedWidth,
            zIndex: 0,
            transform: "translateY(-50%)",
          }}
        >
          <TextInput {...sharedInputProps} />
        </div>
      ) : null}
      {!collapsible ? (
        <TextInput {...sharedInputProps} />
      ) : null}
      <div
        style={{
          position: "absolute",
          top: "50%",
          [isActionOnStart ? "left" : "right"]: actionInset,
          zIndex: 1,
          transform: "translateY(-50%)",
        }}
      >
        <SearchActionButton
          mode={actionMode}
          label={actionLabel}
          onClick={handleAction}
          hitTargetSize={isExpanded ? actionFrameSize : effectiveCollapsedActionSize}
          frameSize={actionFrameSize}
          iconSize={effectiveActionIconSize}
          pressed={actionMode === "close"}
          disabled={disabled}
        />
      </div>
    </div>
  );
}
