import type { GraphBundle, GraphBundleLoadProgress } from "@solemd/graph"

import { createGraphBundleSession } from './session'
import type { GraphBundleSession } from './types'

export const sessionCache = new Map<string, Promise<GraphBundleSession>>()
export const progressCache = new Map<string, GraphBundleLoadProgress>()

const progressListeners = new Map<
  string,
  Set<(progress: GraphBundleLoadProgress) => void>
>()

export function emitProgress(bundleChecksum: string, progress: GraphBundleLoadProgress) {
  progressCache.set(bundleChecksum, progress)
  const listeners = progressListeners.get(bundleChecksum)
  if (!listeners) return
  for (const listener of listeners) {
    listener(progress)
  }
}

export function subscribeToGraphBundleProgress(
  bundleChecksum: string,
  listener: (progress: GraphBundleLoadProgress) => void
) {
  let listeners = progressListeners.get(bundleChecksum)
  if (!listeners) {
    listeners = new Set()
    progressListeners.set(bundleChecksum, listeners)
  }
  listeners.add(listener)

  const latest = progressCache.get(bundleChecksum)
  if (latest) {
    listener(latest)
  }

  return () => {
    listeners?.delete(listener)
    if (listeners && listeners.size === 0) {
      progressListeners.delete(bundleChecksum)
    }
  }
}

export function invalidateGraphBundleSessionCache(bundleChecksum?: string) {
  if (bundleChecksum) {
    const session = sessionCache.get(bundleChecksum)
    session?.then((resolved) => resolved.dispose()).catch(() => {})
    sessionCache.delete(bundleChecksum)
    progressCache.delete(bundleChecksum)
    progressListeners.delete(bundleChecksum)
    return
  }

  for (const [checksum, session] of sessionCache.entries()) {
    session.then((resolved) => resolved.dispose()).catch(() => {})
    progressCache.delete(checksum)
    progressListeners.delete(checksum)
  }
  sessionCache.clear()
}

export function loadGraphBundle(bundle: GraphBundle) {
  let session = sessionCache.get(bundle.bundleChecksum)

  if (!session) {
    session = createGraphBundleSession(bundle, emitProgress).catch((error) => {
      sessionCache.delete(bundle.bundleChecksum)
      progressCache.delete(bundle.bundleChecksum)
      throw error
    })
    sessionCache.set(bundle.bundleChecksum, session)
  }

  return session
}
