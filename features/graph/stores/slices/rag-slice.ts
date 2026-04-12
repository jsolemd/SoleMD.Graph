import type { StateCreator } from 'zustand'
import type { DashboardState } from '../dashboard-store'
import type { GraphRagQueryResponsePayload } from '@/features/graph/types'
import type {
  RagGraphAvailabilitySummary,
  RagResponseSession,
} from '@/features/graph/components/panels/prompt/use-rag-query'

export interface RagSlice {
  ragPanelOpen: boolean
  ragResponse: GraphRagQueryResponsePayload | null
  streamedAskAnswer: string | null
  ragError: string | null
  ragSession: RagResponseSession | null
  ragGraphAvailability: RagGraphAvailabilitySummary | null
  isRagSubmitting: boolean

  setRagPanelOpen: (open: boolean) => void
  setRagResponse: (response: GraphRagQueryResponsePayload | null) => void
  setStreamedAskAnswer: (answer: string | null) => void
  setRagError: (error: string | null) => void
  setRagSession: (session: RagResponseSession | null) => void
  setRagGraphAvailability: (summary: RagGraphAvailabilitySummary | null) => void
  setIsRagSubmitting: (submitting: boolean) => void
  clearRagStore: () => void
}

export const createRagSlice: StateCreator<DashboardState, [], [], RagSlice> = (set) => ({
  ragPanelOpen: false,
  ragResponse: null,
  streamedAskAnswer: null,
  ragError: null,
  ragSession: null,
  ragGraphAvailability: null,
  isRagSubmitting: false,

  setRagPanelOpen: (open) => set((s) => (
    s.ragPanelOpen === open ? s : { ragPanelOpen: open }
  )),
  setRagResponse: (response) => set({ ragResponse: response }),
  setStreamedAskAnswer: (answer) => set({ streamedAskAnswer: answer }),
  setRagError: (error) => set({ ragError: error }),
  setRagSession: (session) => set({ ragSession: session }),
  setRagGraphAvailability: (summary) => set({ ragGraphAvailability: summary }),
  setIsRagSubmitting: (submitting) => set((s) => (
    s.isRagSubmitting === submitting ? s : { isRagSubmitting: submitting }
  )),
  clearRagStore: () => set({
    ragPanelOpen: false,
    ragResponse: null,
    streamedAskAnswer: null,
    ragError: null,
    ragSession: null,
    ragGraphAvailability: null,
    isRagSubmitting: false,
  }),
})
