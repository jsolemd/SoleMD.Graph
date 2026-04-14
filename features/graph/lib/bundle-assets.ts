import 'server-only'

import { lstat, realpath, stat, symlink, unlink } from 'node:fs/promises'
import path from 'node:path'
import { and, desc, eq } from 'drizzle-orm'

import { db } from '@/lib/db'
import { graphRuns } from '@/lib/db/schema'

import {
  GRAPH_NAME,
  GRAPH_BUNDLE_PUBLISHED_ROOT,
  GRAPH_BUNDLE_ROOT,
  NODE_KIND,
} from './fetch/constants'

interface GraphBundleAssetDescriptor {
  assetPath: string
  etag: string
  size: number
}

let resolvedBundleRootPromise: Promise<string> | null = null
let resolvedPublishedRootPromise: Promise<string> | null = null
const resolvedBundleDirectoryByChecksumCache = new Map<
  string,
  Promise<string | null>
>()

export function buildGraphBundleAssetUrl(bundleChecksum: string, assetPath: string) {
  const encodedAssetPath = assetPath
    .split('/')
    .filter((segment) => segment.length > 0)
    .map((segment) => encodeURIComponent(segment))
    .join('/')

  return `/graph-bundles/${bundleChecksum}/${encodedAssetPath}`
}

async function getResolvedBundleRoot() {
  if (!resolvedBundleRootPromise) {
    resolvedBundleRootPromise = realpath(GRAPH_BUNDLE_ROOT).catch((error) => {
      resolvedBundleRootPromise = null
      throw error
    })
  }

  return resolvedBundleRootPromise
}

async function getResolvedPublishedRoot() {
  if (!resolvedPublishedRootPromise) {
    resolvedPublishedRootPromise = realpath(GRAPH_BUNDLE_PUBLISHED_ROOT)
      .catch((error) => {
        const code = (error as NodeJS.ErrnoException | null)?.code
        if (code === 'ENOENT' || code === 'EACCES' || code === 'EPERM' || code === 'EROFS') {
          return path.resolve(GRAPH_BUNDLE_PUBLISHED_ROOT)
        }
        throw error
      })
      .catch((error) => {
        resolvedPublishedRootPromise = null
        throw error
      })
  }

  return resolvedPublishedRootPromise
}

function buildGraphBundleAssetEtag(args: {
  asset: string
  bundleChecksum: string
  mtimeMs: number
  size: number
}) {
  return `"${args.bundleChecksum}:${args.asset}:${args.size}:${Math.trunc(args.mtimeMs)}"`
}

function resolvePublishedBundleAssetPath(bundleDirectory: string, asset: string) {
  const assetPath = path.resolve(bundleDirectory, asset)

  if (
    assetPath !== bundleDirectory &&
    !assetPath.startsWith(`${bundleDirectory}${path.sep}`)
  ) {
    throw new Error(`Graph bundle asset path escapes bundle directory: ${asset}`)
  }

  return assetPath
}

function assertPathWithinBundleRoot(resolvedRoot: string, resolvedPath: string) {
  if (
    resolvedPath !== resolvedRoot &&
    !resolvedPath.startsWith(`${resolvedRoot}${path.sep}`)
  ) {
    throw new Error(`Graph bundle path escapes configured root: ${resolvedPath}`)
  }
}

async function queryGraphRunBundleDirectory(bundleChecksum: string) {
  const rows = await db
    .select({
      bundleUri: graphRuns.bundleUri,
      graphRunId: graphRuns.id,
    })
    .from(graphRuns)
    .where(
      and(
        eq(graphRuns.graphName, GRAPH_NAME),
        eq(graphRuns.nodeKind, NODE_KIND),
        eq(graphRuns.status, 'completed'),
        eq(graphRuns.bundleChecksum, bundleChecksum),
      )
    )
    .orderBy(desc(graphRuns.createdAt))
    .limit(1)

  return rows[0] ?? null
}

async function resolveBundleDirectoryFromGraphRun(
  bundleChecksum: string,
  resolvedRoot: string
) {
  const row = await queryGraphRunBundleDirectory(bundleChecksum)
  if (!row) {
    return null
  }

  const candidates = [...new Set([
    row.bundleUri,
    path.resolve(resolvedRoot, row.graphRunId),
  ])]

  for (const candidate of candidates) {
    const resolvedCandidate = await realpath(candidate).catch(() => null)
    if (!resolvedCandidate) {
      continue
    }

    assertPathWithinBundleRoot(resolvedRoot, resolvedCandidate)
    return resolvedCandidate
  }

  return null
}

async function recreatePublishedBundleAlias(
  publishedPath: string,
  relativeTarget: string
) {
  try {
    await symlink(relativeTarget, publishedPath, 'dir')
  } catch (error) {
    const err = error as NodeJS.ErrnoException
    if (err.code !== 'EEXIST') {
      throw error
    }

    const currentTarget = await realpath(publishedPath).catch(() => null)
    if (currentTarget) {
      return
    }

    const existingEntry = await lstat(publishedPath).catch(() => null)
    if (!existingEntry?.isSymbolicLink()) {
      throw error
    }

    await unlink(publishedPath)
    await symlink(relativeTarget, publishedPath, 'dir')
  }
}

function isAliasRepairPermissionError(error: unknown) {
  const code = (error as NodeJS.ErrnoException | null)?.code
  return code === 'EACCES' || code === 'EPERM' || code === 'EROFS' || code === 'ENOENT'
}

async function recoverPublishedBundleDirectory(
  bundleChecksum: string,
  resolvedRoot: string,
  resolvedPublishedRoot: string
) {
  const resolvedBundleDirectory = await resolveBundleDirectoryFromGraphRun(
    bundleChecksum,
    resolvedRoot
  )
  if (!resolvedBundleDirectory) {
    return null
  }

  const publishedPath = path.resolve(resolvedPublishedRoot, bundleChecksum)
  const relativeTarget = path.relative(
    resolvedPublishedRoot,
    resolvedBundleDirectory
  )
  if (relativeTarget.length === 0 || path.isAbsolute(relativeTarget)) {
    throw new Error(
      `Graph bundle alias target could not be derived for checksum ${bundleChecksum}`
    )
  }

  try {
    await recreatePublishedBundleAlias(publishedPath, relativeTarget)
  } catch (error) {
    if (!isAliasRepairPermissionError(error)) {
      throw error
    }
  }
  return (await realpath(publishedPath).catch(() => null)) ?? resolvedBundleDirectory
}

async function getResolvedPublishedBundleDirectory(
  bundleChecksum: string,
  resolvedRoot: string,
  resolvedPublishedRoot: string
) {
  let cached = resolvedBundleDirectoryByChecksumCache.get(bundleChecksum)
  if (!cached) {
    cached = (async () => {
      const bundleDirectory = path.resolve(resolvedPublishedRoot, bundleChecksum)
      const resolvedBundleDirectory =
        (await realpath(bundleDirectory).catch(() => null)) ??
        (await recoverPublishedBundleDirectory(
          bundleChecksum,
          resolvedRoot,
          resolvedPublishedRoot
        ))

      if (resolvedBundleDirectory) {
        assertPathWithinBundleRoot(resolvedRoot, resolvedBundleDirectory)
      }

      return resolvedBundleDirectory
    })().catch((error) => {
      resolvedBundleDirectoryByChecksumCache.delete(bundleChecksum)
      throw error
    })
    resolvedBundleDirectoryByChecksumCache.set(bundleChecksum, cached)
  }

  return await cached
}

export async function resolvePublishedGraphBundleAsset(
  bundleChecksum: string,
  asset: string
): Promise<GraphBundleAssetDescriptor | null> {
  const [resolvedRoot, resolvedPublishedRoot] = await Promise.all([
    getResolvedBundleRoot(),
    getResolvedPublishedRoot(),
  ])
  const resolvedBundleDirectory = await getResolvedPublishedBundleDirectory(
    bundleChecksum,
    resolvedRoot,
    resolvedPublishedRoot
  )
  if (!resolvedBundleDirectory) {
    return null
  }

  const assetPath = resolvePublishedBundleAssetPath(resolvedBundleDirectory, asset)
  const assetStats = await stat(assetPath).catch(() => null)
  if (!assetStats?.isFile()) {
    return null
  }

  return {
    assetPath,
    etag: buildGraphBundleAssetEtag({
      asset,
      bundleChecksum,
      mtimeMs: assetStats.mtimeMs,
      size: assetStats.size,
    }),
    size: assetStats.size,
  }
}
