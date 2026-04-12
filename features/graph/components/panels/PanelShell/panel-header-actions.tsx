"use client";

import { type MouseEventHandler, type ReactNode } from "react";
import {
  ActionIcon,
  Text,
  Tooltip,
  UnstyledButton,
  type ActionIconProps,
  type ActionIconVariant,
  type TooltipProps,
} from "@mantine/core";
import { Minus, Pin, PinOff, Plus, X } from "lucide-react";
import { densityCssPx } from "@/lib/density";
import { iconBtnStyles, panelChromeStyle, panelTextMutedStyle } from "./panel-styles";

interface PanelHeaderActionsProps {
  children: ReactNode;
  gap?: "tight" | "normal";
}

export function PanelHeaderActions({
  children,
  gap = "normal",
}: PanelHeaderActionsProps) {
  return (
    <div className={gap === "tight" ? "flex items-center gap-0.5" : "flex items-center gap-1"}>
      {children}
    </div>
  );
}

export function PanelHeaderDivider() {
  return (
    <div
      aria-hidden="true"
      className="mx-0.5 h-3.5 w-px shrink-0"
      style={{ backgroundColor: "var(--graph-panel-border)", opacity: 0.75 }}
    />
  );
}

interface PanelIconActionProps {
  label: string;
  icon: ReactNode;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  disabled?: boolean;
  type?: "button" | "submit" | "reset";
  className?: string;
  size?: ActionIconProps["size"];
  radius?: ActionIconProps["radius"];
  styles?: ActionIconProps["styles"];
  variant?: ActionIconVariant;
  withArrow?: boolean;
  tooltipDisabled?: boolean;
  tooltipPosition?: TooltipProps["position"];
  "aria-label"?: string;
  "aria-pressed"?: boolean;
}

export function PanelIconAction({
  label,
  icon,
  onClick,
  disabled,
  type = "button",
  className = "graph-icon-btn",
  size = 24,
  radius = "xl",
  styles = iconBtnStyles,
  variant = "transparent",
  withArrow = true,
  tooltipDisabled = false,
  tooltipPosition = "bottom",
  "aria-label": ariaLabel,
  "aria-pressed": ariaPressed,
}: PanelIconActionProps) {
  const action = (
    <ActionIcon
      type={type}
      onClick={onClick}
      disabled={disabled}
      variant={variant}
      size={size}
      radius={radius}
      className={className}
      styles={styles}
      aria-label={ariaLabel ?? label}
      aria-pressed={ariaPressed}
    >
      {icon}
    </ActionIcon>
  );

  if (tooltipDisabled) {
    return action;
  }

  return (
    <Tooltip label={label} position={tooltipPosition} withArrow={withArrow}>
      {action}
    </Tooltip>
  );
}

interface PanelScaleControlProps {
  panelScale: number;
  canIncreaseScale?: boolean;
  canDecreaseScale?: boolean;
  onIncreaseScale: () => void;
  onDecreaseScale: () => void;
  onResetScale?: () => void;
}

export function PanelScaleControl({
  panelScale,
  canIncreaseScale,
  canDecreaseScale,
  onIncreaseScale,
  onDecreaseScale,
  onResetScale,
}: PanelScaleControlProps) {
  return (
    <div className="inline-flex items-center gap-0">
      <PanelIconAction
        label="Decrease panel text size (Ctrl+-)"
        icon={<Minus size={12} />}
        onClick={onDecreaseScale}
        size={18}
        className="graph-icon-btn shrink-0"
        aria-label="Decrease panel text size"
        disabled={!canDecreaseScale}
      />
      <Tooltip label="Reset panel text size (Ctrl+0)" position="bottom" withArrow>
        <UnstyledButton
          type="button"
          onClick={onResetScale}
          aria-label="Reset panel text size"
          className="inline-flex w-[2.2rem] items-center justify-center px-0 text-center tabular-nums"
          style={{ height: densityCssPx(18) }}
        >
          <Text component="span" style={{ ...panelTextMutedStyle, ...panelChromeStyle }}>
            {Math.round(panelScale * 100)}%
          </Text>
        </UnstyledButton>
      </Tooltip>
      <PanelIconAction
        label="Increase panel text size (Ctrl+=)"
        icon={<Plus size={12} />}
        onClick={onIncreaseScale}
        size={18}
        className="graph-icon-btn shrink-0"
        aria-label="Increase panel text size"
        disabled={!canIncreaseScale}
      />
    </div>
  );
}

interface PanelWindowActionsProps {
  title: string;
  onClose: () => void;
  isPinned?: boolean;
  onTogglePin?: () => void;
}

export function PanelWindowActions({
  title,
  onClose,
  isPinned,
  onTogglePin,
}: PanelWindowActionsProps) {
  return (
    <PanelHeaderActions gap="tight">
      {onTogglePin && (
        <PanelIconAction
          label={isPinned ? "Unpin panel" : "Pin panel"}
          icon={isPinned ? <PinOff size={12} /> : <Pin size={12} />}
          onClick={onTogglePin}
          aria-label={isPinned ? "Unpin panel" : "Pin panel"}
          aria-pressed={isPinned}
        />
      )}
      <PanelIconAction
        label={`Close ${title.toLowerCase()}`}
        icon={<X size={12} />}
        onClick={onClose}
        aria-label={`Close ${title.toLowerCase()} panel`}
      />
    </PanelHeaderActions>
  );
}
