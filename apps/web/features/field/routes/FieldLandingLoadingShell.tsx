export function FieldLandingLoadingShell() {
  return (
    <div
      aria-busy="true"
      aria-label="SoleMD is preparing the landing page"
      className="grid min-h-screen place-items-center px-6"
      style={{
        backgroundColor: "var(--background)",
        color: "var(--text-primary)",
      }}
    >
      <div className="flex flex-col items-center gap-3 text-center">
        <div
          className="text-2xl font-semibold tracking-normal"
          style={{ color: "var(--graph-wordmark-text)" }}
        >
          SoleMD
        </div>
        <div
          className="max-w-xs text-sm leading-6"
          style={{ color: "var(--text-secondary)" }}
        >
          Biomedical knowledge, organized.
        </div>
      </div>
    </div>
  );
}
