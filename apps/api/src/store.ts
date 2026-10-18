import { v7 as uuidv7 } from 'uuid'
import * as Y from 'yjs'
import { db, nowIso, transaction } from './db.js'
import { getColumns, type SheetKind } from './columns.js'
import {
  ConflictError,
  MediaInUseError,
  NotFoundError,
  ValidationError,
} from './errors.js'
import { createInitialSheetState } from './yjs-utils.js'
import {
  deleteAssetFiles,
  formatMediaAsset,
  safeFolderName,
  type MediaKind,
} from './media.js'
import {
  markSheetDeleted,
  refreshBatchMediaCount,
  type BatchMeta,
} from './projection.js'
import {
  closeSheetConnections,
  removeMediaLinksForAsset,
  withSheetDoc,
} from './collab.js'
import { emitProject } from './events.js'

function mapProject(row: any): Record<string, unknown> {
  return {
    id: row.id,
    name: row.name,
    episodeCount: Number(row.episode_count ?? 0),
    assetSheetId: row.asset_sheet_id ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapEpisode(row: any): Record<string, unknown> {
  return {
    id: row.id,
    projectId: row.project_id,
    number: Number(row.number),
    title: row.title ?? null,
    position: Number(row.position),
    deletedAt: row.deleted_at ?? null,
    deletionBatchId: row.deletion_batch_id ?? null,
  }
}

function mapSheet(row: any): Record<string, unknown> {
  return {
    id: row.id,
    projectId: row.project_id,
    kind: row.kind,
    episodeId: row.episode_id ?? null,
    name: row.name,
    position: Number(row.position),
    schemaVersion: Number(row.schema_version),
    metadataRevision: Number(row.metadata_revision),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at ?? null,
    deletionBatchId: row.deletion_batch_id ?? null,
    episodeNumber: row.episode_number ?? null,
    episodeTitle: row.episode_title ?? null,
  }
}

export function listProjects(): Record<string, unknown>[] {
  const rows = db
    .prepare(
      `SELECT p.*,
        (SELECT COUNT(*) FROM episodes e WHERE e.project_id = p.id AND e.deleted_at IS NULL) AS episode_count,
        (SELECT s.id FROM sheets s WHERE s.project_id = p.id AND s.kind = 'asset' AND s.deleted_at IS NULL LIMIT 1) AS asset_sheet_id
       FROM projects p
       WHERE p.deleted_at IS NULL
       ORDER BY p.created_at DESC`,
    )
    .all() as any[]
  return rows.map(mapProject)
}

export function getProject(projectId: string): Record<string, unknown> {
  const project = db
    .prepare('SELECT * FROM projects WHERE id = ? AND deleted_at IS NULL')
    .get(projectId) as any
  if (!project) throw new NotFoundError('项目不存在')

  const assetSheet = db
    .prepare(
      `SELECT id FROM sheets
       WHERE project_id = ? AND kind = 'asset' AND deleted_at IS NULL
       LIMIT 1`,
    )
    .get(projectId) as { id: string } | undefined

  const episodes = db
    .prepare(
      `SELECT * FROM episodes
       WHERE project_id = ?
       ORDER BY position, number`,
    )
    .all(projectId) as any[]

  const sheets = db
    .prepare(
      `SELECT s.*, e.number AS episode_number, e.title AS episode_title
       FROM sheets s
       LEFT JOIN episodes e ON e.id = s.episode_id
       WHERE s.project_id = ? AND s.deleted_at IS NULL
       ORDER BY CASE WHEN s.kind = 'beat' THEN 0 ELSE 1 END, e.position, s.position`,
    )
    .all(projectId) as any[]

  return {
    project: {
      ...mapProject({
        ...project,
        episode_count: episodes.filter((episode) => !episode.deleted_at).length,
        asset_sheet_id: assetSheet?.id ?? null,
      }),
    },
    episodes: episodes.map(mapEpisode),
    sheets: sheets.map(mapSheet),
  }
}

export function createProject(
  name: string,
  firstEpisode?: { number?: number; title?: string | null },
): Record<string, unknown> {
  const cleanName = String(name ?? '').trim()
  if (!cleanName) throw new ValidationError('项目名称不能为空')

  const now = nowIso()
  const projectId = uuidv7()
  const episodeId = uuidv7()
  const beatSheetId = uuidv7()
  const assetSheetId = uuidv7()
  const number = Number(firstEpisode?.number ?? 1)
  if (!Number.isInteger(number) || number < 1) {
    throw new ValidationError('第一集集号必须是正整数')
  }

  transaction(() => {
    db.prepare(
      `INSERT INTO projects (id, name, metadata_revision, created_at, updated_at)
       VALUES (?, ?, 1, ?, ?)`,
    ).run(projectId, cleanName, now, now)

    db.prepare(
      `INSERT INTO episodes
         (id, project_id, number, title, position, created_at, updated_at)
       VALUES (?, ?, ?, ?, 0, ?, ?)`,
    ).run(episodeId, projectId, number, firstEpisode?.title ?? null, now, now)

    db.prepare(
      `INSERT INTO sheets
         (id, project_id, kind, episode_id, name, position, schema_version,
          metadata_revision, created_at, updated_at)
       VALUES (?, ?, 'beat', ?, ?, 0, 1, 1, ?, ?)`,
    ).run(beatSheetId, projectId, episodeId, `第${number}集 节拍表`, now, now)

    db.prepare(
      `INSERT INTO sheets
         (id, project_id, kind, episode_id, name, position, schema_version,
          metadata_revision, created_at, updated_at)
       VALUES (?, ?, 'asset', NULL, ?, 1, 1, 1, ?, ?)`,
    ).run(assetSheetId, projectId, '资产表', now, now)

    db.prepare(
      `INSERT INTO sheet_docs (sheet_id, state, updated_at) VALUES (?, ?, ?)`,
    ).run(beatSheetId, createInitialSheetState('beat'), now)
    db.prepare(
      `INSERT INTO sheet_docs (sheet_id, state, updated_at) VALUES (?, ?, ?)`,
    ).run(assetSheetId, createInitialSheetState('asset'), now)
  })

  return getProject(projectId)
}

export function updateProject(projectId: string, name: string): Record<string, unknown> {
  const cleanName = String(name ?? '').trim()
  if (!cleanName) throw new ValidationError('项目名称不能为空')
  const now = nowIso()
  const result = db
    .prepare(
      `UPDATE projects
       SET name = ?, metadata_revision = metadata_revision + 1, updated_at = ?
       WHERE id = ? AND deleted_at IS NULL`,
    )
    .run(cleanName, now, projectId)
  if (result.changes === 0) throw new NotFoundError('项目不存在')
  emitProject(projectId, 'project.updated', { projectId, name: cleanName })
  return { id: projectId, name: cleanName }
}

export function createEpisode(
  projectId: string,
  numberInput: number,
  title: string | null,
): Record<string, unknown> {
  const project = db
    .prepare('SELECT id FROM projects WHERE id = ? AND deleted_at IS NULL')
    .get(projectId) as { id: string } | undefined
  if (!project) throw new NotFoundError('项目不存在')

  const number = Number(numberInput)
  if (!Number.isInteger(number) || number < 1) {
    throw new ValidationError('集号必须是正整数')
  }

  const duplicate = db
    .prepare(
      'SELECT id FROM episodes WHERE project_id = ? AND number = ? AND deleted_at IS NULL',
    )
    .get(projectId, number)
  if (duplicate) throw new ConflictError(`第 ${number} 集已存在`)

  const now = nowIso()
  const episodeId = uuidv7()
  const sheetId = uuidv7()
  const positionRow = db
    .prepare('SELECT COALESCE(MAX(position), -1) AS max_position FROM episodes WHERE project_id = ?')
    .get(projectId) as { max_position: number }
  const position = Number(positionRow.max_position) + 1

  transaction(() => {
    db.prepare(
      `INSERT INTO episodes
         (id, project_id, number, title, position, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(episodeId, projectId, number, title ?? null, position, now, now)

    db.prepare(
      `INSERT INTO sheets
         (id, project_id, kind, episode_id, name, position, schema_version,
          metadata_revision, created_at, updated_at)
       VALUES (?, ?, 'beat', ?, ?, ?, 1, 1, ?, ?)`,
    ).run(sheetId, projectId, episodeId, `第${number}集 节拍表`, position, now, now)

    db.prepare(
      `INSERT INTO sheet_docs (sheet_id, state, updated_at) VALUES (?, ?, ?)`,
    ).run(sheetId, createInitialSheetState('beat'), now)
  })

  const episode = db.prepare('SELECT * FROM episodes WHERE id = ?').get(episodeId) as any
  const sheet = db
    .prepare(
      `SELECT s.*, e.number AS episode_number, e.title AS episode_title
       FROM sheets s LEFT JOIN episodes e ON e.id = s.episode_id
       WHERE s.id = ?`,
    )
    .get(sheetId) as any

  emitProject(projectId, 'episode.created', {
    episodeId,
    number,
    title: title ?? null,
    sheetId,
  })

  return { episode: mapEpisode(episode), sheet: mapSheet(sheet) }
}

export function updateEpisode(
  episodeId: string,
  data: { number?: number; title?: string | null },
): Record<string, unknown> {
  const existing = db
    .prepare('SELECT * FROM episodes WHERE id = ? AND deleted_at IS NULL')
    .get(episodeId) as any
  if (!existing) throw new NotFoundError('集不存在')

  const number = data.number === undefined ? Number(existing.number) : Number(data.number)
  if (!Number.isInteger(number) || number < 1) {
    throw new ValidationError('集号必须是正整数')
  }

  if (number !== Number(existing.number)) {
    const duplicate = db
      .prepare(
        `SELECT id FROM episodes
         WHERE project_id = ? AND number = ? AND deleted_at IS NULL AND id <> ?`,
      )
      .get(existing.project_id, number, episodeId)
    if (duplicate) throw new ConflictError(`第 ${number} 集已存在`)
  }

  const title = data.title === undefined ? existing.title : data.title
  db.prepare(
    `UPDATE episodes
     SET number = ?, title = ?, updated_at = ?
     WHERE id = ?`,
  ).run(number, title ?? null, nowIso(), episodeId)

  const row = db.prepare('SELECT * FROM episodes WHERE id = ?').get(episodeId) as any
  emitProject(existing.project_id, 'episode.updated', {
    episodeId,
    number,
    title: title ?? null,
  })
  return mapEpisode(row)
}

export async function appendVideoToBeat(
  projectId: string,
  episodeNumber: number,
  beatNumber: number,
  assetId: string,
): Promise<Record<string, unknown>> {
  if (!Number.isInteger(episodeNumber) || episodeNumber < 1) {
    throw new ValidationError('集号必须是正整数')
  }
  if (!Number.isInteger(beatNumber) || beatNumber < 1) {
    throw new ValidationError('节拍序号必须是正整数')
  }

  const episode = db
    .prepare(
      `SELECT id FROM episodes
       WHERE project_id = ? AND number = ? AND deleted_at IS NULL`,
    )
    .get(projectId, episodeNumber) as { id: string } | undefined
  if (!episode) throw new NotFoundError(`第 ${episodeNumber} 集不存在`)

  const sheet = db
    .prepare(
      `SELECT id FROM sheets
       WHERE episode_id = ? AND kind = 'beat' AND deleted_at IS NULL`,
    )
    .get(episode.id) as { id: string } | undefined
  if (!sheet) throw new NotFoundError('该集的节拍表不存在')

  const asset = db
    .prepare(
      `SELECT id, kind FROM media_assets
       WHERE id = ? AND project_id = ? AND deleted_at IS NULL`,
    )
    .get(assetId, projectId) as { id: string; kind: string } | undefined
  if (!asset) throw new NotFoundError('媒体不存在或已删除')
  if (asset.kind !== 'video') {
    throw new ValidationError('节拍表视频列只接受视频文件')
  }

  const result = await withSheetDoc(sheet.id, (doc) => {
    const rowsMap = doc.getMap('rows') as Y.Map<any>
    const rows: Array<{ id: string; row: Y.Map<any>; position: string }> = []
    rowsMap.forEach((row, id) => {
      if (!(row instanceof Y.Map)) return
      if (row.get('deleted') === true) return
      rows.push({
        id,
        row,
        position: String(row.get('position') ?? ''),
      })
    })
    rows.sort((a, b) => {
      if (a.position < b.position) return -1
      if (a.position > b.position) return 1
      return a.id.localeCompare(b.id)
    })

    const target = rows[beatNumber - 1]
    if (!target) {
      throw new ValidationError(`第 ${beatNumber} 拍不存在`)
    }

    let cells = target.row.get('cells')
    if (!(cells instanceof Y.Map)) {
      cells = new Y.Map<any>()
      target.row.set('cells', cells)
    }
    let videos = cells.get('beat.videos')
    if (!(videos instanceof Y.Array)) {
      videos = new Y.Array<any>()
      cells.set('beat.videos', videos)
    }

    const existing = videos
      .toArray()
      .find(
        (item: any) =>
          item &&
          typeof item === 'object' &&
          item.assetId === assetId,
      ) as { linkId?: string } | undefined
    const linkId = existing?.linkId ?? uuidv7()
    if (!existing) {
      videos.push([{ linkId, assetId }])
    }
    return { sheetId: sheet.id, rowId: target.id, linkId, added: !existing }
  })

  emitProject(projectId, 'media.updated', { id: assetId })
  return result
}

export async function appendImageToAssetRow(
  projectId: string,
  category: string,
  assetName: string,
  role: 'selected' | 'alternate',
  assetId: string,
): Promise<Record<string, unknown>> {
  if (role !== 'selected' && role !== 'alternate') {
    throw new ValidationError('role 必须是 selected 或 alternate')
  }

  const assetSheet = db
    .prepare(
      `SELECT id FROM sheets
       WHERE project_id = ? AND kind = 'asset' AND deleted_at IS NULL`,
    )
    .get(projectId) as { id: string } | undefined
  if (!assetSheet) throw new NotFoundError('资产表不存在')

  const asset = db
    .prepare(
      `SELECT id, kind FROM media_assets
       WHERE id = ? AND project_id = ? AND deleted_at IS NULL`,
    )
    .get(assetId, projectId) as { id: string; kind: string } | undefined
  if (!asset) throw new NotFoundError('媒体不存在或已删除')
  if (asset.kind !== 'image') {
    throw new ValidationError('资产表只接受图片文件')
  }

  const targetCategory = String(category ?? '').trim() || '未分类'
  const targetName = String(assetName ?? '').trim() || '未命名'
  const result = await withSheetDoc(assetSheet.id, (doc) => {
    const rowsMap = doc.getMap('rows') as Y.Map<any>
    const rows: Array<{ id: string; row: Y.Map<any>; position: string }> = []
    rowsMap.forEach((row, id) => {
      if (!(row instanceof Y.Map)) return
      if (row.get('deleted') === true) return
      rows.push({
        id,
        row,
        position: String(row.get('position') ?? ''),
      })
    })
    rows.sort((a, b) => {
      if (a.position < b.position) return -1
      if (a.position > b.position) return 1
      return a.id.localeCompare(b.id)
    })

    const target = rows.find(({ row }) => {
      const cells = row.get('cells')
      if (!(cells instanceof Y.Map)) return false
      return (
        safeFolderName(cells.get('asset.category') || '未分类') ===
          targetCategory &&
        safeFolderName(cells.get('asset.name') || '未命名') === targetName
      )
    })
    if (!target) {
      throw new ValidationError(
        `找不到类别“${targetCategory}”、名称“${targetName}”的资产行`,
      )
    }

    let cells = target.row.get('cells')
    if (!(cells instanceof Y.Map)) {
      cells = new Y.Map<any>()
      target.row.set('cells', cells)
    }
    let alternates = cells.get('asset.alternates')
    if (!(alternates instanceof Y.Array)) {
      alternates = new Y.Array<any>()
      cells.set('asset.alternates', alternates)
    }

    const readItem = (value: unknown) => {
      if (value instanceof Y.Map) {
        return {
          linkId: String(value.get('linkId') ?? ''),
          assetId: String(value.get('assetId') ?? ''),
        }
      }
      if (value && typeof value === 'object') {
        const item = value as { linkId?: string; assetId?: string }
        return {
          linkId: String(item.linkId ?? ''),
          assetId: String(item.assetId ?? ''),
        }
      }
      return null
    }
    const items = alternates
      .toArray()
      .map((item: any) => readItem(item))
      .filter(
        (
          item: { linkId: string; assetId: string } | null,
        ): item is { linkId: string; assetId: string } =>
          Boolean(item?.assetId),
      )

    if (role === 'selected') {
      let linkId = ''
      for (let index = alternates.length - 1; index >= 0; index -= 1) {
        const item = readItem(alternates.get(index))
        if (item?.assetId === assetId) {
          linkId = item.linkId || linkId
          alternates.delete(index, 1)
        }
      }
      const currentSelected = readItem(cells.get('asset.selected'))
      if (currentSelected?.assetId === assetId) {
        cells.set('asset.selected', {
          linkId: currentSelected.linkId || uuidv7(),
          assetId,
        })
        return {
          sheetId: assetSheet.id,
          rowId: target.id,
          linkId: currentSelected.linkId || linkId,
          added: false,
        }
      }
      if (currentSelected?.assetId) {
        const alreadyAlternate = alternates
          .toArray()
          .map((item: any) => readItem(item))
          .some(
            (item: { linkId: string; assetId: string } | null) =>
              item?.assetId === currentSelected.assetId,
          )
        if (!alreadyAlternate) {
          alternates.push([
            {
              linkId: currentSelected.linkId || uuidv7(),
              assetId: currentSelected.assetId,
            },
          ])
        }
      }
      const nextLinkId = linkId || uuidv7()
      cells.set('asset.selected', { linkId: nextLinkId, assetId })
      return {
        sheetId: assetSheet.id,
        rowId: target.id,
        linkId: nextLinkId,
        added: true,
      }
    }

    if (readItem(cells.get('asset.selected'))?.assetId === assetId) {
      return {
        sheetId: assetSheet.id,
        rowId: target.id,
        linkId: '',
        added: false,
      }
    }
    const existing = items.find(
      (item: { linkId: string; assetId: string }) =>
        item.assetId === assetId,
    )
    if (existing) {
      return {
        sheetId: assetSheet.id,
        rowId: target.id,
        linkId: existing.linkId,
        added: false,
      }
    }
    const linkId = uuidv7()
    alternates.push([{ linkId, assetId }])
    return {
      sheetId: assetSheet.id,
      rowId: target.id,
      linkId,
      added: true,
    }
  })

  emitProject(projectId, 'media.updated', { id: assetId })
  return result
}

export function deleteEpisode(
  episodeId: string,
): Record<string, unknown> {
  const episode = db
    .prepare('SELECT * FROM episodes WHERE id = ? AND deleted_at IS NULL')
    .get(episodeId) as any
  if (!episode) throw new NotFoundError('集不存在')

  const sheet = db
    .prepare(
      `SELECT * FROM sheets
       WHERE episode_id = ? AND kind = 'beat' AND deleted_at IS NULL`,
    )
    .get(episodeId) as any
  if (!sheet) throw new NotFoundError('该集的节拍表不存在')

  const batchId = markSheetDeleted(sheet.id)
  closeSheetConnections(sheet.id)

  emitProject(episode.project_id, 'episode.deleted', {
    episodeId,
    sheetId: sheet.id,
    batchId,
  })
  emitProject(episode.project_id, 'recycle_bin.changed', {
    batchId,
    action: 'created',
  })

  return { batchId, sheetId: sheet.id }
}

export function getSheetDetail(sheetId: string): Record<string, unknown> {
  const sheet = db
    .prepare(
      `SELECT s.*, e.number AS episode_number, e.title AS episode_title
       FROM sheets s LEFT JOIN episodes e ON e.id = s.episode_id
       WHERE s.id = ? AND s.deleted_at IS NULL`,
    )
    .get(sheetId) as any
  if (!sheet) throw new NotFoundError('表不存在或已删除')

  const columns = getColumns(sheet.kind as SheetKind)
  const result: Record<string, unknown> = {
    sheet: mapSheet(sheet),
    columns,
  }

  if (sheet.kind === 'asset') {
    const episodes = db
      .prepare(
        `SELECT * FROM episodes
         WHERE project_id = ?
         ORDER BY position, number`,
      )
      .all(sheet.project_id) as any[]
    result.episodes = episodes.map(mapEpisode)
  }

  return result
}

export function renameSheet(
  sheetId: string,
  name: string,
  expectedRevision?: number,
): Record<string, unknown> {
  const cleanName = String(name ?? '').trim()
  if (!cleanName) throw new ValidationError('表名不能为空')

  const sheet = db
    .prepare('SELECT * FROM sheets WHERE id = ? AND deleted_at IS NULL')
    .get(sheetId) as any
  if (!sheet) throw new NotFoundError('表不存在或已删除')

  if (
    expectedRevision !== undefined &&
    Number(expectedRevision) !== Number(sheet.metadata_revision)
  ) {
    throw new ConflictError('表名已被其他人修改', {
      currentName: sheet.name,
      currentRevision: Number(sheet.metadata_revision),
    })
  }

  const now = nowIso()
  db.prepare(
    `UPDATE sheets
     SET name = ?, metadata_revision = metadata_revision + 1, updated_at = ?
     WHERE id = ?`,
  ).run(cleanName, now, sheetId)

  const updated = db
    .prepare('SELECT metadata_revision FROM sheets WHERE id = ?')
    .get(sheetId) as { metadata_revision: number }

  emitProject(sheet.project_id, 'sheet.renamed', {
    sheetId,
    name: cleanName,
    metadataRevision: Number(updated.metadata_revision),
  })

  return {
    sheetId,
    name: cleanName,
    metadataRevision: Number(updated.metadata_revision),
  }
}

function linkedRowsForAsset(assetId: string): Record<string, unknown>[] {
  const rows = db
    .prepare(
      `SELECT l.sheet_id, l.row_id, l.column_id, l.role,
              s.name AS sheet_name, s.kind AS sheet_kind,
              e.number AS episode_number, e.title AS episode_title
       FROM media_links l
       JOIN sheets s ON s.id = l.sheet_id
       LEFT JOIN episodes e ON e.id = s.episode_id
       WHERE l.asset_id = ? AND l.deleted_at IS NULL
       ORDER BY l.created_at`,
    )
    .all(assetId) as any[]

  return rows.map((row) => ({
    sheetId: row.sheet_id,
    sheetName: row.sheet_name,
    sheetKind: row.sheet_kind,
    episodeNumber: row.episode_number,
    episodeTitle: row.episode_title,
    rowId: row.row_id,
    columnId: row.column_id,
    role: row.role,
  }))
}

function usageCountForAsset(assetId: string): number {
  const row = db
    .prepare(
      'SELECT COUNT(*) AS c FROM media_links WHERE asset_id = ? AND deleted_at IS NULL',
    )
    .get(assetId) as { c: number | bigint }
  return Number(row.c)
}

function assetMediaFolderPaths(projectId: string): Map<string, string> {
  const sheet = db
    .prepare(
      `SELECT id FROM sheets
       WHERE project_id = ? AND kind = 'asset' AND deleted_at IS NULL`,
    )
    .get(projectId) as { id: string } | undefined
  if (!sheet) return new Map()

  const docRow = db
    .prepare('SELECT state FROM sheet_docs WHERE sheet_id = ?')
    .get(sheet.id) as { state: Uint8Array } | undefined
  if (!docRow?.state) return new Map()

  const rowFolders = new Map<
    string,
    { categoryFolder: string; nameFolder: string }
  >()
  const doc = new Y.Doc()
  try {
    Y.applyUpdate(doc, new Uint8Array(docRow.state))
    const rows = doc.getMap('rows') as Y.Map<any>
    rows.forEach((row, rowId) => {
      if (!(row instanceof Y.Map)) return
      if (row.get('deleted') === true) return
      const cells = row.get('cells')
      if (!(cells instanceof Y.Map)) return
      const category = String(cells.get('asset.category') ?? '').trim()
      const name = String(cells.get('asset.name') ?? '').trim()
      rowFolders.set(rowId, {
        categoryFolder: safeFolderName(category || '未分类'),
        nameFolder: safeFolderName(name || '未命名'),
      })
    })
  } finally {
    doc.destroy()
  }

  const links = db
    .prepare(
      `SELECT l.asset_id, l.row_id, l.role
       FROM media_links l
       JOIN sheets s ON s.id = l.sheet_id
       WHERE s.project_id = ?
         AND s.kind = 'asset'
         AND s.deleted_at IS NULL
         AND l.deleted_at IS NULL
       ORDER BY CASE l.role WHEN 'selected' THEN 0 ELSE 1 END,
                l.created_at`,
    )
    .all(projectId) as Array<{
    asset_id: string
    row_id: string
    role: string
  }>

  const result = new Map<string, string>()
  for (const link of links) {
    if (result.has(link.asset_id)) continue
    const folder = rowFolders.get(link.row_id)
    if (!folder) continue
    if (link.role !== 'selected' && link.role !== 'alternate') continue
    const roleFolder = link.role === 'selected' ? '选定' : '备选'
    result.set(
      link.asset_id,
      `资产表 / ${folder.categoryFolder} / ${folder.nameFolder} / ${roleFolder}`,
    )
  }
  return result
}

export function listMedia(
  projectId: string,
  filters: {
    kind?: string
    status?: string
    usage?: string
    q?: string
    limit?: number
  },
): Record<string, unknown> {
  const conditions = ['a.project_id = ?', 'a.deleted_at IS NULL']
  const params: any[] = [projectId]

  if (filters.kind === 'video' || filters.kind === 'image') {
    conditions.push('a.kind = ?')
    params.push(filters.kind)
  }
  if (filters.status) {
    conditions.push('a.status = ?')
    params.push(filters.status)
  }
  if (filters.q) {
    conditions.push('a.display_name LIKE ?')
    params.push(`%${filters.q}%`)
  }

  const limit = Math.min(Math.max(Number(filters.limit ?? 200), 1), 500)
  const having =
    filters.usage === 'linked'
      ? 'HAVING usage_count > 0'
      : filters.usage === 'unlinked'
        ? 'HAVING usage_count = 0'
        : ''

  const rows = db
    .prepare(
      `SELECT a.*,
         (SELECT COUNT(*) FROM media_links l
          WHERE l.asset_id = a.id AND l.deleted_at IS NULL) AS usage_count
       FROM media_assets a
       WHERE ${conditions.join(' AND ')}
       ${having}
       ORDER BY a.created_at DESC
       LIMIT ?`,
    )
    .all(...params, limit) as any[]

  const assetFolderPaths = assetMediaFolderPaths(projectId)

  return {
    items: rows.map((row) => {
      const formatted = formatMediaAsset(row)
      return {
        ...formatted,
        folderPath: assetFolderPaths.get(row.id) ?? formatted.folderPath,
        usageCount: Number(row.usage_count ?? 0),
        linkedRows: linkedRowsForAsset(row.id),
      }
    }),
    nextCursor: null,
  }
}

export function getMediaDetail(assetId: string): Record<string, unknown> {
  const asset = db
    .prepare('SELECT * FROM media_assets WHERE id = ? AND deleted_at IS NULL')
    .get(assetId) as any
  if (!asset) throw new NotFoundError('媒体不存在或已删除')

  const formatted = formatMediaAsset(asset)
  return {
    asset: formatted,
    urls: {
      thumbnail: formatted.thumbnailUrl,
      original: formatted.originalUrl,
      proxy: formatted.originalUrl,
    },
    usageCount: usageCountForAsset(assetId),
    linkedRows: linkedRowsForAsset(assetId),
  }
}

export function renameMediaAsset(
  assetId: string,
  displayName: string,
): Record<string, unknown> {
  const cleanName = String(displayName ?? '').trim()
  if (!cleanName) throw new ValidationError('文件名不能为空')

  const asset = db
    .prepare('SELECT * FROM media_assets WHERE id = ? AND deleted_at IS NULL')
    .get(assetId) as any
  if (!asset) throw new NotFoundError('媒体不存在或已删除')

  db.prepare(
    `UPDATE media_assets
     SET display_name = ?, updated_at = ?
     WHERE id = ?`,
  ).run(cleanName, nowIso(), assetId)

  const updated = db
    .prepare('SELECT * FROM media_assets WHERE id = ?')
    .get(assetId) as any
  const formatted = formatMediaAsset(updated)
  emitProject(asset.project_id, 'media.updated', formatted)
  return { asset: formatted }
}

export function createUploadRecord(input: {
  projectId: string
  assetId: string
  kind: MediaKind
  filename: string
  mimeType: string
  sizeBytes: number
  storageKey: string
}): Record<string, unknown> {
  const project = db
    .prepare('SELECT id FROM projects WHERE id = ? AND deleted_at IS NULL')
    .get(input.projectId) as { id: string } | undefined
  if (!project) throw new NotFoundError('项目不存在')

  const now = nowIso()
  const existing = db
    .prepare('SELECT * FROM media_assets WHERE id = ?')
    .get(input.assetId) as any
  if (existing && existing.project_id !== input.projectId) {
    throw new ConflictError('媒体 ID 已属于其他项目')
  }

  if (!existing) {
    db.prepare(
      `INSERT INTO media_assets
         (id, project_id, kind, display_name, storage_key, mime_type, size_bytes,
          status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'uploading', ?, ?)`,
    ).run(
      input.assetId,
      input.projectId,
      input.kind,
      input.filename,
      input.storageKey,
      input.mimeType,
      input.sizeBytes,
      now,
      now,
    )
  } else {
    db.prepare(
      `UPDATE media_assets
       SET display_name = ?, mime_type = ?, size_bytes = ?, updated_at = ?
       WHERE id = ?`,
    ).run(input.filename, input.mimeType, input.sizeBytes, now, input.assetId)
  }

  return formatMediaAsset(
    db.prepare('SELECT * FROM media_assets WHERE id = ?').get(input.assetId),
  )
}

export function completeUploadRecord(input: {
  assetId: string
  projectId: string
  mimeType: string
  sizeBytes: number
  width?: number | null
  height?: number | null
  thumbnailKey?: string | null
  error?: string | null
}): Record<string, unknown> {
  const now = nowIso()
  const status = input.error ? 'failed' : 'ready'
  db.prepare(
    `UPDATE media_assets
     SET mime_type = ?, size_bytes = ?, width = ?, height = ?,
         thumbnail_key = ?, status = ?, processing_error = ?, updated_at = ?
     WHERE id = ?`,
  ).run(
    input.mimeType,
    input.sizeBytes,
    input.width ?? null,
    input.height ?? null,
    input.thumbnailKey ?? null,
    status,
    input.error ?? null,
    now,
    input.assetId,
  )

  const asset = db
    .prepare('SELECT * FROM media_assets WHERE id = ?')
    .get(input.assetId) as any
  const formatted = formatMediaAsset(asset)
  emitProject(input.projectId, 'media.updated', formatted)
  return formatted
}

function createMediaBatch(
  projectId: string,
  assetId: string,
  displayName: string,
): string {
  const batchId = uuidv7()
  const now = nowIso()
  const meta: BatchMeta = {
    assetId,
    fileName: displayName,
    itemCounts: { rows: 0, media: 1 },
    links: [],
  }
  db.prepare(
    `INSERT INTO deletion_batches
       (id, project_id, kind, status, metadata_json, created_at)
     VALUES (?, ?, 'media', 'active', ?, ?)`,
  ).run(batchId, projectId, JSON.stringify(meta), now)

  db.prepare(
    `UPDATE media_assets
     SET deleted_at = ?, deletion_batch_id = ?, updated_at = ?
     WHERE id = ?`,
  ).run(now, batchId, now, assetId)

  db.prepare(
    `UPDATE media_links
     SET deletion_batch_id = ?, updated_at = ?
     WHERE asset_id = ? AND deleted_at IS NOT NULL AND deletion_batch_id IS NULL`,
  ).run(batchId, now, assetId)

  refreshBatchMediaCount(batchId)
  return batchId
}

export async function deleteMediaAsset(
  assetId: string,
  force: boolean,
): Promise<Record<string, unknown>> {
  const asset = db
    .prepare('SELECT * FROM media_assets WHERE id = ? AND deleted_at IS NULL')
    .get(assetId) as any
  if (!asset) throw new NotFoundError('媒体不存在或已删除')

  const usageCount = usageCountForAsset(assetId)
  if (usageCount > 0 && !force) {
    throw new MediaInUseError(`该媒体仍被 ${usageCount} 处使用`, {
      usageCount,
      linkedRows: linkedRowsForAsset(assetId),
    })
  }

  let removedLinks = 0
  if (usageCount > 0 && force) {
    removedLinks = await removeMediaLinksForAsset(assetId)
  }

  const latest = db
    .prepare('SELECT * FROM media_assets WHERE id = ?')
    .get(assetId) as any
  let batchId = latest?.deletion_batch_id as string | null
  if (!batchId) {
    batchId = createMediaBatch(asset.project_id, assetId, asset.display_name)
  }

  emitProject(asset.project_id, 'media.updated', {
    id: assetId,
    deletedAt: nowIso(),
  })
  emitProject(asset.project_id, 'recycle_bin.changed', {
    batchId,
    action: 'created',
  })

  return { batchId, removedLinks }
}

function parseMeta(value: string | null | undefined): BatchMeta {
  if (!value) return {}
  try {
    return JSON.parse(value) as BatchMeta
  } catch {
    return {}
  }
}

export function listAssetFolders(projectId: string): {
  folders: Array<{
    category: string
    name: string
    categoryFolder: string
    nameFolder: string
  }>
} {
  const sheet = db
    .prepare(
      `SELECT id FROM sheets
       WHERE project_id = ? AND kind = 'asset' AND deleted_at IS NULL`,
    )
    .get(projectId) as { id: string } | undefined
  if (!sheet) return { folders: [] }

  const docRow = db
    .prepare('SELECT state FROM sheet_docs WHERE sheet_id = ?')
    .get(sheet.id) as { state: Uint8Array } | undefined
  if (!docRow?.state) return { folders: [] }

  const doc = new Y.Doc()
  try {
    Y.applyUpdate(doc, new Uint8Array(docRow.state))
    const rows = doc.getMap('rows') as Y.Map<any>
    const seen = new Set<string>()
    const folders: Array<{
      category: string
      name: string
      categoryFolder: string
      nameFolder: string
    }> = []
    rows.forEach((row) => {
      if (!(row instanceof Y.Map)) return
      if (row.get('deleted') === true) return
      const cells = row.get('cells')
      if (!(cells instanceof Y.Map)) return
      const category = String(cells.get('asset.category') ?? '').trim()
      const name = String(cells.get('asset.name') ?? '').trim()
      if (!category && !name) return
      const categoryFolder = safeFolderName(category || '未分类')
      const nameFolder = safeFolderName(name || '未命名')
      const key = `${categoryFolder}\u0000${nameFolder}`
      if (seen.has(key)) return
      seen.add(key)
      folders.push({
        category,
        name,
        categoryFolder,
        nameFolder,
      })
    })
    folders.sort((a, b) => {
      const categoryDiff = a.categoryFolder.localeCompare(
        b.categoryFolder,
        'zh-CN',
      )
      if (categoryDiff !== 0) return categoryDiff
      return a.nameFolder.localeCompare(b.nameFolder, 'zh-CN')
    })
    return { folders }
  } finally {
    doc.destroy()
  }
}

function recycleReferencedMedia(rows: any[], batchId: string) {
  return rows.map((row) => {
    const formatted = formatMediaAsset(row)
    const usageCount = usageCountForAsset(row.id)
    return {
      assetId: row.id,
      kind: row.kind,
      displayName: row.display_name,
      mimeType: formatted.mimeType,
      sizeBytes: formatted.sizeBytes,
      width: formatted.width,
      height: formatted.height,
      durationMs: formatted.durationMs,
      status: formatted.status,
      processingError: formatted.processingError,
      thumbnailUrl: formatted.thumbnailUrl,
      originalUrl: formatted.originalUrl,
      createdAt: formatted.createdAt,
      folderPath: formatted.folderPath,
      deleted: row.deleted_at != null,
      deletedInBatch:
        row.deleted_at != null && row.deletion_batch_id === batchId,
      shared: usageCount > 0,
      usageCount,
    }
  })
}

export function listRecycleBin(projectId: string): Record<string, unknown> {
  const batches = db
    .prepare(
      `SELECT * FROM deletion_batches
       WHERE project_id = ? AND status = 'active'
       ORDER BY created_at DESC`,
    )
    .all(projectId) as any[]

  const result = batches.map((batch) => {
    const meta = parseMeta(batch.metadata_json)
    const mediaRows = db
      .prepare(
        `SELECT * FROM media_assets
         WHERE deletion_batch_id = ? AND deleted_at IS NOT NULL`,
      )
      .all(batch.id) as any[]

    const referencedAssetIds = Array.from(
      new Set((meta.links ?? []).map((link) => link.assetId)),
    )
    let referencedRows: any[] = []
    if (referencedAssetIds.length > 0) {
      const placeholders = referencedAssetIds.map(() => '?').join(',')
      referencedRows = db
        .prepare(`SELECT * FROM media_assets WHERE id IN (${placeholders})`)
        .all(...referencedAssetIds) as any[]
    }
    const referencedMedia =
      referencedRows.length > 0
        ? recycleReferencedMedia(referencedRows, batch.id)
        : recycleReferencedMedia(mediaRows, batch.id)

    let canRestore = true
    let restoreBlockedReason: string | null = null
    if (batch.kind === 'row' && meta.sheetId) {
      const sheet = db
        .prepare('SELECT deleted_at, deletion_batch_id FROM sheets WHERE id = ?')
        .get(meta.sheetId) as { deleted_at: string | null; deletion_batch_id: string | null } | undefined
      if (!sheet || sheet.deleted_at) {
        canRestore = false
        restoreBlockedReason = '所属节拍表还在回收站，请先恢复整集'
      }
    }

    return {
      id: batch.id,
      kind: batch.kind,
      status: batch.status,
      createdAt: batch.created_at,
      metadata: meta,
      referencedMedia,
      media: mediaRows.map((row) => {
        const formatted = formatMediaAsset(row)
        return {
          assetId: row.id,
          kind: row.kind,
          displayName: row.display_name,
          thumbnailUrl: formatted.thumbnailUrl,
          originalUrl: formatted.originalUrl,
        }
      }),
      canRestore,
      restoreBlockedReason,
    }
  })

  return { batches: result }
}

function getBatch(batchId: string): any {
  return db.prepare('SELECT * FROM deletion_batches WHERE id = ?').get(batchId) as any
}

function markBatchStatus(
  batchId: string,
  status: 'restored' | 'purged',
): void {
  const now = nowIso()
  if (status === 'restored') {
    db.prepare(
      `UPDATE deletion_batches
       SET status = 'restored', restored_at = ?
       WHERE id = ? AND status = 'active'`,
    ).run(now, batchId)
  } else {
    db.prepare(
      `UPDATE deletion_batches
       SET status = 'purged', purged_at = ?
       WHERE id = ?`,
    ).run(now, batchId)
  }
}

export async function restoreBatch(
  batchId: string,
): Promise<Record<string, unknown>> {
  const batch = getBatch(batchId)
  if (!batch) throw new NotFoundError('回收站批次不存在')
  if (batch.status !== 'active') {
    return {
      batchId,
      status: batch.status,
      restored: { rows: 0, sheets: 0, media: 0 },
    }
  }

  const meta = parseMeta(batch.metadata_json)
  const now = nowIso()
  let restoredRows = 0
  let restoredSheets = 0
  let restoredMedia = 0

  if (batch.kind === 'row') {
    if (!meta.sheetId || !meta.rowId) {
      throw new ValidationError('删除批次缺少行信息')
    }
    const sheet = db
      .prepare('SELECT deleted_at, deletion_batch_id, project_id FROM sheets WHERE id = ?')
      .get(meta.sheetId) as
      | { deleted_at: string | null; deletion_batch_id: string | null; project_id: string }
      | undefined
    if (!sheet) throw new NotFoundError('所属节拍表不存在')
    if (sheet.deleted_at) {
      throw new ConflictError('所属节拍表还在回收站，请先恢复整集', {
        dependencyBatchId: sheet.deletion_batch_id,
      })
    }

    await withSheetDoc(meta.sheetId, (doc) => {
      const rows = doc.getMap('rows') as any
      const row = rows.get(meta.rowId)
      if (row instanceof Object && typeof row.get === 'function') {
        row.set('deleted', false)
        row.set('deletionBatchId', null)
        row.set('deletedAt', null)
      }
    })

    db.prepare(
      `UPDATE media_links
       SET deleted_at = NULL, deletion_batch_id = NULL, updated_at = ?
       WHERE deletion_batch_id = ?`,
    ).run(now, batchId)
    db.prepare(
      `UPDATE media_assets
       SET deleted_at = NULL, deletion_batch_id = NULL, updated_at = ?
       WHERE deletion_batch_id = ?`,
    ).run(now, batchId)
    restoredRows = 1
    restoredMedia = Number(meta.itemCounts?.media ?? 0)
    markBatchStatus(batchId, 'restored')

    emitProject(sheet.project_id, 'recycle_bin.changed', {
      batchId,
      action: 'restored',
    })
  } else if (batch.kind === 'sheet') {
    const sheetId = meta.sheetId
    if (!sheetId) throw new ValidationError('删除批次缺少表信息')
    const sheet = db
      .prepare('SELECT * FROM sheets WHERE id = ?')
      .get(sheetId) as any
    if (!sheet) throw new NotFoundError('表不存在')

    transaction(() => {
      if (meta.episodeId) {
        db.prepare(
          `UPDATE episodes
           SET deleted_at = NULL, deletion_batch_id = NULL, updated_at = ?
           WHERE id = ?`,
        ).run(now, meta.episodeId)
      }
      db.prepare(
        `UPDATE sheets
         SET deleted_at = NULL, deletion_batch_id = NULL, updated_at = ?
         WHERE id = ?`,
      ).run(now, sheetId)
      db.prepare(
        `UPDATE media_links
         SET deleted_at = NULL, deletion_batch_id = NULL, updated_at = ?
         WHERE deletion_batch_id = ?`,
      ).run(now, batchId)
      db.prepare(
        `UPDATE media_assets
         SET deleted_at = NULL, deletion_batch_id = NULL, updated_at = ?
         WHERE deletion_batch_id = ?`,
      ).run(now, batchId)
      markBatchStatus(batchId, 'restored')
    })

    restoredSheets = 1
    restoredMedia = Number(meta.itemCounts?.media ?? 0)
    emitProject(sheet.project_id, 'episode.restored', {
      episodeId: meta.episodeId,
      sheetId: meta.sheetId,
    })
    emitProject(sheet.project_id, 'recycle_bin.changed', {
      batchId,
      action: 'restored',
    })
  } else {
    const assets = db
      .prepare(
        `SELECT * FROM media_assets
         WHERE deletion_batch_id = ? AND deleted_at IS NOT NULL`,
      )
      .all(batchId) as any[]
    db.prepare(
      `UPDATE media_assets
       SET deleted_at = NULL, deletion_batch_id = NULL, updated_at = ?
       WHERE deletion_batch_id = ?`,
    ).run(now, batchId)
    markBatchStatus(batchId, 'restored')
    restoredMedia = assets.length
    emitProject(batch.project_id, 'recycle_bin.changed', {
      batchId,
      action: 'restored',
    })
  }

  return {
    batchId,
    status: 'restored',
    restored: {
      rows: restoredRows,
      sheets: restoredSheets,
      media: restoredMedia,
    },
  }
}

export function purgeBatch(batchId: string): Record<string, unknown> {
  const batch = getBatch(batchId)
  if (!batch) throw new NotFoundError('回收站批次不存在')
  if (batch.status === 'purged') {
    return { batchId, status: 'purged' }
  }

  const meta = parseMeta(batch.metadata_json)
  const mediaRows = db
    .prepare(
      `SELECT * FROM media_assets
       WHERE deletion_batch_id = ? AND deleted_at IS NOT NULL`,
    )
    .all(batchId) as any[]

  transaction(() => {
    for (const asset of mediaRows) {
      if (usageCountForAsset(asset.id) === 0) {
        db.prepare(
          `DELETE FROM media_links
           WHERE asset_id = ? AND deleted_at IS NOT NULL`,
        ).run(asset.id)
        db.prepare('DELETE FROM media_assets WHERE id = ?').run(asset.id)
        deleteAssetFiles(asset)
      }
    }

    db.prepare(
      `DELETE FROM media_links
       WHERE deletion_batch_id = ?`,
    ).run(batchId)

    if (batch.kind === 'sheet' && meta.sheetId) {
      db.prepare('DELETE FROM sheet_docs WHERE sheet_id = ?').run(meta.sheetId)
      db.prepare('DELETE FROM sheets WHERE id = ?').run(meta.sheetId)
      if (meta.episodeId) {
        db.prepare('DELETE FROM episodes WHERE id = ?').run(meta.episodeId)
      }
    }

    markBatchStatus(batchId, 'purged')
  })

  emitProject(batch.project_id, 'recycle_bin.changed', {
    batchId,
    action: 'purged',
  })

  return { batchId, status: 'purged' }
}
