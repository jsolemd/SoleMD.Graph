import Link from "next/link";

/**
 * Orb-mode stub.
 *
 * The 3D field-as-orb renderer activates here in step 5 of the
 * orb-as-field-particles pivot. Until then, `/graph` is reachable but
 * intentionally minimal — Cosmograph users should use `/map` (which
 * remains the daily-driver 2D graph) and the field substrate is
 * currently demonstrable at `/` (landing).
 */
export default function GraphPage() {
  return (
    <main
      className="flex min-h-screen items-center justify-center px-6"
      style={{ backgroundColor: "var(--background)" }}
    >
      <div
        className="max-w-[520px] rounded-[1.5rem] border px-8 py-8 text-center"
        style={{
          backgroundColor: "var(--graph-panel-bg)",
          borderColor: "var(--graph-panel-border)",
          boxShadow: "var(--graph-panel-shadow)",
        }}
      >
        <p
          className="text-xs font-semibold uppercase tracking-[0.14em]"
          style={{ color: "var(--graph-panel-text-dim)" }}
        >
          Orb Mode · Activating Soon
        </p>
        <h1
          className="mt-4 text-[2rem] font-medium leading-tight tracking-[-0.03em]"
          style={{ color: "var(--graph-panel-text)" }}
        >
          The 3D paper-field graph lights up here shortly.
        </h1>
        <p
          className="mt-4 text-[15px] leading-7"
          style={{
            color:
              "color-mix(in srgb, var(--graph-panel-text) 76%, transparent)",
          }}
        >
          While orb mode is being wired up, the 2D corpus map is fully
          available at <code style={{ fontFamily: "var(--font-jetbrains-mono)" }}>/map</code>.
          The ambient landing page is at{" "}
          <code style={{ fontFamily: "var(--font-jetbrains-mono)" }}>/</code>.
        </p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <Link
            href="/map"
            className="inline-flex rounded-full px-4 py-2 text-sm font-medium transition-[filter] hover:brightness-110"
            style={{
              backgroundColor: "var(--graph-prompt-bg)",
              boxShadow: "var(--graph-prompt-shadow)",
              color: "var(--graph-panel-text)",
            }}
          >
            Open 2D map
          </Link>
          <Link
            href="/"
            className="inline-flex rounded-full px-4 py-2 text-sm font-medium transition-[filter] hover:brightness-110"
            style={{
              backgroundColor: "transparent",
              color: "var(--graph-panel-text)",
              border: "1px solid var(--graph-panel-border)",
            }}
          >
            Landing
          </Link>
        </div>
      </div>
    </main>
  );
}
