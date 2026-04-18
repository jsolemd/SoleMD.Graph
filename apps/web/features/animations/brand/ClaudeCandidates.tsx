"use client";

type Variant = "chip" | "plain";

interface Props {
  size?: number;
  variant?: Variant;
  className?: string;
}

function Chip({
  size,
  children,
  className,
}: {
  size: number;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      role="img"
      aria-label="SoleMD"
      className={className}
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.25),
        backgroundColor: "var(--color-soft-pink)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {children}
    </div>
  );
}

/**
 * MiniConnectome - 7 hand-placed nodes forming a brain silhouette
 * with intentional edges. Curated, not sampled.
 */
export function MiniConnectome({
  size = 48,
  variant = "chip",
  className,
}: Props) {
  const s = variant === "chip" ? Math.round(size * 0.62) : size;
  const stroke = variant === "plain" ? "currentColor" : "var(--surface, #18181b)";
  const fill = variant === "plain" ? "currentColor" : "var(--surface, #18181b)";
  const sw = s < 24 ? 1 : 1.5;
  const r = s < 24 ? s * 0.04 : s * 0.05;

  const svg = (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden={variant === "chip"}
      role={variant === "plain" ? "img" : undefined}
      aria-label={variant === "plain" ? "SoleMD" : undefined}
      className={variant === "plain" ? className : undefined}
    >
      {/* Edges */}
      <g stroke={stroke} strokeWidth={sw} opacity={0.5}>
        <line x1="7" y1="5" x2="12" y2="3" />
        <line x1="12" y1="3" x2="17" y2="5" />
        <line x1="7" y1="5" x2="5" y2="10" />
        <line x1="17" y1="5" x2="19" y2="10" />
        <line x1="5" y1="10" x2="7" y2="15" />
        <line x1="19" y1="10" x2="17" y2="15" />
        <line x1="7" y1="5" x2="12" y2="9" />
        <line x1="17" y1="5" x2="12" y2="9" />
        <line x1="5" y1="10" x2="12" y2="9" />
        <line x1="19" y1="10" x2="12" y2="9" />
        <line x1="12" y1="9" x2="7" y2="15" />
        <line x1="12" y1="9" x2="17" y2="15" />
        <line x1="7" y1="15" x2="10" y2="19" />
        <line x1="17" y1="15" x2="14" y2="19" />
        <line x1="10" y1="19" x2="14" y2="19" />
        <line x1="7" y1="15" x2="17" y2="15" />
        <line x1="14" y1="19" x2="17" y2="21" />
      </g>
      {/* Nodes */}
      <g fill={fill}>
        <circle cx="12" cy="3" r={r * 1.2} />
        <circle cx="7" cy="5" r={r} />
        <circle cx="17" cy="5" r={r} />
        <circle cx="5" cy="10" r={r} />
        <circle cx="19" cy="10" r={r} />
        <circle cx="12" cy="9" r={r * 1.3} />
        <circle cx="7" cy="15" r={r} />
        <circle cx="17" cy="15" r={r} />
        <circle cx="10" cy="19" r={r * 0.9} />
        <circle cx="14" cy="19" r={r * 0.9} />
        <circle cx="17" cy="21" r={r * 0.8} />
      </g>
    </svg>
  );

  if (variant === "plain") return svg;
  return (
    <Chip size={size} className={className}>
      {svg}
    </Chip>
  );
}

/**
 * NeuralPulse - stylized EEG waveform curving into a closed brain profile.
 * Single path, mono-friendly.
 */
export function NeuralPulse({
  size = 48,
  variant = "chip",
  className,
}: Props) {
  const s = variant === "chip" ? Math.round(size * 0.62) : size;
  const stroke = variant === "plain" ? "currentColor" : "var(--surface, #18181b)";
  const sw = s < 24 ? 1.5 : 2;

  const svg = (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden={variant === "chip"}
      role={variant === "plain" ? "img" : undefined}
      aria-label={variant === "plain" ? "SoleMD" : undefined}
      className={variant === "plain" ? className : undefined}
    >
      {/* Brain outline - right hemisphere curve */}
      <path
        d="M12 2 C17 2, 21 5, 21 10 C21 14, 19 17, 16 19 C14 20.5, 13 21, 12 22"
        stroke={stroke}
        strokeWidth={sw}
        strokeLinecap="round"
        fill="none"
      />
      {/* EEG waveform - left hemisphere */}
      <path
        d="M12 22 C11 20, 9 19, 7 18 L8 15 L5 12 L8 10 L4 7 C5 4, 8 2, 12 2"
        stroke={stroke}
        strokeWidth={sw}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      {/* Central sulcus */}
      <path
        d="M12 6 C13 8, 11 10, 12 13"
        stroke={stroke}
        strokeWidth={sw * 0.7}
        strokeLinecap="round"
        opacity={0.5}
        fill="none"
      />
    </svg>
  );

  if (variant === "plain") return svg;
  return (
    <Chip size={size} className={className}>
      {svg}
    </Chip>
  );
}

/**
 * DoubleSpiral - two rotationally-mirrored spirals evoking cortex folds.
 * Pure geometric, no organic curves.
 */
export function DoubleSpiral({
  size = 48,
  variant = "chip",
  className,
}: Props) {
  const s = variant === "chip" ? Math.round(size * 0.62) : size;
  const stroke = variant === "plain" ? "currentColor" : "var(--surface, #18181b)";
  const sw = s < 24 ? 1.5 : 2;

  const svg = (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden={variant === "chip"}
      role={variant === "plain" ? "img" : undefined}
      aria-label={variant === "plain" ? "SoleMD" : undefined}
      className={variant === "plain" ? className : undefined}
    >
      {/* Left spiral - clockwise inward */}
      <path
        d="M12 4 C8 4, 4 7, 4 11 C4 14, 6 16, 9 16 C11 16, 12 14.5, 12 13"
        stroke={stroke}
        strokeWidth={sw}
        strokeLinecap="round"
        fill="none"
      />
      {/* Right spiral - counter-clockwise inward */}
      <path
        d="M12 20 C16 20, 20 17, 20 13 C20 10, 18 8, 15 8 C13 8, 12 9.5, 12 11"
        stroke={stroke}
        strokeWidth={sw}
        strokeLinecap="round"
        fill="none"
      />
      {/* Center bridge */}
      <line
        x1="12"
        y1="11"
        x2="12"
        y2="13"
        stroke={stroke}
        strokeWidth={sw}
        strokeLinecap="round"
      />
    </svg>
  );

  if (variant === "plain") return svg;
  return (
    <Chip size={size} className={className}>
      {svg}
    </Chip>
  );
}

/**
 * NodeCross - medical cross / graph-node hybrid. Plus shape with rounded
 * arms terminating in dots. Caduceus heritage + graph-node affordance.
 */
export function NodeCross({
  size = 48,
  variant = "chip",
  className,
}: Props) {
  const s = variant === "chip" ? Math.round(size * 0.62) : size;
  const stroke = variant === "plain" ? "currentColor" : "var(--surface, #18181b)";
  const fill = variant === "plain" ? "currentColor" : "var(--surface, #18181b)";
  const sw = s < 24 ? 1.5 : 2;
  const r = s < 24 ? 1.2 : 1.5;

  const svg = (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden={variant === "chip"}
      role={variant === "plain" ? "img" : undefined}
      aria-label={variant === "plain" ? "SoleMD" : undefined}
      className={variant === "plain" ? className : undefined}
    >
      {/* Cross arms */}
      <g stroke={stroke} strokeWidth={sw} strokeLinecap="round">
        <line x1="12" y1="4" x2="12" y2="20" />
        <line x1="4" y1="12" x2="20" y2="12" />
      </g>
      {/* Diagonal edges to center */}
      <g stroke={stroke} strokeWidth={sw * 0.6} opacity={0.4} strokeLinecap="round">
        <line x1="7" y1="7" x2="12" y2="12" />
        <line x1="17" y1="7" x2="12" y2="12" />
        <line x1="7" y1="17" x2="12" y2="12" />
        <line x1="17" y1="17" x2="12" y2="12" />
      </g>
      {/* Terminal nodes */}
      <g fill={fill}>
        <circle cx="12" cy="4" r={r} />
        <circle cx="12" cy="20" r={r} />
        <circle cx="4" cy="12" r={r} />
        <circle cx="20" cy="12" r={r} />
        <circle cx="12" cy="12" r={r * 1.3} />
        {/* Diagonal corner nodes */}
        <circle cx="7" cy="7" r={r * 0.8} />
        <circle cx="17" cy="7" r={r * 0.8} />
        <circle cx="7" cy="17" r={r * 0.8} />
        <circle cx="17" cy="17" r={r * 0.8} />
      </g>
    </svg>
  );

  if (variant === "plain") return svg;
  return (
    <Chip size={size} className={className}>
      {svg}
    </Chip>
  );
}
