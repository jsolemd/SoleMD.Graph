import type { GraphBundle } from "./types";

/** Resolve the canonical graph release ID from a bundle. */
export function resolveGraphReleaseId(bundle: GraphBundle): string {
  return (
    bundle.bundleChecksum ||
    bundle.runId ||
    bundle.bundleManifest.graphRunId
  )
}
