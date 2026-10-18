import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import fs from 'node:fs'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import { v7 as uuidv7 } from 'uuid'
import {
  appendImageToAssetRow,
  appendVideoToBeat,
  createEpisode,
  createProject,
  createUploadRecord,
  completeUploadRecord,
  deleteEpisode,
  deleteMediaAsset,
  getMediaDetail,
  getProject,
  getSheetDetail,
  listAssetFolders,
  listMedia,
  listProjects,
  listRecycleBin,
  purgeBatch,
  renameMediaAsset,
  renameSheet,
  restoreBatch,
  updateEpisode,
  updateProject,
} from './store.js'
import {
  absolutePathForKey,
  processImage,
  safeFilename,
  storageKeyFor,
  type MediaKind,
  type UploadContext,
} from './media.js'
import { AppError, ValidationError } from './errors.js'
import { subscribeProject } from './events.js'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function parseLimit(value: unknown): number | undefined {
  if (value === undefined) return undefined
  const number = Number(value)
  return Number.isFinite(number) ? number : undefined
}

const VIDEO_EXTENSIONS = new Set([
  '.mp4',
  '.mov',
  '.m4v',
  '.webm',
  '.mkv',
  '.avi',
])
const IMAGE_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
  '.bmp',
  '.tif',
  '.tiff',
])

function validateUploadKind(
  kind: MediaKind,
  mimetype: string,
  filename: string,
  columnId?: string,
): void {
  const extension = path.extname(filename).toLowerCase()
  const isVideo =
    mimetype.startsWith('video/') || VIDEO_EXTENSIONS.has(extension)
  const isImage =
    mimetype.startsWith('image/') || IMAGE_EXTENSIONS.has(extension)

  if (kind === 'video' && !isVideo) {
    throw new ValidationError('视频只允许上传视频文件')
  }
  if (kind === 'image' && !isImage) {
    throw new ValidationError('图片只允许上传图片文件')
  }
  if (columnId === 'beat.videos' && kind !== 'video') {
    throw new ValidationError('节拍表视频列只接受视频文件')
  }
  if (
    (columnId === 'asset.selected' ||
      columnId === 'asset.alternates' ||
      columnId === 'asset.library') &&
    kind !== 'image'
  ) {
    throw new ValidationError('资产表文件夹只接受图片文件')
  }
}

function requireBody(request: FastifyRequest): Record<string, any> {
  return (request.body ?? {}) as Record<string, any>
}

function parseIfMatch(request: FastifyRequest): number | undefined {
  const raw = request.headers['if-match']
  if (typeof raw !== 'string' || !raw.trim()) return undefined
  const value = Number(raw.replace(/"/g, '').trim())
  return Number.isFinite(value) ? value : undefined
}

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  app.get('/healthz', async () => ({ ok: true }))

  // ---------- projects ----------
  app.get('/api/projects', async () => ({ projects: listProjects() }))

  app.post('/api/projects', async (request, reply) => {
    const body = requireBody(request)
    const result = createProject(body.name, body.firstEpisode)
    return reply.code(201).send(result)
  })

  app.get('/api/projects/:projectId', async (request) => {
    const { projectId } = request.params as { projectId: string }
    return getProject(projectId)
  })

  app.get('/api/projects/:projectId/asset-folders', async (request) => {
    const { projectId } = request.params as { projectId: string }
    return listAssetFolders(projectId)
  })

  app.patch('/api/projects/:projectId', async (request) => {
    const { projectId } = request.params as { projectId: string }
    const body = requireBody(request)
    return updateProject(projectId, body.name)
  })

  // ---------- episodes ----------
  app.post('/api/projects/:projectId/episodes', async (request, reply) => {
    const { projectId } = request.params as { projectId: string }
    const body = requireBody(request)
    const result = createEpisode(
      projectId,
      Number(body.number),
      body.title ?? null,
    )
    return reply.code(201).send(result)
  })

  app.patch('/api/episodes/:episodeId', async (request) => {
    const { episodeId } = request.params as { episodeId: string }
    const body = requireBody(request)
    return updateEpisode(episodeId, {
      number: body.number === undefined ? undefined : Number(body.number),
      title: body.title,
    })
  })

  app.delete('/api/episodes/:episodeId', async (request) => {
    const { episodeId } = request.params as { episodeId: string }
    return deleteEpisode(episodeId)
  })

  app.post('/api/projects/:projectId/beat-video-links', async (request) => {
    const { projectId } = request.params as { projectId: string }
    const body = requireBody(request)
    return appendVideoToBeat(
      projectId,
      Number(body.episodeNumber),
      Number(body.beatNumber),
      String(body.assetId ?? ''),
    )
  })

  app.post('/api/projects/:projectId/asset-image-links', async (request) => {
    const { projectId } = request.params as { projectId: string }
    const body = requireBody(request)
    const role = body.role === 'selected' ? 'selected' : 'alternate'
    return appendImageToAssetRow(
      projectId,
      String(body.category ?? ''),
      String(body.assetName ?? ''),
      role,
      String(body.assetId ?? ''),
    )
  })

  // ---------- sheets ----------
  app.get('/api/sheets/:sheetId', async (request) => {
    const { sheetId } = request.params as { sheetId: string }
    return getSheetDetail(sheetId)
  })

  app.patch('/api/sheets/:sheetId', async (request) => {
    const { sheetId } = request.params as { sheetId: string }
    const body = requireBody(request)
    return renameSheet(sheetId, body.name, parseIfMatch(request))
  })

  // ---------- media ----------
  app.get('/api/projects/:projectId/media', async (request) => {
    const { projectId } = request.params as { projectId: string }
    const query = request.query as Record<string, string | undefined>
    return listMedia(projectId, {
      kind: query.kind,
      status: query.status,
      usage: query.usage,
      q: query.q,
      limit: parseLimit(query.limit),
    })
  })

  app.get('/api/media/:assetId', async (request) => {
    const { assetId } = request.params as { assetId: string }
    return getMediaDetail(assetId)
  })

  app.patch('/api/media/:assetId', async (request) => {
    const { assetId } = request.params as { assetId: string }
    const body = requireBody(request)
    return renameMediaAsset(assetId, body.displayName)
  })

  app.post('/api/projects/:projectId/media', async (request, reply) => {
    const { projectId } = request.params as { projectId: string }
    const query = request.query as {
      kind?: string
      assetId?: string
      columnId?: string
      episodeNumber?: string
      beatNumber?: string
      category?: string
      assetName?: string
    }
    const kind = query.kind as MediaKind | undefined
    if (kind !== 'video' && kind !== 'image') {
      throw new ValidationError('kind 必须是 video 或 image')
    }

    const assetId =
      query.assetId && UUID_RE.test(query.assetId) ? query.assetId : uuidv7()
    const upload = await request.file()
    if (!upload) throw new ValidationError('没有收到文件')

    const originalName = path.basename(upload.filename || 'upload')
    const uploadContext: UploadContext = {
      columnId: query.columnId,
      episodeNumber: query.episodeNumber ? Number(query.episodeNumber) : undefined,
      beatNumber: query.beatNumber ? Number(query.beatNumber) : undefined,
      category: query.category,
      assetName: query.assetName,
    }
    try {
      validateUploadKind(
        kind,
        upload.mimetype || '',
        originalName,
        uploadContext.columnId,
      )
    } catch (error) {
      upload.file.resume()
      throw error
    }
    const storageKey = storageKeyFor(
      projectId,
      assetId,
      originalName,
      uploadContext,
    )
    const absolutePath = absolutePathForKey(storageKey)
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true })

    createUploadRecord({
      projectId,
      assetId,
      kind,
      filename: originalName,
      mimeType: upload.mimetype || 'application/octet-stream',
      sizeBytes: 0,
      storageKey,
    })

    try {
      await pipeline(upload.file, fs.createWriteStream(absolutePath))
      const stat = fs.statSync(absolutePath)

      if (kind === 'image') {
        const image = await processImage(projectId, assetId, storageKey)
        const asset = completeUploadRecord({
          assetId,
          projectId,
          mimeType: upload.mimetype || 'application/octet-stream',
          sizeBytes: stat.size,
          width: image.width,
          height: image.height,
          thumbnailKey: image.thumbnailKey,
          error: image.error,
        })
        return reply.code(201).send({ asset })
      }

      const asset = completeUploadRecord({
        assetId,
        projectId,
        mimeType: upload.mimetype || 'video/mp4',
        sizeBytes: stat.size,
      })
      return reply.code(201).send({ asset })
    } catch (error) {
      try {
        fs.rmSync(absolutePath, { force: true })
      } catch {
        // ignore cleanup failure
      }
      completeUploadRecord({
        assetId,
        projectId,
        mimeType: upload.mimetype || 'application/octet-stream',
        sizeBytes: 0,
        error: error instanceof Error ? error.message : '上传失败',
      })
      throw error
    }
  })

  app.delete('/api/media/:assetId', async (request) => {
    const { assetId } = request.params as { assetId: string }
    const query = request.query as { force?: string }
    return deleteMediaAsset(assetId, query.force === 'true')
  })

  // ---------- recycle bin ----------
  app.get('/api/projects/:projectId/recycle-bin', async (request) => {
    const { projectId } = request.params as { projectId: string }
    return listRecycleBin(projectId)
  })

  app.post(
    '/api/projects/:projectId/recycle-bin/:batchId/restore',
    async (request) => {
      const { batchId } = request.params as { batchId: string }
      return restoreBatch(batchId)
    },
  )

  app.delete(
    '/api/projects/:projectId/recycle-bin/:batchId',
    async (request) => {
      const { batchId } = request.params as { batchId: string }
      const body = requireBody(request)
      if (body.confirm !== 'DELETE') {
        throw new ValidationError('请传入确认字符串 DELETE')
      }
      return purgeBatch(batchId)
    },
  )

  app.delete('/api/projects/:projectId/recycle-bin', async (request) => {
    const { projectId } = request.params as { projectId: string }
    const body = requireBody(request)
    if (body.confirm !== 'DELETE') {
      throw new ValidationError('请传入确认字符串 DELETE')
    }
    const result = listRecycleBin(projectId) as {
      batches: Array<{ id: string }>
    }
    const purged: string[] = []
    for (const batch of result.batches) {
      purgeBatch(batch.id)
      purged.push(batch.id)
    }
    return { purged }
  })

  // ---------- project events (SSE) ----------
  app.get('/api/projects/:projectId/events', (request, reply) => {
    const { projectId } = request.params as { projectId: string }
    reply.hijack()

    const response = reply.raw
    response.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    })
    response.write(': connected\n\n')

    const unsubscribe = subscribeProject(projectId, (event, data) => {
      response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
    })
    const heartbeat = setInterval(() => {
      response.write(': ping\n\n')
    }, 15_000)

    request.raw.on('close', () => {
      clearInterval(heartbeat)
      unsubscribe()
      try {
        response.end()
      } catch {
        // ignore
      }
    })
  })
}

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler(
    (error: any, _request: FastifyRequest, reply: FastifyReply) => {
      if (error instanceof AppError) {
        return reply.code(error.statusCode).send({
          error: {
            code: error.code,
            message: error.message,
            details: error.details ?? null,
          },
        })
      }

      if (error?.statusCode && error.statusCode < 500) {
        return reply.code(error.statusCode).send({
          error: {
            code: error.code ?? 'BAD_REQUEST',
            message: error.message ?? '请求错误',
            details: null,
          },
        })
      }

      console.error('[api] unhandled error', error)
      return reply.code(500).send({
        error: {
          code: 'INTERNAL_ERROR',
          message: '服务器内部错误',
          details: null,
        },
      })
    },
  )
}
