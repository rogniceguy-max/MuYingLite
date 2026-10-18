import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import type { Archiver, ZipOptions } from 'archiver'
import { v7 as uuidv7 } from 'uuid'
import type { FastifyReply } from 'fastify'
import { absolutePathForKey } from './media.js'
import { listArchiveMedia } from './store.js'
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from './errors.js'

const require = createRequire(import.meta.url)
const createArchive = require('archiver') as (
  format: string,
  options?: ZipOptions,
) => Archiver

export type ArchiveJobStatus =
  | 'queued'
  | 'running'
  | 'done'
  | 'error'
  | 'cancelled'

export type ArchiveJobView = {
  jobId: string
  projectId: string
  folderName: string
  status: ArchiveJobStatus
  totalFiles: number
  processedFiles: number
  totalBytes: number
  processedBytes: number
  missingFiles: number
  error: string | null
}

type ArchiveEntry = {
  absolutePath: string
  entryName: string
}

export type ArchiveJob = {
  id: string
  projectId: string
  folderName: string
  entries: ArchiveEntry[]
  missing: string[]
  status: ArchiveJobStatus
  totalFiles: number
  processedFiles: number
  totalBytes: number
  processedBytes: number
  createdAt: number
  startedAt: number | null
  finishedAt: number | null
  error: string | null
  started: boolean
}

const jobs = new Map<string, ArchiveJob>()
const FINISHED_TTL_MS = 10 * 60_000
const QUEUED_TTL_MS = 5 * 60_000

function safeSegment(value: string | null | undefined): string {
  const cleaned = String(value ?? '')
    .normalize('NFC')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/^\.+$/, '_')
    .trim()
  return cleaned || '未命名'
}

function uniqueEntryName(used: Set<string>, entryName: string): string {
  let candidate = entryName
  let suffix = 1
  while (used.has(candidate.toLocaleLowerCase())) {
    const extension = path.posix.extname(entryName)
    const stem = extension ? entryName.slice(0, -extension.length) : entryName
    suffix += 1
    candidate = `${stem} (${suffix})${extension}`
  }
  used.add(candidate.toLocaleLowerCase())
  return candidate
}

function contentDisposition(filename: string): string {
  const fallback = filename
    .replace(/[^\x20-\x7E]/g, '_')
    .replace(/["\\]/g, '_')
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`
}

function toView(job: ArchiveJob): ArchiveJobView {
  return {
    jobId: job.id,
    projectId: job.projectId,
    folderName: job.folderName,
    status: job.status,
    totalFiles: job.totalFiles,
    processedFiles: job.processedFiles,
    totalBytes: job.totalBytes,
    processedBytes: Math.min(job.processedBytes, job.totalBytes),
    missingFiles: job.missing.length,
    error: job.error,
  }
}

function cleanupJobs(): void {
  const now = Date.now()
  for (const [id, job] of jobs) {
    if (job.startedAt && !job.finishedAt) continue
    const anchor = job.finishedAt ?? job.createdAt ?? now
    const ttl = job.finishedAt ? FINISHED_TTL_MS : QUEUED_TTL_MS
    if (now - anchor > ttl) jobs.delete(id)
  }
}

export function createArchiveJob(
  projectId: string,
  rawFolder: unknown,
): ArchiveJobView {
  if (!Array.isArray(rawFolder) || rawFolder.length === 0) {
    throw new ValidationError('缺少文件夹路径')
  }
  const folder = rawFolder
    .map((segment) => String(segment ?? '').trim())
    .filter(Boolean)
  if (folder.length === 0 || folder.length > 8) {
    throw new ValidationError('文件夹路径无效')
  }
  for (const segment of folder) {
    if (
      segment === '.' ||
      segment === '..' ||
      segment.length > 120 ||
      /[\\/]/.test(segment)
    ) {
      throw new ValidationError('文件夹路径无效')
    }
  }

  const folderName = safeSegment(folder[folder.length - 1])
  const media = listArchiveMedia(projectId)
  const entries: ArchiveEntry[] = []
  const missing: string[] = []
  const usedNames = new Set<string>()
  let totalBytes = 0

  for (const item of media) {
    const itemSegments = item.folderPath.split(' / ').filter(Boolean)
    if (itemSegments.length < folder.length) continue
    if (!folder.every((segment, index) => itemSegments[index] === segment)) {
      continue
    }

    const relativeSegments = itemSegments.slice(folder.length).map(safeSegment)
    const relativeName = [
      ...relativeSegments,
      safeSegment(item.displayName),
    ].join('/')
    const entryName = uniqueEntryName(
      usedNames,
      `${folderName}/${relativeName}`,
    )
    const absolutePath = absolutePathForKey(item.storageKey)

    try {
      const stat = fs.statSync(absolutePath)
      if (!stat.isFile()) throw new Error('not a file')
      entries.push({ absolutePath, entryName })
      totalBytes += stat.size
    } catch {
      missing.push(entryName)
    }
  }

  if (entries.length === 0) {
    throw new ValidationError('文件夹为空或文件不可用')
  }

  const job: ArchiveJob = {
    id: uuidv7(),
    projectId,
    folderName,
    entries,
    missing,
    status: 'queued',
    totalFiles: entries.length,
    processedFiles: 0,
    totalBytes,
    processedBytes: 0,
    createdAt: Date.now(),
    startedAt: null,
    finishedAt: null,
    error: null,
    started: false,
  }
  jobs.set(job.id, job)
  cleanupJobs()
  return toView(job)
}

export function getArchiveJob(
  projectId: string,
  jobId: string,
): ArchiveJobView {
  cleanupJobs()
  const job = jobs.get(jobId)
  if (!job || job.projectId !== projectId) {
    throw new NotFoundError('压缩任务不存在或已过期')
  }
  return toView(job)
}

export function startArchiveDownload(
  projectId: string,
  jobId: string,
): ArchiveJob {
  cleanupJobs()
  const job = jobs.get(jobId)
  if (!job || job.projectId !== projectId) {
    throw new NotFoundError('压缩任务不存在或已过期')
  }
  if (job.started || job.status !== 'queued') {
    throw new ConflictError('压缩任务已开始')
  }
  job.started = true
  job.status = 'running'
  job.startedAt = Date.now()
  return job
}

export function streamArchiveJob(
  job: ArchiveJob,
  reply: FastifyReply,
): void {
  reply.hijack()
  const response = reply.raw
  const archive = createArchive('zip', { zlib: { level: 0 } })
  let settled = false
  let responseFinished = false

  response.statusCode = 200
  response.setHeader('Content-Type', 'application/zip')
  response.setHeader(
    'Content-Disposition',
    contentDisposition(`${job.folderName}.zip`),
  )
  response.setHeader('Cache-Control', 'no-store, no-transform')
  response.setHeader('X-Content-Type-Options', 'nosniff')

  const fail = (error: unknown) => {
    if (settled) return
    settled = true
    const message = error instanceof Error ? error.message : '打包失败'
    job.status = 'error'
    job.error = message
    job.finishedAt = Date.now()
    try {
      archive.abort()
    } catch {
      // ignore
    }
    if (!response.writableEnded) {
      response.destroy(error instanceof Error ? error : undefined)
    }
  }

  archive.on('warning', (error) => {
    console.warn('[archive] warning', error)
  })
  archive.on('error', fail)
  archive.pipe(response)

  for (const entry of job.entries) {
    const stream = fs.createReadStream(entry.absolutePath)
    stream.on('data', (chunk) => {
      job.processedBytes += Buffer.isBuffer(chunk)
        ? chunk.length
        : Buffer.byteLength(String(chunk))
    })
    stream.on('end', () => {
      job.processedFiles += 1
    })
    stream.on('error', fail)
    archive.append(stream, {
      name: entry.entryName,
      store: true,
    })
  }

  if (job.missing.length > 0) {
    const manifest = [
      `以下文件在打包时不可用（共 ${job.missing.length} 个）：`,
      '',
      ...job.missing,
      '',
    ].join('\n')
    archive.append(Buffer.from(manifest, 'utf8'), {
      name: `${job.folderName}/_缺失文件.txt`,
      store: true,
    })
  }

  response.on('finish', () => {
    responseFinished = true
  })
  response.on('close', () => {
    if (settled || responseFinished) return
    if (job.status === 'running') {
      settled = true
      job.status = 'cancelled'
      job.finishedAt = Date.now()
      try {
        archive.abort()
      } catch {
        // ignore
      }
    }
  })

  archive
    .finalize()
    .then(() => {
      if (settled) return
      settled = true
      job.status = 'done'
      job.processedFiles = job.totalFiles
      job.processedBytes = job.totalBytes
      job.finishedAt = Date.now()
    })
    .catch(fail)
}
