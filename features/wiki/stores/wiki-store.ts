import { create } from 'zustand'

interface WikiState {
  currentSlug: string | null
  slugHistory: string[]
  historyIndex: number

  navigateTo: (slug: string) => void
  goBack: () => void
  goForward: () => void
  reset: () => void
}

export const useWikiStore = create<WikiState>((set) => ({
  currentSlug: null,
  slugHistory: [],
  historyIndex: -1,

  navigateTo: (slug) =>
    set((s) => {
      // No-op if already on this page — prevents duplicate history entries
      if (s.currentSlug === slug) return s
      const trimmedHistory = s.slugHistory.slice(0, s.historyIndex + 1)
      return {
        currentSlug: slug,
        slugHistory: [...trimmedHistory, slug],
        historyIndex: trimmedHistory.length,
      }
    }),

  goBack: () =>
    set((s) => {
      if (s.historyIndex <= 0) return s
      const newIndex = s.historyIndex - 1
      return {
        currentSlug: s.slugHistory[newIndex],
        historyIndex: newIndex,
      }
    }),

  goForward: () =>
    set((s) => {
      if (s.historyIndex >= s.slugHistory.length - 1) return s
      const newIndex = s.historyIndex + 1
      return {
        currentSlug: s.slugHistory[newIndex],
        historyIndex: newIndex,
      }
    }),

  reset: () =>
    set({ currentSlug: null, slugHistory: [], historyIndex: -1 }),
}))
