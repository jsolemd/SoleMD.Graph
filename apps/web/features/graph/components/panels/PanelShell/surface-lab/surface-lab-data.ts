export type ShellVariantOption = "desktop" | "mobile";
export type PanelTone = "neutral" | "soft" | "washed";
export type PromptTone = "neutral" | "panel" | "accent";

export interface SurfaceFamilyDefinition {
  id: string;
  slug: string;
  title: string;
  primitive: string;
  summary: string;
}

export const accentOptions = [
  { value: "soft-blue", label: "Soft Blue", token: "--color-soft-blue" },
  { value: "muted-indigo", label: "Muted Indigo", token: "--color-muted-indigo" },
  { value: "golden-yellow", label: "Golden Yellow", token: "--color-golden-yellow" },
  { value: "fresh-green", label: "Fresh Green", token: "--color-fresh-green" },
  { value: "warm-coral", label: "Warm Coral", token: "--color-warm-coral" },
  { value: "soft-pink", label: "Soft Pink", token: "--color-soft-pink" },
  { value: "soft-lavender", label: "Soft Lavender", token: "--color-soft-lavender" },
  { value: "seafoam", label: "Seafoam", token: "--color-seafoam" },
] as const;

export const surfaceFamilyDefinitions: SurfaceFamilyDefinition[] = [
  {
    id: "SF-01",
    slug: "reading-panel",
    title: "Reading Panel",
    primitive: "PanelShell / PanelChrome / PanelBody",
    summary: "Canonical docked inspection panel for detail, evidence, and RAG reading flows.",
  },
  {
    id: "SF-02",
    slug: "bottom-tray",
    title: "Bottom Tray",
    primitive: "BottomTrayShell",
    summary: "Docked bottom tray for tabular exploration and result review.",
  },
  {
    id: "SF-03",
    slug: "popover",
    title: "Popover",
    primitive: "PopoverSurface",
    summary: "Anchored dropdown and search-result surface for short transient lists.",
  },
  {
    id: "SF-04",
    slug: "hover-card",
    title: "Hover Card",
    primitive: "FloatingHoverCard",
    summary: "Positioned hover surface for entity summaries and quick actions.",
  },
  {
    id: "SF-05",
    slug: "overlay",
    title: "Overlay",
    primitive: "OverlaySurface / OverlayCard",
    summary: "Fullscreen scrim plus card family for modal-like graph explorations.",
  },
  {
    id: "SF-06",
    slug: "prompt-chrome",
    title: "Prompt Chrome",
    primitive: "promptSurfaceStyle",
    summary: "Floating prompt shell and control cluster for ask/search interactions.",
  },
] as const;

export const tokenWallGroups = [
  {
    title: "Core Brand",
    description: "These are the memorable brand-facing hues. If the site feels too colorful, this is the first group to tune.",
    tokens: [
      { label: "Soft Blue", token: "--color-soft-blue" },
      { label: "Muted Indigo", token: "--color-muted-indigo" },
      { label: "Golden Yellow", token: "--color-golden-yellow" },
      { label: "Fresh Green", token: "--color-fresh-green" },
      { label: "Warm Coral", token: "--color-warm-coral" },
      { label: "Soft Pink", token: "--color-soft-pink" },
      { label: "Soft Lavender", token: "--color-soft-lavender" },
      { label: "Seafoam", token: "--color-seafoam" },
      { label: "Paper", token: "--color-paper" },
      { label: "Teal", token: "--color-teal" },
    ],
  },
  {
    title: "Semantic Accents",
    description: "These colors encode graph and wiki meaning. They are not all equal parts of the brand voice.",
    tokens: [
      { label: "Disorder", token: "--color-semantic-disorder" },
      { label: "Chemical", token: "--color-semantic-chemical" },
      { label: "Gene", token: "--color-semantic-gene" },
      { label: "Anatomy", token: "--color-semantic-anatomy" },
      { label: "Physiology", token: "--color-semantic-physiology" },
      { label: "Procedure", token: "--color-semantic-procedure" },
      { label: "Section", token: "--color-semantic-section" },
      { label: "Paper", token: "--color-semantic-paper" },
      { label: "Module", token: "--color-semantic-module" },
    ],
  },
  {
    title: "Entity Accents",
    description: "Resolved accent per [data-entity-type]. These are aliases onto the semantic palette — the cascade is what lets pills, hover cards, and entity profiles pick up the right color without hand-tuning at every call site.",
    tokens: [
      { label: "Disease", token: "--color-semantic-disorder" },
      { label: "Chemical", token: "--color-semantic-chemical" },
      { label: "Gene / Receptor", token: "--color-semantic-gene" },
      { label: "Anatomy", token: "--color-semantic-anatomy" },
      { label: "Network / Biological Process", token: "--color-semantic-physiology" },
      { label: "Species", token: "--color-semantic-procedure" },
      { label: "Module", token: "--color-semantic-module" },
    ],
  },
  {
    title: "Extended Pastels",
    description: "Wider palette used for entity pills, mode variety, and Table-of-Contents dots. Same pastel vocabulary as the core brand; different hue anchors.",
    tokens: [
      { label: "Seafoam", token: "--color-seafoam" },
      { label: "Amber", token: "--color-amber" },
      { label: "Sky", token: "--color-sky" },
      { label: "Rose", token: "--color-rose" },
      { label: "Mint", token: "--color-mint" },
      { label: "Orchid", token: "--color-orchid" },
      { label: "Maize", token: "--color-maize" },
      { label: "Powder", token: "--color-powder" },
      { label: "Peach", token: "--color-peach" },
      { label: "Sage", token: "--color-sage" },
      { label: "Plum", token: "--color-plum" },
      { label: "Pear", token: "--color-pear" },
    ],
  },
  {
    title: "Foundations",
    description: "Neutral and foundational variables that carry the site’s calm medical tone in both light and dark.",
    tokens: [
      { label: "Background", token: "--background" },
      { label: "Surface", token: "--surface" },
      { label: "Surface Alt", token: "--surface-alt" },
      { label: "Text Primary", token: "--text-primary" },
      { label: "Text Secondary", token: "--text-secondary" },
      { label: "Text Tertiary", token: "--text-tertiary" },
      { label: "Border Default", token: "--border-default" },
      { label: "Border Subtle", token: "--border-subtle" },
    ],
  },
  {
    title: "Mode & Brand",
    description: "Derived accent tokens that drive interaction states and mode emphasis.",
    tokens: [
      { label: "Brand Accent", token: "--brand-accent" },
      { label: "Brand Accent Alt", token: "--brand-accent-alt" },
      { label: "Mode Accent", token: "--mode-accent" },
      { label: "Accent Subtle", token: "--mode-accent-subtle" },
      { label: "Accent Hover", token: "--mode-accent-hover" },
      { label: "Filter Base", token: "--filter-bar-base" },
      { label: "Filter Active", token: "--filter-bar-active" },
      { label: "Filter Marker", token: "--filter-bar-marker" },
    ],
  },
  {
    title: "Panel & Prompt",
    description: "These are the real surface variables consumed by the modular panel system.",
    tokens: [
      { label: "Panel Background", token: "--graph-panel-bg" },
      { label: "Panel Border", token: "--graph-panel-border" },
      { label: "Panel Input", token: "--graph-panel-input-bg" },
      { label: "Panel Hover", token: "--graph-panel-hover" },
      { label: "Prompt Background", token: "--graph-prompt-bg" },
      { label: "Prompt Divider", token: "--graph-prompt-divider" },
      { label: "Prompt Text", token: "--graph-prompt-text" },
      { label: "Prompt Placeholder", token: "--graph-prompt-placeholder" },
    ],
  },
  {
    title: "Overlay & Feedback",
    description: "Global states and scrims that influence perceived polish more than conscious brand recall.",
    tokens: [
      { label: "Overlay Scrim", token: "--graph-overlay-scrim" },
      { label: "Overlay Strong", token: "--graph-overlay-scrim-strong" },
      { label: "Warning Background", token: "--feedback-warning-bg" },
      { label: "Warning Border", token: "--feedback-warning-border" },
      { label: "Danger Accent", token: "--feedback-danger-accent" },
      { label: "Danger Background", token: "--feedback-danger-bg" },
      { label: "Danger Border", token: "--feedback-danger-border" },
    ],
  },
] as const;

export type InventoryStatus = "Canonical" | "Live" | "Style Contract";

export interface SurfaceInventoryRow {
  primitive: string;
  role: string;
  status: InventoryStatus;
  adopters: string[];
  propagation: string;
  note: string;
}

interface SurfaceInventoryDefinition extends Omit<SurfaceInventoryRow, "adopters"> {
  matchers: string[];
  excludePaths?: string[];
}

export const surfaceInventoryDefinitions: SurfaceInventoryDefinition[] = [
  {
    primitive: "PanelShell / PanelChrome / PanelBody",
    role: "Canonical reading-panel shell",
    status: "Canonical",
    propagation: "Yes. Structural shell and token changes propagate across the main docked reading panels.",
    note: "This is already the platform-level panel contract; the lab previews it directly.",
    matchers: ["<PanelShell"],
    excludePaths: ["/PanelShell/PanelShell.tsx"],
  },
  {
    primitive: "panelSurfaceStyle",
    role: "Core panel surface contract",
    status: "Style Contract",
    propagation: "Yes. Background, border, and shadow updates flow into the main reading shell and any other panel-family adopters.",
    note: "This is the real base visual contract for panel-like surfaces; wrappers should not fork it without a role-driven reason.",
    matchers: ["panelSurfaceStyle"],
    excludePaths: ["/panel-styles.ts"],
  },
  {
    primitive: "BottomTrayShell",
    role: "Bottom tray family",
    status: "Live",
    propagation: "Yes. Tray chrome changes propagate to the docked data table tray.",
    note: "Canonical tray shell introduced in this cleanup.",
    matchers: ["BottomTrayShell"],
    excludePaths: ["/BottomTrayShell.tsx"],
  },
  {
    primitive: "PopoverSurface",
    role: "Anchored popover/dropdown family",
    status: "Live",
    propagation: "Yes. Shared popover surface updates propagate to these menus immediately.",
    note: "Used for floating menus and search result lists.",
    matchers: ["PopoverSurface"],
    excludePaths: ["/PopoverSurface.tsx"],
  },
  {
    primitive: "promptSurfaceStyle",
    role: "Transient prompt/menu surface contract",
    status: "Style Contract",
    propagation: "Yes. Floating prompt/menu chrome updates propagate anywhere this shared prompt surface contract is consumed.",
    note: "This is the shared transient family behind popovers, prompt controls, and hover-like affordances.",
    matchers: ["promptSurfaceStyle"],
    excludePaths: ["/panel-styles.ts"],
  },
  {
    primitive: "FloatingHoverCard",
    role: "Positioned hover-card adapter",
    status: "Live",
    propagation: "Yes. Hover-card positioning and shared prompt chrome changes propagate to entity hovers through one adapter.",
    note: "This stays as behavior, not as a separate visual family.",
    matchers: ["FloatingHoverCard"],
    excludePaths: ["/FloatingHoverCard.tsx"],
  },
  {
    primitive: "OverlaySurface / OverlayCard",
    role: "Fullscreen overlay family",
    status: "Live",
    propagation: "Yes. Overlay scrim/card changes propagate to fullscreen wiki overlays.",
    note: "Shared blur, scrim, and card framing live here now.",
    matchers: ["OverlaySurface", "OverlayCard"],
    excludePaths: ["/OverlaySurface.tsx"],
  },
  {
    primitive: "MetaPill",
    role: "Compact meta-pill primitive",
    status: "Live",
    propagation: "Yes. Pill spacing, borders, and entity-accent behavior now update in both places.",
    note: "The local WikiPageHeader pill fork is removed in this pass.",
    matchers: ["MetaPill"],
    excludePaths: ["/MetaPill.tsx"],
  },
  {
    primitive: "insetCodeBlockStyle",
    role: "Inset code/output style contract",
    status: "Style Contract",
    propagation: "Yes. Shared inset code styling now drives SQL output blocks without needing a wrapper component.",
    note: "Centralized as a style export because the wrapper was thinner than the contract itself.",
    matchers: ["insetCodeBlockStyle"],
    excludePaths: ["/surface-styles.ts"],
  },
  {
    primitive: "insetTableFrameStyle",
    role: "Inset table-frame style contract",
    status: "Style Contract",
    propagation: "Yes. Shared frame updates propagate to tabular query output without keeping a thin wrapper alive.",
    note: "Useful where a bordered table frame should read like native panel chrome.",
    matchers: ["insetTableFrameStyle"],
    excludePaths: ["/surface-styles.ts"],
  },
  {
    primitive: "compactSegmentedControlStyles",
    role: "Compact segmented-control style contract",
    status: "Style Contract",
    propagation: "Yes for adopters using the shared style object.",
    note: "This is style-level standardization rather than a wrapper component.",
    matchers: ["compactSegmentedControlStyles"],
    excludePaths: ["/surface-styles.ts"],
  },
  {
    primitive: "ThemeToggle",
    role: "Global light/dark appearance control",
    status: "Live",
    propagation: "Yes. This flips the app-level color scheme instead of lab-only demo state.",
    note: "Use this to evaluate every token family in both light and dark mode.",
    matchers: ["ThemeToggle"],
    excludePaths: ["/ThemeToggle.tsx"],
  },
];

export const laterConsiderationItems = [
  {
    title: "Primitive pruning review",
    description: "Periodically re-check low-adoption wrappers and collapse any new single-purpose abstractions back into the shared shell or style-contract layer.",
  },
  {
    title: "Click-to-select surface targeting",
    description: "Now that the lab exposes stable family IDs, add direct click selection so a chosen surface can light up its exact primitive, tokens, and adopters.",
  },
  {
    title: "Agent-readable highlight mapping",
    description: "Map UI selection state back to real primitives and token vars so an agent can translate a highlighted region into exact code ownership.",
  },
  {
    title: "Drag-and-drop token reassignment",
    description: "Let you drag a brand swatch onto a target surface token and preview the remap before deciding whether to persist it.",
  },
  {
    title: "Apply-to-system workflow",
    description: "Turn a previewed token change into a controlled update across the real shared token layer and its live adopters.",
  },
] as const;
