"use client";
import SoleMDLogoMark from "./SoleMDLogoMark";
import { MiniConnectome, NeuralPulse, DoubleSpiral, NodeCross } from "./ClaudeCandidates";
import { Snapshot12, Snapshot30, Snapshot70 } from "./DistilledSnapshots";

const SIZES = [16, 32, 64, 128] as const;

interface CandidateRow {
  name: string;
  approach: string;
  render: (size: number, variant: "chip" | "plain") => React.ReactNode;
}

function SnapshotChip({
  size,
  variant,
  children,
}: {
  size: number;
  variant: "chip" | "plain";
  children: (s: number) => React.ReactNode;
}) {
  const s = variant === "chip" ? Math.round(size * 0.62) : size;
  const inner = children(s);
  if (variant === "plain") return <>{inner}</>;
  return (
    <div
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
      {inner}
    </div>
  );
}

const CANDIDATES: CandidateRow[] = [
  {
    name: "Lucide Brain",
    approach: "baseline",
    render: (size, variant) => <SoleMDLogoMark size={size} variant={variant} />,
  },
  {
    name: "Snapshot-12",
    approach: "distilled",
    render: (size, variant) => (
      <SnapshotChip size={size} variant={variant}>
        {(s) => <Snapshot12 size={s} />}
      </SnapshotChip>
    ),
  },
  {
    name: "Snapshot-30",
    approach: "distilled",
    render: (size, variant) => (
      <SnapshotChip size={size} variant={variant}>
        {(s) => <Snapshot30 size={s} />}
      </SnapshotChip>
    ),
  },
  {
    name: "Snapshot-70",
    approach: "distilled",
    render: (size, variant) => (
      <SnapshotChip size={size} variant={variant}>
        {(s) => <Snapshot70 size={s} />}
      </SnapshotChip>
    ),
  },
  {
    name: "MiniConnectome",
    approach: "claude",
    render: (size, variant) => <MiniConnectome size={size} variant={variant} />,
  },
  {
    name: "NeuralPulse",
    approach: "claude",
    render: (size, variant) => <NeuralPulse size={size} variant={variant} />,
  },
  {
    name: "DoubleSpiral",
    approach: "claude",
    render: (size, variant) => <DoubleSpiral size={size} variant={variant} />,
  },
  {
    name: "NodeCross",
    approach: "claude",
    render: (size, variant) => <NodeCross size={size} variant={variant} />,
  },
];

const APPROACH_COLORS: Record<string, string> = {
  baseline: "var(--text-secondary)",
  distilled: "var(--color-soft-blue)",
  claude: "var(--color-soft-lavender)",
};

export default function LogomarkCompare() {
  return (
    <div style={{ overflowX: "auto" }}>
      {/* Chip variant */}
      <h3
        className="mb-3 text-xs font-medium uppercase tracking-wider"
        style={{ color: "var(--text-secondary)" }}
      >
        Chip variant
      </h3>
      <CompareGrid variant="chip" />

      {/* Plain variant */}
      <h3
        className="mb-3 mt-6 text-xs font-medium uppercase tracking-wider"
        style={{ color: "var(--text-secondary)" }}
      >
        Plain variant (dark on light)
      </h3>
      <div className="rounded-lg bg-white p-4">
        <CompareGrid variant="plain" textClass="text-neutral-700" />
      </div>
    </div>
  );
}

function CompareGrid({
  variant,
  textClass = "",
}: {
  variant: "chip" | "plain";
  textClass?: string;
}) {
  return (
    <table style={{ borderCollapse: "collapse", width: "100%" }}>
      <thead>
        <tr>
          <th
            className={`pb-2 pr-4 text-left text-[10px] font-normal ${textClass}`}
            style={{ color: textClass ? undefined : "var(--text-secondary)" }}
          >
            Candidate
          </th>
          {SIZES.map((s) => (
            <th
              key={s}
              className={`pb-2 text-center font-mono text-[10px] font-normal ${textClass}`}
              style={{
                color: textClass ? undefined : "var(--text-secondary)",
                minWidth: Math.max(s + 16, 48),
              }}
            >
              {s}px
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {CANDIDATES.map((c) => (
          <tr
            key={c.name}
            style={{
              borderTop: "1px solid var(--border-subtle, #e5e5e5)",
            }}
          >
            <td className="py-2 pr-4">
              <div className={`text-xs font-medium ${textClass}`} style={{ color: textClass ? undefined : "var(--text-primary)" }}>
                {c.name}
              </div>
              <div
                className="text-[10px]"
                style={{ color: APPROACH_COLORS[c.approach] ?? "var(--text-secondary)" }}
              >
                {c.approach}
              </div>
            </td>
            {SIZES.map((s) => (
              <td key={s} className="py-2" style={{ textAlign: "center", verticalAlign: "middle" }}>
                <div style={{ display: "inline-block" }}>
                  {c.render(s, variant)}
                </div>
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
