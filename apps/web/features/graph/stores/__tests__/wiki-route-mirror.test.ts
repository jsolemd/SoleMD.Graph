/**
 * Regression guard for the wiki-route-mirror adapter.
 *
 * Two properties under test:
 *  1. While the mirror is running, wiki-store route changes propagate into
 *     `useDashboardStore.wikiRouteIsGraph`.
 *  2. After stop, further wiki-store changes must NOT reach the dashboard
 *     store — the subscription is cleaned up and does not leak across
 *     HMR/test-reimport cycles.
 */
import { useDashboardStore } from '../dashboard-store'
import { useWikiStore } from '@/features/wiki/stores/wiki-store'

// Import AFTER the stores so the module's eager `startWikiRouteMirror()`
// observes initialized store singletons. We immediately stop it so each
// test starts from a clean subscription state.
import {
  startWikiRouteMirror,
  stopWikiRouteMirror,
} from '../wiki-route-mirror'

describe('wiki-route-mirror', () => {
  beforeEach(() => {
    // Tear down anything the eager import set up, plus any prior test run.
    stopWikiRouteMirror()
    // Reset stores to a known baseline.
    useWikiStore.setState({ currentRoute: { kind: 'graph' } })
    useDashboardStore.setState({ wikiRouteIsGraph: true })
  })

  afterEach(() => {
    stopWikiRouteMirror()
  })

  it('seeds wikiRouteIsGraph from the current wiki route on start', () => {
    useWikiStore.setState({ currentRoute: { kind: 'page', slug: 'foo' } })
    useDashboardStore.setState({ wikiRouteIsGraph: true }) // stale

    startWikiRouteMirror()

    expect(useDashboardStore.getState().wikiRouteIsGraph).toBe(false)
  })

  it('mirrors subsequent wiki-store route changes onto the dashboard store', () => {
    startWikiRouteMirror()

    useWikiStore.setState({ currentRoute: { kind: 'page', slug: 'x' } })
    expect(useDashboardStore.getState().wikiRouteIsGraph).toBe(false)

    useWikiStore.setState({ currentRoute: { kind: 'graph' } })
    expect(useDashboardStore.getState().wikiRouteIsGraph).toBe(true)
  })

  it('stops mirroring after stopWikiRouteMirror() — no subscription leak', () => {
    startWikiRouteMirror()
    useWikiStore.setState({ currentRoute: { kind: 'page', slug: 'a' } })
    expect(useDashboardStore.getState().wikiRouteIsGraph).toBe(false)

    stopWikiRouteMirror()

    // Force the dashboard value to the "wrong" mirror of the wiki state and
    // then flip the wiki state. If the subscription were still active the
    // mirror would overwrite our dashboard value; because it is stopped,
    // our manual value must survive.
    useDashboardStore.setState({ wikiRouteIsGraph: true })
    useWikiStore.setState({ currentRoute: { kind: 'page', slug: 'b' } })

    expect(useDashboardStore.getState().wikiRouteIsGraph).toBe(true)
  })

  it('is idempotent — calling start twice does not double-subscribe', () => {
    startWikiRouteMirror()
    const firstUnsub = startWikiRouteMirror() // must tear down prior sub

    // Drive several updates; the dashboard value should only be set when it
    // actually changes (the `sync` fn guards with a pre-compare), but the
    // critical property is that stopping via the latest unsub fully detaches.
    useWikiStore.setState({ currentRoute: { kind: 'page', slug: 'y' } })
    expect(useDashboardStore.getState().wikiRouteIsGraph).toBe(false)

    firstUnsub()
    stopWikiRouteMirror() // also clears the module-scope slot

    useDashboardStore.setState({ wikiRouteIsGraph: true })
    useWikiStore.setState({ currentRoute: { kind: 'page', slug: 'z' } })

    expect(useDashboardStore.getState().wikiRouteIsGraph).toBe(true)
  })
})
