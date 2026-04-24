import { useDashboardStore } from './dashboard-store'
import { useWikiStore } from '@/features/wiki/stores/wiki-store'

/**
 * Mirrors `useWikiStore.currentRoute.kind === 'graph'` into
 * `useDashboardStore.wikiRouteIsGraph` so the elastic dock can derive the
 * wiki panel's preferred width from a single dashboard selector.
 *
 * Cross-store subscription (graph store listens to wiki store) — this is the
 * one intentional boundary crossing, kept inside this dedicated adapter
 * module rather than leaking into component code.
 *
 * Seeds eagerly at import time so frame-1 width is correct (no setState
 * during render, no two-commit width animation on panel open). HMR reloads
 * and repeated test imports are guarded by a module-scope singleton that
 * tears down the prior subscription before re-subscribing, so the
 * subscription never leaks.
 */

const sync = (kind: 'page' | 'graph') => {
  const next = kind === 'graph'
  if (useDashboardStore.getState().wikiRouteIsGraph !== next) {
    useDashboardStore.setState({ wikiRouteIsGraph: next })
  }
}

// Module-scope singleton for the active subscription's teardown fn. Survives
// HMR re-evaluation (via globalThis) and multiple imports in the same test
// process, so calling startWikiRouteMirror() more than once never leaks.
interface MirrorGlobal {
  __solemdWikiRouteMirrorUnsub__?: (() => void) | null
}
const mirrorGlobal = globalThis as unknown as MirrorGlobal

/**
 * Start mirroring wiki-route state onto the dashboard store. Idempotent:
 * calling repeatedly tears down the previous subscription before creating
 * a new one. Returns the unsubscribe fn.
 */
export function startWikiRouteMirror(): () => void {
  stopWikiRouteMirror()

  sync(useWikiStore.getState().currentRoute.kind)

  const unsubscribe = useWikiStore.subscribe((state) => {
    sync(state.currentRoute.kind)
  })

  mirrorGlobal.__solemdWikiRouteMirrorUnsub__ = unsubscribe
  return unsubscribe
}

/**
 * Stop any active mirror subscription. Safe to call when none is active.
 */
export function stopWikiRouteMirror(): void {
  const prior = mirrorGlobal.__solemdWikiRouteMirrorUnsub__
  if (prior) {
    prior()
    mirrorGlobal.__solemdWikiRouteMirrorUnsub__ = null
  }
}

// Eager start: preserve frame-1 correctness. The module-scope guard above
// makes this HMR- and re-import-safe.
startWikiRouteMirror()
