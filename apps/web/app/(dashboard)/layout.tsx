import { DashboardClientShell } from "./DashboardClientShell";

/**
 * Dashboard route-group layout.
 *
 * Server component wrapper around DashboardClientShell. The shell owns
 * the R3F FieldCanvas, ShellVariantProvider, FieldModeProvider,
 * FieldSceneStoreProvider, and FieldRuntimeContext so those persist
 * across `router.replace('/' ↔ '/graph')` navigations under Next 16's
 * `cacheComponents: true` — the Canvas/WebGL context stays mounted
 * while `{children}` (landing or orb) swaps around it.
 */
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <DashboardClientShell>{children}</DashboardClientShell>;
}
