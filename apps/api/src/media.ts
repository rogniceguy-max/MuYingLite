import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { UPLOADS_DIR } from './db.js'

export type MediaKind = 'video' | 'image'

export function safeFilename(filename: string): string {
  const base = path.basename(filename || 'upload')
  const cleaned = base.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').trim()
  return cleaned || 'upload'
}

export function safeFolderName(value: string | null | undefined): string {
  const cleaned = String(value ?? '')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .trim()
  return cleaned || '未命名'
}

export type UploadContext = {
  columnId?: string
  episodeNumber?: number
  beatNumber?: number
  category?: string
  assetName?: string
}

export function storageKeyFor(
  projectId: string,
  assetId: string,
  filename: string,
  context?: UploadContext,
): string {
  const name = safeFilename(filename)
  let baseDir: string

  if (context?.columnId === 'beat.videos' && context.episodeNumber) {
    const episode = `第${context.episodeNumber}集`
    const beat = context.beatNumber ? `第${context.beatNumber}拍` : '未分拍'
    baseDir = `projects/${projectId}/${episode}/${beat}`
  } else if (
    context?.columnId === 'asset.selected' ||
    context?.columnId === 'asset.alternates'
  ) {
    const category = safeFolderName(context.category || '未分类')
    const assetName = safeFolderName(context.assetName || '未命名')
    const roleFolder =
      context.columnId === 'asset.selected' ? '选定' : '备选'
    baseDir = `projects/${projectId}/资产表/${category}/${assetName}/${roleFolder}`
  } else if (context?.columnId === 'asset.library') {
    const category = safeFolderName(context.category || '未分类')
    const assetName = context.assetName
      ? safeFolderName(context.assetName)
      : null
    baseDir = assetName
      ? `projects/${projectId}/资产表/${category}/${assetName}`
      : `projects/${projectId}/资产表/${category}`
  } else {
    baseDir = `projects/${projectId}/文件库`
  }

  let key = `${baseDir}/${name}`
  if (fs.existsSync(absolutePathForKey(key))) {
    const extension = path.extname(name)
    const stem = path.basename(name, extension)
    key = `${baseDir}/${stem}-${assetId.slice(0, 8)}${extension}`
  }
  return key
}

export function thumbnailKeyFor(projectId: string, assetId: string): string {
  return `projects/${projectId}/media/${assetId}/thumbnail/thumb.webp`
}

export function absolutePathForKey(key: string): string {
  return path.join(UPLOADS_DIR, ...key.split('/'))
}

export function mediaUrl(key: string | null | undefined): string | null {
  if (!key) return null
  return `/media/${key.split('/').map(encodeURIComponent).join('/')}`
}

export function folderPathForKey(key: string): string {
  const parts = key.split('/')
  const rest = parts.slice(2)
  if (/^第\d+集$/.test(rest[0] ?? '') && rest.length >= 3) {
    return rest.slice(0, 2).join(' / ')
  }
  if (rest[0] === '资产表' && rest.length >= 3) {
    return rest.slice(0, -1).join(' / ')
  }
  if (rest[0] === '文件库') return '文件库'
  return '未归档'
}

export async function processImage(
  projectId: string,
  assetId: string,
  originalKey: string,
): Promise<{
  width: number | null
  height: number | null
  thumbnailKey: string | null
  error: string | null
}> {
  const originalPath = absolutePathForKey(originalKey)
  const thumbKey = thumbnailKeyFor(projectId, assetId)
  const thumbPath = absolutePathForKey(thumbKey)
  fs.mkdirSync(path.dirname(thumbPath), { recursive: true })

  try {
    const metadata = await sharp(originalPath).metadata()
    await sharp(originalPath)
      .rotate()
      .resize({ width: 520, height: 520, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82 })
      .toFile(thumbPath)
    return {
      width: metadata.width ?? null,
      height: metadata.height ?? null,
      thumbnailKey: thumbKey,
      error: null,
    }
  } catch (error) {
    return {
      width: null,
      height: null,
      thumbnailKey: null,
      error: error instanceof Error ? error.message : '图片处理失败',
    }
  }
}

export function deleteAssetFiles(asset: {
  storage_key: string
  thumbnail_key?: string | null
}): void {
  for (const key of [asset.storage_key, asset.thumbnail_key]) {
    if (!key) continue
    try {
      fs.rmSync(absolutePathForKey(key), { force: true })
    } catch (error) {
      console.error('[media] failed to delete file', key, error)
    }
  }
}

export function formatMediaAsset(asset: any): Record<string, unknown> {
  const originalUrl = mediaUrl(asset.storage_key)
  const thumbnailUrl =
    mediaUrl(asset.thumbnail_key) ??
    (asset.kind === 'image' ? originalUrl : null)

  return {
    id: asset.id,
    projectId: asset.project_id,
    kind: asset.kind,
    displayName: asset.display_name,
    mimeType: asset.mime_type,
    sizeBytes: Number(asset.size_bytes ?? 0),
    width: asset.width ?? null,
    height: asset.height ?? null,
    durationMs: asset.duration_ms ?? null,
    status: asset.status,
    processingError: asset.processing_error ?? null,
    thumbnailUrl,
    originalUrl,
    createdAt: asset.created_at,
    deletedAt: asset.deleted_at ?? null,
    folderPath: folderPathForKey(asset.storage_key),
  }
}
