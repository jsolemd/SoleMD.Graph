"use client";

import { useCallback } from "react";
import {
  ActionIcon,
  Popover,
  Slider,
  Switch,
  Text,
  Tooltip,
} from "@mantine/core";
import { Gauge } from "lucide-react";
import { useShellStore } from "@/features/graph/stores";
import {
  graphControlBtnStyles,
  panelChromeStyle,
  panelTextMutedStyle,
  panelTextStyle,
  promptSurfaceStyle,
} from "@/features/graph/components/panels/PanelShell";

const MOBILE_ICON_SIZE = 40;
const GLYPH_SIZE = 14;
const GLYPH_STROKE = 1.5;

/**
 * Slice B (orb-3d-physics-taxonomy.md §9.4): user-facing surface for
 * the four ambient-physics knobs. Mounts as a Popover triggered from
 * `<OrbChromeBar>` pill 2.
 *
 * Writes:
 *  - Pause / play  → `useShellStore.setPauseMotion`
 *  - Motion speed  → `useShellStore.setMotionSpeedMultiplier`
 *  - Rotation      → `useShellStore.setRotationSpeedMultiplier`
 *  - Entropy       → `useShellStore.setAmbientEntropy`
 *
 * The WebGPU orb runtime consumes these through `OrbWebGpuCanvas`.
 * The landing path defaults all multipliers to 1.0 and never writes
 * them, so this panel only changes the orb feel.
 */

const sliderStyles = {
  root: { width: "100%" },
  track: { height: 3 },
  thumb: { width: 10, height: 10, borderWidth: 1 },
  markLabel: { display: "none" },
  // Single dot at 1× — solid neutral circle, no surrounding ring,
  // sits on the same baseline as the thumb so the slider stays minimal.
  mark: {
    width: 3,
    height: 3,
    borderRadius: "50%",
    border: "none",
    backgroundColor: "var(--graph-panel-text-dim)",
    transform: "translate(-50%, -50%)",
  },
  label: {
    fontSize: 9,
    padding: "1px 4px",
    backgroundColor: "var(--surface-alt)",
    color: "var(--text-primary)",
    border: "1px solid var(--graph-panel-border)",
  },
} as const;

const ONE_MARK = [{ value: 1.0, label: "" }];
const ONE_FIVE_MARK = [{ value: 1.5, label: "" }];

const resetButtonStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  padding: 0,
  margin: 0,
  cursor: "pointer",
  fontVariantNumeric: "tabular-nums",
  color: "inherit",
  font: "inherit",
};

const switchStyles = {
  track: { cursor: "pointer" },
  body: { alignItems: "center" },
  labelWrapper: { paddingInlineStart: 8 },
} as const;

const formatMul = (v: number) => `${v.toFixed(2)}×`;

interface MotionControlRowProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step: number;
  /** Slider's "neutral" baseline — reset target + center-dot mark. */
  baseline?: number;
  disabled?: boolean;
}

function MotionControlRow({
  label,
  value,
  onChange,
  min,
  max,
  step,
  baseline = 1,
  disabled,
}: MotionControlRowProps) {
  const isAtDefault = value === baseline;
  const handleReset = useCallback(() => {
    if (!isAtDefault) onChange(baseline);
  }, [baseline, isAtDefault, onChange]);
  const marks = baseline === 1.5 ? ONE_FIVE_MARK : ONE_MARK;
  const resetLabel = `Reset to ${formatMul(baseline)}`;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between">
        <Text
          component="span"
          style={{ ...panelTextMutedStyle, ...panelChromeStyle }}
        >
          {label}
        </Text>
        <Tooltip
          label={resetLabel}
          position="left"
          withArrow
          disabled={isAtDefault || disabled}
        >
          <Text
            component="button"
            type="button"
            onClick={handleReset}
            disabled={disabled || isAtDefault}
            style={{
              ...resetButtonStyle,
              ...panelTextStyle,
              ...panelChromeStyle,
              cursor: disabled || isAtDefault ? "default" : "pointer",
              opacity: disabled ? 0.5 : 1,
              textDecorationLine: isAtDefault ? "none" : "underline",
              textDecorationStyle: "dotted",
              textDecorationColor: "var(--graph-panel-text-dim)",
              textUnderlineOffset: 2,
            }}
          >
            {formatMul(value)}
          </Text>
        </Tooltip>
      </div>
      <Slider
        value={value}
        onChange={onChange}
        min={min}
        max={max}
        step={step}
        marks={marks}
        label={formatMul}
        styles={sliderStyles}
        disabled={disabled}
      />
    </div>
  );
}

interface MotionControlPanelProps {
  isMobile: boolean;
  opened: boolean;
  onOpenChange: (opened: boolean) => void;
}

export function MotionControlPanel({
  isMobile,
  opened,
  onOpenChange,
}: MotionControlPanelProps) {
  const pauseMotion = useShellStore((s) => s.pauseMotion);
  const motionSpeedMultiplier = useShellStore(
    (s) => s.motionSpeedMultiplier,
  );
  const rotationSpeedMultiplier = useShellStore(
    (s) => s.rotationSpeedMultiplier,
  );
  const ambientEntropy = useShellStore((s) => s.ambientEntropy);
  const setPauseMotion = useShellStore((s) => s.setPauseMotion);
  const setMotionSpeedMultiplier = useShellStore(
    (s) => s.setMotionSpeedMultiplier,
  );
  const setRotationSpeedMultiplier = useShellStore(
    (s) => s.setRotationSpeedMultiplier,
  );
  const setAmbientEntropy = useShellStore((s) => s.setAmbientEntropy);

  const handlePauseChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setPauseMotion(event.currentTarget.checked);
    },
    [setPauseMotion],
  );

  return (
    <Popover
      opened={opened}
      onChange={onOpenChange}
      position="bottom-end"
      withArrow
      shadow="sm"
      offset={8}
    >
      <Popover.Target>
        <Tooltip
          label="Controls"
          position="bottom"
          withArrow
          disabled={opened || isMobile}
        >
          <ActionIcon
            variant="transparent"
            size={isMobile ? MOBILE_ICON_SIZE : "lg"}
            radius="xl"
            className="graph-icon-btn"
            styles={graphControlBtnStyles}
            onClick={() => onOpenChange(!opened)}
            aria-label="Controls"
            aria-pressed={opened}
          >
            <Gauge size={GLYPH_SIZE} strokeWidth={GLYPH_STROKE} />
          </ActionIcon>
        </Tooltip>
      </Popover.Target>
      <Popover.Dropdown
        style={{
          ...promptSurfaceStyle,
          padding: "10px 12px",
          width: 220,
        }}
      >
        <div className="flex flex-col gap-3">
          <ControlsSection label="Motion">
            <Switch
              checked={pauseMotion}
              onChange={handlePauseChange}
              size="xs"
              styles={switchStyles}
              label={
                <Text
                  component="span"
                  style={{ ...panelTextStyle, ...panelChromeStyle }}
                >
                  Pause motion
                </Text>
              }
            />

            <MotionControlRow
              label="Motion speed"
              value={motionSpeedMultiplier}
              onChange={setMotionSpeedMultiplier}
              min={0.5}
              max={3.0}
              step={0.05}
              baseline={1.5}
              disabled={pauseMotion}
            />

            <MotionControlRow
              label="Rotation"
              value={rotationSpeedMultiplier}
              onChange={setRotationSpeedMultiplier}
              min={0}
              max={2.0}
              step={0.05}
              disabled={pauseMotion}
            />

            <MotionControlRow
              label="Entropy"
              value={ambientEntropy}
              onChange={setAmbientEntropy}
              min={0}
              max={2.0}
              step={0.05}
              disabled={pauseMotion}
            />
          </ControlsSection>

          <ShortcutsSection />
        </div>
      </Popover.Dropdown>
    </Popover>
  );
}

// Shared section primitive for the popover so "Motion" and "Shortcuts"
// stay visually parallel: same divider rule, same muted header treatment.
// The popover's first child has no top divider since `gap-3` on the
// flex container already separates it from the popover's top padding.
function ControlsSection({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <Text
        component="span"
        style={{
          ...panelTextMutedStyle,
          ...panelChromeStyle,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          fontSize: 9,
        }}
      >
        {label}
      </Text>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

// Touch shortcuts are wired in `OrbInteractionSurface` (touch double-tap).
// Keyboard camera shortcuts were retired with the R3F orb camera path; keep
// only shortcuts that still have a WebGPU/runtime owner.
const SHORTCUTS = [
  { keys: ["Space"], label: "Pause / play", note: "double-tap" },
] as const;

function ShortcutsSection() {
  return (
    <ControlsSection label="Shortcuts">
      <div className="flex flex-col gap-1">
        {SHORTCUTS.map((entry) => (
          <div
            key={entry.label}
            className="flex items-center justify-between gap-2"
          >
            <Text
              component="span"
              style={{ ...panelTextMutedStyle, ...panelChromeStyle }}
            >
              {entry.label}
            </Text>
            <div className="flex items-center gap-1">
              {entry.keys.map((k) => (
                <kbd
                  key={k}
                  style={{
                    ...panelTextStyle,
                    ...panelChromeStyle,
                    padding: "0 5px",
                    minWidth: 18,
                    textAlign: "center",
                    borderRadius: 3,
                    backgroundColor: "var(--surface-alt)",
                    fontFamily: "inherit",
                    fontSize: 10,
                    lineHeight: "16px",
                  }}
                >
                  {k}
                </kbd>
              ))}
              {"note" in entry ? (
                <Text
                  component="span"
                  style={{
                    ...panelTextMutedStyle,
                    ...panelChromeStyle,
                    fontSize: 10,
                  }}
                >
                  / {entry.note}
                </Text>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </ControlsSection>
  );
}
