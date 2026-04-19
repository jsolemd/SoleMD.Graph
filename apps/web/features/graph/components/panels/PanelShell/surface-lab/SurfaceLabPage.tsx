"use client";

import type { CSSProperties, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  Group,
  SegmentedControl,
  Select,
  Slider,
  Stack,
  Text,
} from "@mantine/core";
import ThemeToggle from "@/features/graph/components/chrome/ThemeToggle";
import {
  compactSegmentedControlStyles,
  MetaPill,
  panelAccentCardClassName,
  panelAccentCardStyle,
  panelCardStyle,
  panelSelectStyles,
  panelSurfaceStyle,
  panelTextDimStyle,
  panelTextStyle,
} from "@/features/graph/components/panels/PanelShell";
import { ShellVariantProvider } from "../../../shell/ShellVariantContext";
import {
  AdoptionInventory,
  BrandTokenWall,
  LaterConsideration,
  TokenSwatch,
} from "./SurfaceLabReference";
import {
  BottomTrayPreview,
  HoverCardPreview,
  OverlayPreview,
  PopoverPreview,
  PrimitivesPreview,
  PromptPreview,
  ReadingPanelPreview,
} from "./SurfaceLabPreviews";
import {
  type SurfaceInventoryRow,
  accentOptions,
  type PanelTone,
  type PromptTone,
  type ShellVariantOption,
  surfaceFamilyDefinitions,
  type SurfaceFamilyDefinition,
} from "./surface-lab-data";

function getAccentRef(accentValue: string) {
  const accent = accentOptions.find((option) => option.value === accentValue) ?? accentOptions[0];
  return `var(${accent.token})`;
}

function getPanelBackground(tone: PanelTone, accentRef: string) {
  switch (tone) {
    case "soft":
      return "color-mix(in srgb, var(--surface) 84%, var(--surface-alt))";
    case "washed":
      return `color-mix(in srgb, ${accentRef} 8%, var(--surface))`;
    case "neutral":
    default:
      return "var(--surface)";
  }
}

function getPanelInputBackground(tone: PanelTone, accentRef: string) {
  switch (tone) {
    case "soft":
      return "color-mix(in srgb, var(--surface-alt) 92%, white)";
    case "washed":
      return `color-mix(in srgb, ${accentRef} 9%, var(--surface-alt))`;
    case "neutral":
    default:
      return "var(--surface-alt)";
  }
}

function getPromptBackground(tone: PromptTone, accentRef: string, panelBackground: string) {
  switch (tone) {
    case "panel":
      return panelBackground;
    case "accent":
      return `color-mix(in srgb, ${accentRef} 12%, var(--surface))`;
    case "neutral":
    default:
      return "var(--surface)";
  }
}

function buildPreviewVars({
  accent,
  colorScheme,
  density,
  panelScale,
  panelTone,
  promptTone,
}: {
  accent: string;
  colorScheme: "light" | "dark";
  density: number;
  panelScale: number;
  panelTone: PanelTone;
  promptTone: PromptTone;
}) {
  const accentRef = getAccentRef(accent);
  const panelBackground = getPanelBackground(panelTone, accentRef);
  const panelInputBackground = getPanelInputBackground(panelTone, accentRef);
  const promptBackground = getPromptBackground(promptTone, accentRef, panelBackground);
  const isDark = colorScheme === "dark";

  return {
    "--app-density": String(density),
    "--graph-panel-scale": String(panelScale),
    "--graph-panel-reading-scale": "calc(var(--app-density) * var(--graph-panel-scale))",
    "--mode-accent": accentRef,
    "--mode-accent-subtle": isDark
      ? `color-mix(in srgb, ${accentRef} 28%, var(--graph-panel-input-bg))`
      : `color-mix(in srgb, ${accentRef} 34%, white)`,
    "--mode-accent-hover": isDark
      ? `color-mix(in srgb, ${accentRef} 38%, var(--graph-panel-input-bg))`
      : `color-mix(in srgb, ${accentRef} 46%, white)`,
    "--mode-accent-border": isDark
      ? `color-mix(in srgb, ${accentRef} 58%, var(--graph-panel-bg))`
      : `color-mix(in srgb, ${accentRef} 38%, white)`,
    "--brand-accent": accentRef,
    "--brand-accent-alt": `color-mix(in srgb, ${accentRef} 68%, white)`,
    "--graph-panel-bg": panelBackground,
    "--graph-panel-input-bg": panelInputBackground,
    "--graph-prompt-bg": promptBackground,
    "--graph-control-hover-bg": isDark
      ? `color-mix(in srgb, ${accentRef} 24%, var(--graph-panel-input-bg))`
      : `color-mix(in srgb, ${accentRef} 16%, var(--graph-panel-input-bg))`,
    "--graph-control-pressed-bg": isDark
      ? `color-mix(in srgb, ${accentRef} 44%, var(--graph-panel-input-bg))`
      : `color-mix(in srgb, ${accentRef} 24%, var(--graph-panel-input-bg))`,
    "--graph-control-active-bg": isDark
      ? `color-mix(in srgb, ${accentRef} 56%, var(--graph-panel-input-bg))`
      : `color-mix(in srgb, ${accentRef} 32%, var(--graph-panel-input-bg))`,
  } as CSSProperties;
}

function familyIdFromHash(hash: string) {
  const slug = hash.replace(/^#surface-family-/, "");
  return surfaceFamilyDefinitions.find((family) => family.slug === slug)?.id;
}

function readDocumentColorScheme(): "light" | "dark" {
  if (typeof document === "undefined") {
    return "light";
  }

  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

function SectionCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section
      className="overflow-hidden rounded-[1.1rem]"
      style={panelSurfaceStyle}
    >
      <div className="border-b border-[var(--graph-panel-border)] px-4 py-3">
        <Text fw={600} style={panelTextStyle}>
          {title}
        </Text>
        {description && (
          <Text mt={4} style={panelTextDimStyle}>
            {description}
          </Text>
        )}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function SurfaceFamilyDirectory({
  families,
  selectedFamilyId,
  onSelect,
}: {
  families: readonly SurfaceFamilyDefinition[];
  selectedFamilyId: string;
  onSelect: (familyId: string) => void;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {families.map((family) => (
        <a
          key={family.id}
          href={`#surface-family-${family.slug}`}
          className="block rounded-xl p-3 no-underline transition-colors hover:bg-[var(--graph-panel-hover)]"
          onClick={() => onSelect(family.id)}
          style={{
            ...panelCardStyle,
            borderColor: family.id === selectedFamilyId ? "var(--mode-accent-border)" : "var(--graph-panel-border)",
            backgroundColor: family.id === selectedFamilyId ? "var(--mode-accent-subtle)" : "var(--graph-panel-input-bg)",
          }}
        >
          <Group gap={6}>
            <MetaPill mono>{family.id}</MetaPill>
            <Text fw={600} style={panelTextStyle}>
              {family.title}
            </Text>
          </Group>
          <Text mt={6} className="font-mono text-[11px]" style={panelTextDimStyle}>
            {family.primitive}
          </Text>
        </a>
      ))}
    </div>
  );
}

function SelectedFamilySummary({
  family,
  inventoryRow,
}: {
  family: SurfaceFamilyDefinition;
  inventoryRow?: SurfaceInventoryRow;
}) {
  return (
    <div className={panelAccentCardClassName} style={panelAccentCardStyle}>
      <Group gap={6}>
        <MetaPill mono>{family.id}</MetaPill>
        <Text fw={600} style={panelTextStyle}>
          Selected Family
        </Text>
      </Group>
      <Text mt={8} fw={600} style={panelTextStyle}>
        {family.title}
      </Text>
      <Text mt={4} className="font-mono text-[11px]" style={panelTextDimStyle}>
        {family.primitive}
      </Text>
      <Text mt={6} style={panelTextDimStyle}>
        {family.summary}
      </Text>
      {inventoryRow && (
        <>
          <Text mt={8} style={panelTextDimStyle}>
            {inventoryRow.propagation}
          </Text>
          {inventoryRow.adopters.length > 0 && (
            <Group mt={8} gap={6}>
              {inventoryRow.adopters.map((adopter) => (
                <MetaPill key={`${family.id}:${adopter}`} title={adopter}>
                  {adopter}
                </MetaPill>
              ))}
            </Group>
          )}
        </>
      )}
    </div>
  );
}

function SurfaceFamilyCard({
  family,
  selected,
  onSelect,
  children,
}: {
  family: SurfaceFamilyDefinition;
  selected: boolean;
  onSelect: (familyId: string) => void;
  children: ReactNode;
}) {
  return (
    <section
      id={`surface-family-${family.slug}`}
      data-surface-family={family.id}
      className="overflow-hidden rounded-[1.15rem] transition-colors"
      onClick={() => onSelect(family.id)}
      style={{
        ...panelSurfaceStyle,
        scrollMarginTop: 96,
      }}
    >
      <div
        className="border-b px-4 py-3"
        style={{
          borderColor: selected ? "var(--mode-accent-border)" : "var(--graph-panel-border)",
          backgroundColor: selected ? "var(--mode-accent-subtle)" : undefined,
        }}
      >
        <Group gap={6}>
          <MetaPill mono>{family.id}</MetaPill>
          <Text fw={600} style={panelTextStyle}>
            {family.title}
          </Text>
          {selected && <MetaPill>Selected</MetaPill>}
        </Group>
        <Text mt={6} className="font-mono text-[11px]" style={panelTextDimStyle}>
          {family.primitive}
        </Text>
        <Text mt={6} style={panelTextDimStyle}>
          {family.summary}
        </Text>
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

export function SurfaceLabPage({ inventoryRows }: { inventoryRows: SurfaceInventoryRow[] }) {
  const [accent, setAccent] = useState<string>(accentOptions[0].value);
  const [shellVariant, setShellVariant] = useState<ShellVariantOption>("desktop");
  const [panelTone, setPanelTone] = useState<PanelTone>("neutral");
  const [promptTone, setPromptTone] = useState<PromptTone>("neutral");
  const [density, setDensity] = useState(0.8);
  const [panelScale, setPanelScale] = useState(1);
  const [selectedFamilyId, setSelectedFamilyId] = useState(surfaceFamilyDefinitions[0].id);
  const [previewColorScheme, setPreviewColorScheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const syncFromHash = () => {
      const familyId = familyIdFromHash(window.location.hash);
      if (familyId) {
        setSelectedFamilyId(familyId);
      }
    };

    syncFromHash();
    window.addEventListener("hashchange", syncFromHash);
    return () => window.removeEventListener("hashchange", syncFromHash);
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const syncColorScheme = () => setPreviewColorScheme(readDocumentColorScheme());
    syncColorScheme();

    const observer = new MutationObserver(syncColorScheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => observer.disconnect();
  }, []);

  const previewVars = useMemo(
    () => buildPreviewVars({
      accent,
      colorScheme: previewColorScheme,
      density,
      panelScale,
      panelTone,
      promptTone,
    }),
    [accent, density, panelScale, panelTone, previewColorScheme, promptTone],
  );

  const accentRef = getAccentRef(accent);
  const selectedFamily = surfaceFamilyDefinitions.find((family) => family.id === selectedFamilyId) ?? surfaceFamilyDefinitions[0];
  const selectedInventoryRow = inventoryRows.find((row) => row.primitive === selectedFamily.primitive);
  const surfaceFamilyPreviews = [
    { family: surfaceFamilyDefinitions[0], preview: <ReadingPanelPreview /> },
    { family: surfaceFamilyDefinitions[1], preview: <BottomTrayPreview /> },
    { family: surfaceFamilyDefinitions[2], preview: <PopoverPreview /> },
    { family: surfaceFamilyDefinitions[3], preview: <HoverCardPreview /> },
    { family: surfaceFamilyDefinitions[4], preview: <OverlayPreview /> },
    { family: surfaceFamilyDefinitions[5], preview: <PromptPreview /> },
  ];

  return (
    <main className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <Text fw={700} className="text-[1.8rem]" style={panelTextStyle}>
            Surface Lab
          </Text>
          <Text mt={6} maw={760} style={panelTextDimStyle}>
            Centralized preview for the standardized panel shells, transient surfaces, overlay
            family, pill grammar, and shared style contracts. Accent, density, and surface tones are
            scoped to the lab so you can see how one change propagates through the real system.
          </Text>
        </div>

        <div
          className="flex items-center gap-2 rounded-full px-2.5 py-1.5"
          style={{ ...panelSurfaceStyle, borderRadius: 999 }}
        >
          <Text fw={600} style={panelTextStyle}>
            Appearance
          </Text>
          <MetaPill>{previewColorScheme === "dark" ? "Dark mode" : "Light mode"}</MetaPill>
          <ThemeToggle />
        </div>
      </header>

      <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="xl:sticky xl:top-6 xl:self-start">
          <SectionCard
            title="Controls"
            description="These controls override shared CSS variables inside the preview surface only."
          >
            <Stack gap="md">
              <div>
                <Text mb={6} fw={600} style={panelTextStyle}>Accent</Text>
                <Select
                  value={accent}
                  onChange={(value) => value && setAccent(value)}
                  styles={panelSelectStyles}
                  data={accentOptions.map((option) => ({
                    value: option.value,
                    label: option.label,
                  }))}
                />
              </div>

              <div>
                <Text mb={6} fw={600} style={panelTextStyle}>Shell variant</Text>
                <SegmentedControl
                  value={shellVariant}
                  onChange={(value) => setShellVariant(value as ShellVariantOption)}
                  styles={compactSegmentedControlStyles}
                  data={[
                    { label: "Desktop", value: "desktop" },
                    { label: "Mobile", value: "mobile" },
                  ]}
                />
              </div>

              <div>
                <Text mb={6} fw={600} style={panelTextStyle}>Panel tone</Text>
                <SegmentedControl
                  value={panelTone}
                  onChange={(value) => setPanelTone(value as PanelTone)}
                  styles={compactSegmentedControlStyles}
                  data={[
                    { label: "Neutral", value: "neutral" },
                    { label: "Soft", value: "soft" },
                    { label: "Washed", value: "washed" },
                  ]}
                />
              </div>

              <div>
                <Text mb={6} fw={600} style={panelTextStyle}>Prompt tone</Text>
                <SegmentedControl
                  value={promptTone}
                  onChange={(value) => setPromptTone(value as PromptTone)}
                  styles={compactSegmentedControlStyles}
                  data={[
                    { label: "Neutral", value: "neutral" },
                    { label: "Panel", value: "panel" },
                    { label: "Accent", value: "accent" },
                  ]}
                />
              </div>

              <div>
                <Group justify="space-between" mb={6}>
                  <Text fw={600} style={panelTextStyle}>Density</Text>
                  <Text className="font-mono text-[11px]" style={panelTextDimStyle}>
                    {density.toFixed(2)}
                  </Text>
                </Group>
                <Slider
                  min={0.65}
                  max={1.15}
                  step={0.05}
                  value={density}
                  onChange={setDensity}
                />
              </div>

              <div>
                <Group justify="space-between" mb={6}>
                  <Text fw={600} style={panelTextStyle}>Reading scale</Text>
                  <Text className="font-mono text-[11px]" style={panelTextDimStyle}>
                    {panelScale.toFixed(2)}
                  </Text>
                </Group>
                <Slider
                  min={0.8}
                  max={1.4}
                  step={0.05}
                  value={panelScale}
                  onChange={setPanelScale}
                />
              </div>

              <div className="rounded-xl p-3" style={panelCardStyle}>
                <Text fw={600} style={panelTextStyle}>Current accent</Text>
                <div
                  className="mt-3 h-12 rounded-lg"
                  style={{ background: accentRef }}
                />
                <Text mt={8} className="font-mono text-[11px]" style={panelTextDimStyle}>
                  {accentRef}
                </Text>
              </div>
            </Stack>
          </SectionCard>
        </aside>

        <div
          className="space-y-6 rounded-[1.5rem] p-4 sm:p-5"
          style={{ ...panelSurfaceStyle, ...previewVars, backgroundColor: "var(--background)" }}
        >
          <ShellVariantProvider value={shellVariant}>
            <SectionCard
              title="Token Preview"
              description="Live token swatches after the lab-specific overrides are applied."
            >
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <TokenSwatch label="Mode accent" token="--mode-accent" value="var(--mode-accent)" />
                <TokenSwatch label="Accent subtle" token="--mode-accent-subtle" value="var(--mode-accent-subtle)" />
                <TokenSwatch label="Panel background" token="--graph-panel-bg" value="var(--graph-panel-bg)" />
                <TokenSwatch label="Panel input" token="--graph-panel-input-bg" value="var(--graph-panel-input-bg)" />
                <TokenSwatch label="Prompt background" token="--graph-prompt-bg" value="var(--graph-prompt-bg)" />
                <TokenSwatch label="Control hover" token="--graph-control-hover-bg" value="var(--graph-control-hover-bg)" />
                <TokenSwatch label="Overlay scrim" token="--graph-overlay-scrim" value="var(--graph-overlay-scrim)" />
                <TokenSwatch label="Surface alt" token="--surface-alt" value="var(--surface-alt)" />
              </div>
            </SectionCard>

            <SectionCard
              title="Surface Families"
              description="These are the semantic shells that should absorb future stylistic changes instead of feature-local one-offs. Use the stable IDs when giving feedback so we can refer to one family unambiguously."
            >
              <div className="space-y-4">
                <SurfaceFamilyDirectory
                  families={surfaceFamilyDefinitions}
                  selectedFamilyId={selectedFamilyId}
                  onSelect={setSelectedFamilyId}
                />
                <SelectedFamilySummary family={selectedFamily} inventoryRow={selectedInventoryRow} />
                <div className="grid gap-4 xl:grid-cols-2">
                  {surfaceFamilyPreviews.map(({ family, preview }) => (
                    <SurfaceFamilyCard
                      key={family.id}
                      family={family}
                      selected={family.id === selectedFamilyId}
                      onSelect={setSelectedFamilyId}
                    >
                      {preview}
                    </SurfaceFamilyCard>
                  ))}
                </div>
              </div>
            </SectionCard>

            <SectionCard
              title="Content Primitives"
              description="Shared cards, pills, and style contracts reused across the higher-level surface families."
            >
              <PrimitivesPreview />
            </SectionCard>

            <SectionCard
              title="Adoption Inventory"
              description="Human-readable audit of which semantic shells and style contracts are live in product code and will auto-propagate when updated."
            >
              <AdoptionInventory rows={inventoryRows} />
            </SectionCard>

            <SectionCard
              title="Brand Token Wall"
              description="Core Brand is the website aesthetic. Semantic and system groups exist for meaning and mechanics, not because the brand should feel like dozens of unrelated colors."
            >
              <BrandTokenWall />
            </SectionCard>

            <SectionCard
              title="Later Consideration"
              description="Backlog ideas for making this lab more direct-manipulation and more agent-readable without doing that implementation in this pass."
            >
              <LaterConsideration />
            </SectionCard>
          </ShellVariantProvider>
        </div>
      </div>
    </main>
  );
}
