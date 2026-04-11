"use client";
import { useRef } from "react";
import { FileText, Network } from "lucide-react";
import { AnimatedBeam } from "../../_thirdparty/magic-ui/animated-beam/AnimatedBeam";

function Node({
  anchorRef,
  icon: Icon,
  label,
  tint,
}: {
  anchorRef: React.RefObject<HTMLDivElement | null>;
  icon: typeof FileText;
  label: string;
  tint: string;
}) {
  return (
    <div
      ref={anchorRef}
      className="relative z-10 flex h-16 w-16 flex-col items-center justify-center gap-1 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface)] shadow-[var(--shadow-md)]"
      style={{ color: tint }}
    >
      <Icon size={24} strokeWidth={1.75} />
      <span className="text-[10px] font-medium tracking-wide" style={{ color: "var(--text-primary)" }}>
        {label}
      </span>
    </div>
  );
}

export default function AnimatedBeamDemo() {
  const containerRef = useRef<HTMLDivElement>(null);
  const fromRef = useRef<HTMLDivElement>(null);
  const toRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={containerRef}
      className="relative flex h-[280px] w-full items-center justify-between px-12"
    >
      <Node anchorRef={fromRef} icon={FileText} label="Make" tint="var(--color-soft-pink)" />
      <Node anchorRef={toRef} icon={Network} label="Graph" tint="var(--color-soft-blue)" />
      <AnimatedBeam
        containerRef={containerRef}
        fromRef={fromRef}
        toRef={toRef}
        curvature={-60}
        duration={3}
      />
    </div>
  );
}
