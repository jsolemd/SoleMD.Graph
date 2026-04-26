// Server-startup hook: load `.env*` from the monorepo root into the SSR
// runtime's `process.env` before any request is dispatched. Next's own
// loader (called via `next.config.ts`) only sees the app dir; calling
// `loadEnvConfig` from there is a no-op for monorepo-root vars because
// `@next/env` caches the initial-env diff. Doing it here, with
// `forceReload: true`, bypasses that cache and runs in the same Node
// process that handles page/server-component requests.
//
// Root discovery: walk up from `process.cwd()` until we find the
// `package.json` that declares npm workspaces — that *is* the monorepo
// root, by definition. No layout assumptions, no `__dirname` (Turbopack
// rewrites it for bundled server modules), no fixed step count.
//
// Imports are dynamic and gated on `NEXT_RUNTIME === 'nodejs'` because
// `@next/env`, `node:fs`, and `node:path` are Node-only — a static
// `import` would trip Next's edge-runtime static analysis even with a
// runtime guard.
//
// See docs/rag/05b-graph-bundles.md §11.7 for the dev-fixture context.
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  const path = await import('node:path')
  const fs = await import('node:fs')
  const { loadEnvConfig } = await import('@next/env')

  const monorepoRoot = findWorkspacesRoot(process.cwd(), path, fs)
  loadEnvConfig(
    monorepoRoot,
    process.env.NODE_ENV !== 'production',
    undefined,
    true,
  )

  if (!process.env.DATABASE_URL) {
    throw new Error(
      `[instrumentation] DATABASE_URL is unset after loading env from ${monorepoRoot}/.env.local. ` +
        'Confirm the file exists and declares DATABASE_URL.',
    )
  }
}

function findWorkspacesRoot(
  start: string,
  path: typeof import('node:path'),
  fs: typeof import('node:fs'),
): string {
  let dir = path.resolve(start)
  while (true) {
    const pkgPath = path.join(dir, 'package.json')
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as {
          workspaces?: unknown
        }
        if (pkg.workspaces) return dir
      } catch {
        // Malformed package.json — keep walking; not our anchor.
      }
    }
    const parent = path.dirname(dir)
    if (parent === dir) {
      throw new Error(
        `[instrumentation] no workspaces-declaring package.json found walking up from ${start}. ` +
          'Launch the dev server from inside the monorepo.',
      )
    }
    dir = parent
  }
}
