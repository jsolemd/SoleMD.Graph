import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { loadEnvConfig } from '@next/env'

// Server-startup hook: load `.env*` from the monorepo root into the SSR
// runtime's `process.env` before any request is dispatched. Next's own
// loader (called via `next.config.ts`) only sees the app dir; calling
// `loadEnvConfig` from there is a no-op for monorepo-root vars because
// `@next/env` caches the initial-env diff. Doing it here, with
// `forceReload: true`, bypasses that cache and runs in the same Node
// process that handles page/server-component requests.
//
// Root discovery: walk up from `process.cwd()` until we find the
// `package.json` that declares npm workspaces. That is the monorepo root by
// definition, without layout assumptions, `__dirname`, or a fixed step count.
//
// This file is imported only when `NEXT_RUNTIME === 'nodejs'` from
// `instrumentation.ts`, keeping Node-only imports out of the Edge-analyzed
// instrumentation entrypoint.
//
// See docs/rag/05b-graph-bundles.md section 11.7 for the dev-fixture context.
export function registerNodeInstrumentation(): void {
  const monorepoRoot = findWorkspacesRoot(process.cwd())

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

function findWorkspacesRoot(start: string): string {
  let dir = path.resolve(start)

  while (true) {
    const pkgPath = path.join(dir, 'package.json')

    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as {
          workspaces?: unknown
        }

        if (pkg.workspaces) return dir
      } catch {
        // Malformed package.json: keep walking because this is not our anchor.
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
