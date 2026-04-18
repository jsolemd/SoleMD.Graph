import { NextResponse } from 'next/server'
import { z } from 'zod'

import { EngineApiError } from '@/lib/engine/client'
import {
  fetchGraphPointAttachment,
  GRAPH_POINT_ATTACHMENT_MEDIA_TYPE,
} from '@/lib/engine/graph-attachment'

const GraphPointAttachmentRequestSchema = z.object({
  graph_release_id: z.string().min(1),
  graph_paper_refs: z.array(z.string()).max(1000).default([]),
})

export async function POST(request: Request) {
  let payload: unknown

  try {
    payload = await request.json()
  } catch {
    return NextResponse.json(
      {
        error: 'Invalid JSON body',
      },
      { status: 400 },
    )
  }

  let parsedRequest: z.infer<typeof GraphPointAttachmentRequestSchema>
  try {
    parsedRequest = GraphPointAttachmentRequestSchema.parse(payload)
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Invalid graph attachment request',
      },
      { status: 400 },
    )
  }

  try {
    const payloadBytes = await fetchGraphPointAttachment(parsedRequest, {
      signal: request.signal,
    })
    return new Response(payloadBytes, {
      status: 200,
      headers: {
        'Content-Type': GRAPH_POINT_ATTACHMENT_MEDIA_TYPE,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    if (error instanceof EngineApiError) {
      return NextResponse.json(
        {
          error: error.message,
          error_code: error.errorCode ?? 'engine_request_failed',
          request_id: error.requestId,
          retry_after: error.retryAfter,
        },
        { status: error.status },
      )
    }

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to attach graph points',
      },
      { status: 500 },
    )
  }
}
