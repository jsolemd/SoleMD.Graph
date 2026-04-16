import { useDashboardStore } from './dashboard-store'
import { useWikiStore } from '@/features/wiki/stores/wiki-store'

/**
 * Mirrors `useWikiStore.currentRoute.kind === 'graph'` into
 * `useDashboardStore.wikiRouteIsGraph` so the elastic dock can derive the
 * wiki panel's preferred width from a single dashboard selector.
 *
 * Runs at module import (event-time, not render-time) and subscribes for
 * subsequent navigation. Seeding before any component renders ensures
 * frame-1 width is correct — no setState-during-render and no two-commit
 * width animation on open.
 */

const sync = (kind: 'page' | 'graph') => {
  const next = kind === 'graph'
  if (useDashboardStore.getState().wikiRouteIsGraph !== next) {
    useDashboardStore.setState({ wikiRouteIsGraph: next })
  }
}

sync(useWikiStore.getState().currentRoute.kind)

useWikiStore.subscribe((state) => {
  sync(state.currentRoute.kind)
})
