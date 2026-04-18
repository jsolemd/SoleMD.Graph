import { createUIMessageStreamResponse } from 'ai'
import { NextResponse } from 'next/server'
import {
  createGraphAskMessageStream,
  parseGraphAskChatRequest,
} from './stream'

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

  try {
    const parsedRequest = parseGraphAskChatRequest(payload)

    return createUIMessageStreamResponse({
      stream: createGraphAskMessageStream({
        request: parsedRequest,
        signal: request.signal,
      }),
    })
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Invalid graph evidence chat request',
      },
      { status: 400 },
    )
  }
}
