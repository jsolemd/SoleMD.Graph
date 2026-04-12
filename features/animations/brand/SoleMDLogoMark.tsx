"use client";
/**
 * SoleMD logomark — a simple, scalable brain glyph for favicon, app-icon,
 * mono-print and inline-with-text contexts. Separate from the animated
 * brand expression at SoleMDLogo.tsx (which stays as the hero mark).
 *
 * Template: Lucide React's Brain icon (ISC licensed, 8 clean strokes,
 * symmetric, mono-capable). No hand-drawn SVG geometry.
 */
import { Brain } from "lucide-react";

type Variant = "chip" | "plain";

interface Props {
  size?: number;
  variant?: Variant;
  className?: string;
}

export default function SoleMDLogoMark({
  size = 48,
  variant = "chip",
  className,
}: Props) {
  if (variant === "plain") {
    return (
      <Brain
        size={size}
        strokeWidth={1.75}
        role="img"
        aria-label="SoleMD"
        className={className}
      />
    );
  }

  const iconSize = Math.round(size * 0.62);
  const radius = Math.round(size * 0.25);

  return (
    <div
      role="img"
      aria-label="SoleMD"
      className={className}
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        backgroundColor: "var(--color-soft-pink)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Brain
        size={iconSize}
        strokeWidth={1.8}
        color="var(--surface, #18181b)"
        aria-hidden
      />
    </div>
  );
}
