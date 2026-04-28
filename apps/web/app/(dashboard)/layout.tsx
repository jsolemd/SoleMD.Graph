import { DashboardClientShell } from "./DashboardClientShell";

/**
 * Dashboard route-group layout.
 *
 * Server component wrapper around DashboardClientShell. The shell owns
 * the landing FieldCanvas plus shared shell/runtime providers. The /graph
 * 3D orb owns its raw WebGPU canvas inside OrbSurface; the 2D graph lens
 * remains native Cosmograph.
 */
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <DashboardClientShell>{children}</DashboardClientShell>;
}
