"use client";

import { Switch, Slider, Stack, Text } from "@mantine/core";
import { useShallow } from "zustand/react/shallow";
import { useDashboardStore } from "@/features/graph/stores";
import { sectionLabelStyle, panelTextMutedStyle, switchLabelStyle, PANEL_ACCENT } from "../../panels/PanelShell";

function LabeledSlider({
  label,
  value,
  onChange,
  min,
  max,
  step,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  disabled?: boolean;
}) {
  return (
    <div>
      <Text size="xs" mb={4} style={panelTextMutedStyle}>
        {label}
      </Text>
      <Slider
        aria-label={label}
        size="xs"
        color={PANEL_ACCENT}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={onChange}
        disabled={disabled}
      />
    </div>
  );
}

export function LinkConfig() {
  const {
    renderLinks, linkOpacity, linkGreyoutOpacity,
    linkVisibilityDistanceRange, linkVisibilityMinTransparency,
    linkDefaultWidth, curvedLinks, linkDefaultArrows, scaleLinksOnZoom,
    setRenderLinks, setLinkOpacity, setLinkGreyoutOpacity,
    setLinkVisibilityDistanceRange, setLinkVisibilityMinTransparency,
    setLinkDefaultWidth, setCurvedLinks, setLinkDefaultArrows, setScaleLinksOnZoom,
  } = useDashboardStore(useShallow((s) => ({
    renderLinks: s.renderLinks,
    linkOpacity: s.linkOpacity,
    linkGreyoutOpacity: s.linkGreyoutOpacity,
    linkVisibilityDistanceRange: s.linkVisibilityDistanceRange,
    linkVisibilityMinTransparency: s.linkVisibilityMinTransparency,
    linkDefaultWidth: s.linkDefaultWidth,
    curvedLinks: s.curvedLinks,
    linkDefaultArrows: s.linkDefaultArrows,
    scaleLinksOnZoom: s.scaleLinksOnZoom,
    setRenderLinks: s.setRenderLinks,
    setLinkOpacity: s.setLinkOpacity,
    setLinkGreyoutOpacity: s.setLinkGreyoutOpacity,
    setLinkVisibilityDistanceRange: s.setLinkVisibilityDistanceRange,
    setLinkVisibilityMinTransparency: s.setLinkVisibilityMinTransparency,
    setLinkDefaultWidth: s.setLinkDefaultWidth,
    setCurvedLinks: s.setCurvedLinks,
    setLinkDefaultArrows: s.setLinkDefaultArrows,
    setScaleLinksOnZoom: s.setScaleLinksOnZoom,
  })));

  const linkControlsDisabled = !renderLinks;

  return (
    <>
      <Text size="xs" fw={600} mb={8} style={sectionLabelStyle}>
        Links
      </Text>
      <Stack gap="xs">
        <Switch
          size="xs"
          color={PANEL_ACCENT}
          label="Show links"
          checked={renderLinks}
          onChange={(e) => setRenderLinks(e.currentTarget.checked)}
          styles={switchLabelStyle}
        />
        <LabeledSlider
          label={`Opacity: ${linkOpacity.toFixed(2)}`}
          value={linkOpacity}
          onChange={setLinkOpacity}
          min={0} max={1} step={0.05}
          disabled={linkControlsDisabled}
        />
        <LabeledSlider
          label={`Greyout opacity: ${linkGreyoutOpacity.toFixed(2)}`}
          value={linkGreyoutOpacity}
          onChange={setLinkGreyoutOpacity}
          min={0} max={1} step={0.05}
          disabled={linkControlsDisabled}
        />
        <LabeledSlider
          label={`Fade range: ${linkVisibilityDistanceRange[0]} \u2013 ${linkVisibilityDistanceRange[1]}px`}
          value={linkVisibilityDistanceRange[1]}
          onChange={(v) => setLinkVisibilityDistanceRange([linkVisibilityDistanceRange[0], v])}
          min={0} max={500} step={10}
          disabled={linkControlsDisabled}
        />
        <LabeledSlider
          label={`Min transparency: ${linkVisibilityMinTransparency.toFixed(2)}`}
          value={linkVisibilityMinTransparency}
          onChange={setLinkVisibilityMinTransparency}
          min={0} max={1} step={0.05}
          disabled={linkControlsDisabled}
        />
        <LabeledSlider
          label={`Width: ${linkDefaultWidth}`}
          value={linkDefaultWidth}
          onChange={setLinkDefaultWidth}
          min={0.5} max={10} step={0.5}
          disabled={linkControlsDisabled}
        />
        <Switch
          size="xs"
          color={PANEL_ACCENT}
          label="Curved links"
          checked={curvedLinks}
          onChange={(e) => setCurvedLinks(e.currentTarget.checked)}
          styles={switchLabelStyle}
          disabled={linkControlsDisabled}
        />
        <Switch
          size="xs"
          color={PANEL_ACCENT}
          label="Show arrows"
          checked={linkDefaultArrows}
          onChange={(e) => setLinkDefaultArrows(e.currentTarget.checked)}
          styles={switchLabelStyle}
          disabled={linkControlsDisabled}
        />
        <Switch
          size="xs"
          color={PANEL_ACCENT}
          label="Scale on zoom"
          checked={scaleLinksOnZoom}
          onChange={(e) => setScaleLinksOnZoom(e.currentTarget.checked)}
          styles={switchLabelStyle}
          disabled={linkControlsDisabled}
        />
      </Stack>
    </>
  );
}
