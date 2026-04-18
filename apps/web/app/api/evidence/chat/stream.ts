import 'server-only'

import {
  createUIMessageStream,
  type UIMessageChunk,
} from 'ai'
import { z } from 'zod'
import {
  extractLatestUserText,
  type GraphAskChatErrorPayload,
  type GraphAskChatMessage,
} from '@/features/graph/lib/rag-chat'
import { searchGraphEvidence, toGraphRagErrorResponse } from "@solemd/api-client/server/graph-rag"

const GraphAskChatMessageSchema = z.object({
  id: z.string().optional(),
  role: z.enum(['system', 'user', 'assistant']),
  parts: z.array(z.object({ type: z.string() }).passthrough()).default([]),
}).passthrough()

const GraphAskChatRequestSchema = z.object({
  messages: z.array(GraphAskChatMessageSchema).default([]),
  graph_release_id: z.string().min(1),
  selected_layer_key: z.enum(['paper', 'chunk']).nullable().optional(),
  selected_node_id: z.string().nullable().optional(),
  selected_graph_paper_ref: z.string().nullable().optional(),
  selection_graph_paper_refs: z.array(z.string()).nullable().optional(),
  selected_cluster_id: z.number().int().nullable().optional(),
  scope_mode: z.enum(['global', 'selection_only']).nullable().optional(),
  evidence_intent: z.enum(['support', 'refute', 'both']).nullable().optional(),
  k: z.number().int().min(1).max(50).optional(),
  rerank_topn: z.number().int().min(1).max(200).optional(),
  use_lexical: z.boolean().optional(),
  generate_answer: z.boolean().optional(),
  client_request_id: z.number().int().nonnegative(),
})

const AT_MENTION_PATTERN = /@\[(\d+)\]/g

function extractCitedCorpusIds(text: string): number[] {
  const ids: number[] = []
  const seen = new Set<number>()
  for (const match of text.matchAll(AT_MENTION_PATTERN)) {
    const id = parseInt(match[1], 10)
    if (!seen.has(id)) {
      seen.add(id)
      ids.push(id)
    }
  }
  return ids
}

function stripAtMentions(text: string): string {
  return text.replace(AT_MENTION_PATTERN, '').replace(/\s{2,}/g, ' ').trim()
}

export type GraphAskChatRequest = z.infer<typeof GraphAskChatRequestSchema>

export function parseGraphAskChatRequest(payload: unknown): GraphAskChatRequest {
  return GraphAskChatRequestSchema.parse(payload)
}

export function createGraphAskMessageStream({
  request,
  signal,
}: {
  request: GraphAskChatRequest
  signal?: AbortSignal
}): ReadableStream<UIMessageChunk> {
  const messages = request.messages as GraphAskChatMessage[]

  return createUIMessageStream<GraphAskChatMessage>({
    originalMessages: messages,
    async execute({ writer }) {
      const rawQuery = extractLatestUserText(messages)
      if (!rawQuery) {
        writer.write({
          type: 'data-engine-error',
          data: {
            client_request_id: request.client_request_id,
            error_code: 'bad_request',
            error_message: 'Ask requests require a user message with text content.',
            request_id: null,
            retry_after: null,
            status: 400,
          } satisfies GraphAskChatErrorPayload,
        })
        return
      }

      const citedCorpusIds = extractCitedCorpusIds(rawQuery)
      const query = citedCorpusIds.length > 0 ? stripAtMentions(rawQuery) : rawQuery

      try {
        const response = await searchGraphEvidence(
          {
            graph_release_id: request.graph_release_id,
            query,
            selected_layer_key: request.selected_layer_key ?? null,
            selected_node_id: request.selected_node_id ?? null,
            selected_graph_paper_ref: request.selected_graph_paper_ref ?? null,
            selection_graph_paper_refs: request.selection_graph_paper_refs ?? null,
            selected_cluster_id: request.selected_cluster_id ?? null,
            scope_mode: request.scope_mode ?? null,
            evidence_intent: request.evidence_intent ?? null,
            k: request.k,
            rerank_topn: request.rerank_topn,
            use_lexical: request.use_lexical,
            generate_answer: request.generate_answer,
            ...(citedCorpusIds.length > 0 ? { cited_corpus_ids: citedCorpusIds } : {}),
          },
          { signal },
        )

        writer.write({
          type: 'data-evidence-response',
          data: {
            client_request_id: request.client_request_id,
            response,
          },
        })

        const answer = response.answer?.trim()
        if (!answer) {
          return
        }

        const textPartId = `graph-answer-${request.client_request_id}`
        writer.write({ type: 'text-start', id: textPartId })
        writer.write({
          type: 'text-delta',
          id: textPartId,
          delta: answer,
        })
        writer.write({ type: 'text-end', id: textPartId })
      } catch (error) {
        if (signal?.aborted) {
          return
        }

        writer.write({
          type: 'data-engine-error',
          data: {
            client_request_id: request.client_request_id,
            ...toGraphRagErrorResponse(error),
          },
        })
      }
    },
    onError: () => 'Failed to stream graph evidence.',
  })
}
