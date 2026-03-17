import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import path from 'node:path'
import { Readable } from 'node:stream'
import { NextRequest, NextResponse } from 'next/server'
import {
  fetchGraphBundleByChecksum,
  getGraphBundleAssetNames,
  resolveGraphBundleDirectory,
} from '@/features/graph/lib/fetch'

export const runtime = 'nodejs'

type RouteContext = {
  params: Promise<{
    asset: string
    checksum: string
  }>
}

function getContentType(asset: string) {
  if (asset.endsWith('.json')) {
    return 'application/json; charset=utf-8'
  }

  if (asset.endsWith('.parquet')) {
    return 'application/vnd.apache.parquet'
  }

  return 'application/octet-stream'
}

function parseRangeHeader(rangeHeader: string, size: number) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader)

  if (!match) {
    return null
  }

  const [, startToken, endToken] = match
  if (startToken === '' && endToken === '') {
    return null
  }

  if (startToken === '') {
    const suffixLength = Number(endToken)

    if (!Number.isInteger(suffixLength) || suffixLength <= 0) {
      return null
    }

    const boundedLength = Math.min(suffixLength, size)
    return {
      start: size - boundedLength,
      end: size - 1,
    }
  }

  const start = Number(startToken)
  const end = endToken === '' ? size - 1 : Number(endToken)

  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 0 ||
    end < start ||
    end >= size
  ) {
    return null
  }

  return { start, end }
}

function buildResponseHeaders(asset: string, size: number, etag: string) {
  return {
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'public, max-age=31536000, immutable',
    'Content-Type': getContentType(asset),
    ETag: etag,
    Vary: 'Range',
  }
}

function createWebStream(
  assetPath: string,
  range?: {
    end: number
    start: number
  }
) {
  return Readable.toWeb(
    createReadStream(assetPath, range ? { start: range.start, end: range.end } : undefined)
  ) as ReadableStream
}

async function serveAsset(
  request: NextRequest,
  context: RouteContext,
  headOnly: boolean
) {
  const { asset, checksum } = await context.params
  const bundle = await fetchGraphBundleByChecksum(checksum)
  const allowedAssets = getGraphBundleAssetNames(bundle)

  if (!allowedAssets.has(asset)) {
    return NextResponse.json({ error: 'Bundle asset not found' }, { status: 404 })
  }

  const bundleDirectory = await resolveGraphBundleDirectory(bundle)
  const assetPath = path.join(bundleDirectory, asset)
  const assetStats = await stat(assetPath)
  const etag = `"${bundle.bundleChecksum}:${asset}:${assetStats.size}"`

  if (request.headers.get('if-none-match') === etag) {
    return new NextResponse(null, {
      status: 304,
      headers: buildResponseHeaders(asset, assetStats.size, etag),
    })
  }

  const rangeHeader = request.headers.get('range')

  if (!rangeHeader) {
    const headers = {
      ...buildResponseHeaders(asset, assetStats.size, etag),
      'Content-Length': String(assetStats.size),
    }

    if (headOnly) {
      return new NextResponse(null, { status: 200, headers })
    }

    return new NextResponse(createWebStream(assetPath), { status: 200, headers })
  }

  const range = parseRangeHeader(rangeHeader, assetStats.size)

  if (!range) {
    return new NextResponse(null, {
      status: 416,
      headers: {
        'Content-Range': `bytes */${assetStats.size}`,
      },
    })
  }

  const length = range.end - range.start + 1
  const headers = {
    ...buildResponseHeaders(asset, assetStats.size, etag),
    'Content-Length': String(length),
    'Content-Range': `bytes ${range.start}-${range.end}/${assetStats.size}`,
  }

  if (headOnly) {
    return new NextResponse(null, { status: 206, headers })
  }

  return new NextResponse(createWebStream(assetPath, range), { status: 206, headers })
}

export async function GET(request: NextRequest, context: RouteContext) {
  return serveAsset(request, context, false)
}

export async function HEAD(request: NextRequest, context: RouteContext) {
  return serveAsset(request, context, true)
}
