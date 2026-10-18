import * as Y from 'yjs'
import { v7 as uuidv7 } from 'uuid'
import { db, nowIso, transaction } from './db.js'
import { extractSheet, getRowSummary } from './yjs-utils.js'
import type { ExtractedLink } from './yjs-utils.js'

type SheetContext = {
  id: string
  project_id: string
  kind: 'beat' | 'asset'
  episode_id: string | null
  name: string
  deleted_at: string | null
  deletion_batch_id: string | null
  episode_number: number | null
  episode_title: string | null
}

export type BatchMeta = {
  sheetId?: string
  sheetName?: string
  episodeId?: string | null
  episodeNumber?: number | null
  episodeTitle?: string | null
  rowId?: string
  rowSummary?: string
  assetId?: string
  fileName?: string
  links?: Array<{
    linkId: string
    assetId: string
    sheetId: string
    rowId: string
    columnId: string
    role: string
  }>
  itemCounts?: { rows?: number; media?: number }
  [key: string]: unknown
}

function getSheetContext(sheetId: string): SheetContext | undefined {
  return db
    .prepare(
      `SELECT s.id, s.project_id, s.kind, s.episode_id, s.name, s.deleted_at,
              s.deletion_batch_id, e.number AS episode_number, e.title AS episode_title
       FROM sheets s
       LEFT JOIN episodes e ON e.id = s.episode_id
       WHERE s.id = ?`,
    )
    .get(sheetId) as SheetContext | undefined
}

function parseMeta(value: string | null | undefined): BatchMeta {
  if (!value) return {}
  try {
    return JSON.parse(value) as BatchMeta
  } catch {
    return {}
  }
}

export function ensureBatch(
  batchId: string,
  projectId: string,
  kind: 'row' | 'sheet' | 'media',
  meta: BatchMeta,
): void {
  const existing = db
    .prepare('SELECT id, status, metadata_json FROM deletion_batches WHERE id = ?')
    .get(batchId) as { id: string; status: string; metadata_json: string } | undefined

  if (!existing) {
    db.prepare(
      `INSERT INTO deletion_batches (id, project_id, kind, status, metadata_json, created_at)
       VALUES (?, ?, ?, 'active', ?, ?)`,
    ).run(batchId, projectId, kind, JSON.stringify(meta), nowIso())
    return
  }

  if (existing.status === 'active') {
    const old = parseMeta(existing.metadata_json)
    const merged: BatchMeta = {
      ...old,
      ...meta,
      itemCounts: { ...(old.itemCounts ?? {}), ...(meta.itemCounts ?? {}) },
      links: meta.links ?? old.links,
    }
    db.prepare('UPDATE deletion_batches SET metadata_json = ? WHERE id = ?').run(
      JSON.stringify(merged),
      batchId,
    )
  }
}

export function updateBatchMeta(batchId: string, patch: Partial<BatchMeta>): void {
  const row = db
    .prepare('SELECT metadata_json, status FROM deletion_batches WHERE id = ?')
    .get(batchId) as { metadata_json: string; status: string } | undefined
  if (!row || row.status !== 'active') return
  const old = parseMeta(row.metadata_json)
  const merged: BatchMeta = {
    ...old,
    ...patch,
    itemCounts: { ...(old.itemCounts ?? {}), ...(patch.itemCounts ?? {}) },
    links: patch.links ?? old.links,
  }
  db.prepare('UPDATE deletion_batches SET metadata_json = ? WHERE id = ?').run(
    JSON.stringify(merged),
    batchId,
  )
}

export function refreshBatchMediaCount(batchId: string): void {
  const countRow = db
    .prepare(
      `SELECT COUNT(*) AS c FROM media_assets
       WHERE deletion_batch_id = ? AND deleted_at IS NOT NULL`,
    )
    .get(batchId) as { c: number | bigint } | undefined
  updateBatchMeta(batchId, { itemCounts: { media: Number(countRow?.c ?? 0) } })
}

function countActiveLinks(assetId: string): number {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS c FROM media_links
       WHERE asset_id = ? AND deleted_at IS NULL`,
    )
    .get(assetId) as { c: number | bigint } | undefined
  return Number(row?.c ?? 0)
}

function getAsset(assetId: string): any | undefined {
  return db.prepare('SELECT * FROM media_assets WHERE id = ?').get(assetId) as any
}

function restoreAssetIfPossible(assetId: string): void {
  const asset = getAsset(assetId)
  if (!asset || asset.deleted_at == null) return
  const oldBatch = asset.deletion_batch_id as string | null
  db.prepare(
    `UPDATE media_assets
     SET deleted_at = NULL, deletion_batch_id = NULL, updated_at = ?
     WHERE id = ?`,
  ).run(nowIso(), assetId)

  if (oldBatch) {
    const batch = db
      .prepare('SELECT kind, status FROM deletion_batches WHERE id = ?')
      .get(oldBatch) as { kind: string; status: string } | undefined
    if (batch?.kind === 'media' && batch.status === 'active') {
      db.prepare(
        `UPDATE deletion_batches
         SET status = 'restored', restored_at = ?
         WHERE id = ?`,
      ).run(nowIso(), oldBatch)
    }
  }
}

function markAssetDeleted(assetId: string, batchId: string): void {
  const now = nowIso()
  db.prepare(
    `UPDATE media_assets
     SET deleted_at = ?, deletion_batch_id = ?, updated_at = ?
     WHERE id = ? AND deleted_at IS NULL`,
  ).run(now, batchId, now, assetId)
  db.prepare(
    `UPDATE media_links
     SET deletion_batch_id = ?, updated_at = ?
     WHERE asset_id = ? AND deleted_at IS NOT NULL AND deletion_batch_id IS NULL`,
  ).run(batchId, now, assetId)
}

function upsertActiveLink(sheetId: string, projectId: string, link: ExtractedLink): boolean {
  const asset = getAsset(link.assetId)
  if (!asset || asset.project_id !== projectId) return false

  const now = nowIso()
  db.prepare(
    `INSERT INTO media_links
       (id, project_id, asset_id, sheet_id, row_id, column_id, role, position,
        deleted_at, deletion_batch_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       asset_id = excluded.asset_id,
       sheet_id = excluded.sheet_id,
       row_id = excluded.row_id,
       column_id = excluded.column_id,
       role = excluded.role,
       position = excluded.position,
       deleted_at = NULL,
       deletion_batch_id = NULL,
       updated_at = excluded.updated_at`,
  ).run(
    link.linkId,
    projectId,
    link.assetId,
    sheetId,
    link.rowId,
    link.columnId,
    link.role,
    link.position,
    now,
    now,
  )
  db.prepare('UPDATE media_assets SET linked_once = 1, updated_at = ? WHERE id = ?').run(
    now,
    link.assetId,
  )
  return true
}

function insertDeletedLink(
  sheetId: string,
  projectId: string,
  link: ExtractedLink,
  batchId: string,
): void {
  const asset = getAsset(link.assetId)
  if (!asset || asset.project_id !== projectId) return
  const now = nowIso()
  db.prepare(
    `INSERT INTO media_links
       (id, project_id, asset_id, sheet_id, row_id, column_id, role, position,
        deleted_at, deletion_batch_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       asset_id = excluded.asset_id,
       sheet_id = excluded.sheet_id,
       row_id = excluded.row_id,
       column_id = excluded.column_id,
       role = excluded.role,
       position = excluded.position,
       deleted_at = excluded.deleted_at,
       deletion_batch_id = excluded.deletion_batch_id,
       updated_at = excluded.updated_at`,
  ).run(
    link.linkId,
    projectId,
    link.assetId,
    sheetId,
    link.rowId,
    link.columnId,
    link.role,
    link.position,
    now,
    batchId,
    now,
    now,
  )
}

function createMediaBatch(projectId: string, meta: BatchMeta): string {
  const batchId = uuidv7()
  ensureBatch(batchId, projectId, 'media', meta)
  return batchId
}

/**
 * Reconcile media_links from the Yjs document.
 *
 * The Yjs document remains the source of truth for rows/cells/media references.
 * SQL here is only a projection used by the media library and recycle bin.
 */
export function syncSheet(doc: Y.Doc, sheetId: string): void {
  const sheet = getSheetContext(sheetId)
  if (!sheet) return
  if (sheet.deleted_at) return

  const { activeLinks, deletedRows } = extractSheet(doc)
  const projectId = sheet.project_id
  const now = nowIso()

  const dbActive = db
    .prepare(
      `SELECT * FROM media_links
       WHERE sheet_id = ? AND deleted_at IS NULL`,
    )
    .all(sheetId) as any[]

  const touchedBatches = new Set<string>()
  const affectedAssets = new Set<string>()
  const assetBatch = new Map<string, string>()

  transaction(() => {
    // Temporarily detach every currently-active link for this sheet. This frees
    // partial unique indexes (notably one selected image per row) while roles
    // are being swapped, e.g. alternate -> selected and selected -> alternate.
    db.prepare(
      `UPDATE media_links
       SET deleted_at = ?, updated_at = ?
       WHERE sheet_id = ? AND deleted_at IS NULL`,
    ).run(now, now, sheetId)

    for (const old of dbActive) {
      affectedAssets.add(old.asset_id)
    }

    // Active links present in Yjs.
    for (const link of activeLinks) {
      if (upsertActiveLink(sheetId, projectId, link)) {
        affectedAssets.add(link.assetId)
      }
    }

    // Deleted rows keep their links in the tombstone. Group them into the row batch.
    for (const deletedRow of deletedRows) {
      const batchId = deletedRow.batchId ?? uuidv7()
      const yRow = doc.getMap('rows').get(deletedRow.rowId)
      const rowSummary =
        yRow && typeof (yRow as any).get === 'function'
          ? getRowSummary(yRow as any)
          : '空行'

      ensureBatch(batchId, projectId, 'row', {
        sheetId,
        sheetName: sheet.name,
        episodeId: sheet.episode_id,
        episodeNumber: sheet.episode_number,
        episodeTitle: sheet.episode_title,
        rowId: deletedRow.rowId,
        rowSummary,
        itemCounts: { rows: 1, media: 0 },
        links: deletedRow.links.map((link) => ({
          linkId: link.linkId,
          assetId: link.assetId,
          sheetId,
          rowId: deletedRow.rowId,
          columnId: link.columnId,
          role: link.role,
        })),
      })
      touchedBatches.add(batchId)

      for (const link of deletedRow.links) {
        insertDeletedLink(sheetId, projectId, link, batchId)
        affectedAssets.add(link.assetId)
        if (!assetBatch.has(link.assetId)) {
          assetBatch.set(link.assetId, batchId)
        }
      }
    }

    // Resolve assets that lost all references.
    for (const assetId of affectedAssets) {
      const asset = getAsset(assetId)
      if (!asset) continue
      const activeCount = countActiveLinks(assetId)

      if (activeCount > 0) {
        if (asset.deleted_at != null) {
          restoreAssetIfPossible(assetId)
        }
        continue
      }

      if (asset.deleted_at == null && Number(asset.linked_once) === 1) {
        let batchId = assetBatch.get(assetId) ?? null
        if (!batchId) {
          const deletedLinks = db
            .prepare(
              `SELECT * FROM media_links
               WHERE asset_id = ? AND deleted_at IS NOT NULL AND deletion_batch_id IS NULL`,
            )
            .all(assetId) as any[]
          batchId = createMediaBatch(projectId, {
            sheetId: deletedLinks[0]?.sheet_id ?? sheetId,
            rowId: deletedLinks[0]?.row_id,
            assetId,
            fileName: asset.display_name,
            links: deletedLinks.map((link) => ({
              linkId: link.id,
              assetId: link.asset_id,
              sheetId: link.sheet_id,
              rowId: link.row_id,
              columnId: link.column_id,
              role: link.role,
            })),
            itemCounts: { rows: 0, media: 1 },
          })
        }
        markAssetDeleted(assetId, batchId)
        touchedBatches.add(batchId)
      }
    }

    for (const batchId of touchedBatches) {
      refreshBatchMediaCount(batchId)
    }
  })
}

export function markSheetDeleted(sheetId: string): string {
  const sheet = getSheetContext(sheetId)
  if (!sheet) throw new Error('表不存在')
  if (sheet.kind !== 'beat') throw new Error('只有节拍表可以删除')
  if (sheet.deleted_at) {
    if (sheet.deletion_batch_id) return sheet.deletion_batch_id
    throw new Error('表已删除但缺少删除批次')
  }

  const batchId = uuidv7()
  const now = nowIso()
  let rowCount = 0
  const docRow = db
    .prepare('SELECT state FROM sheet_docs WHERE sheet_id = ?')
    .get(sheetId) as { state: Uint8Array } | undefined
  if (docRow?.state) {
    const doc = new Y.Doc()
    try {
      Y.applyUpdate(doc, new Uint8Array(docRow.state))
      const rows = doc.getMap('rows') as Y.Map<any>
      rows.forEach((row) => {
        if (row instanceof Y.Map && row.get('deleted') !== true) rowCount += 1
      })
    } catch {
      rowCount = 0
    } finally {
      doc.destroy()
    }
  }

  transaction(() => {
    ensureBatch(batchId, sheet.project_id, 'sheet', {
      sheetId,
      sheetName: sheet.name,
      episodeId: sheet.episode_id,
      episodeNumber: sheet.episode_number,
      episodeTitle: sheet.episode_title,
      itemCounts: { rows: rowCount, media: 0 },
    })

    if (sheet.episode_id) {
      db.prepare(
        `UPDATE episodes
         SET deleted_at = ?, deletion_batch_id = ?, updated_at = ?
         WHERE id = ?`,
      ).run(now, batchId, now, sheet.episode_id)
    }
    db.prepare(
      `UPDATE sheets
       SET deleted_at = ?, deletion_batch_id = ?, updated_at = ?
       WHERE id = ?`,
    ).run(now, batchId, now, sheetId)

    const links = db
      .prepare('SELECT * FROM media_links WHERE sheet_id = ? AND deleted_at IS NULL')
      .all(sheetId) as any[]

    for (const link of links) {
      db.prepare(
        `UPDATE media_links
         SET deleted_at = ?, deletion_batch_id = ?, updated_at = ?
         WHERE id = ?`,
      ).run(now, batchId, now, link.id)
      if (countActiveLinks(link.asset_id) === 0) {
        db.prepare(
          `UPDATE media_assets
           SET deleted_at = ?, deletion_batch_id = ?, updated_at = ?
           WHERE id = ? AND deleted_at IS NULL`,
        ).run(now, batchId, now, link.asset_id)
      }
    }

    updateBatchMeta(batchId, {
      links: links.map((link) => ({
        linkId: link.id,
        assetId: link.asset_id,
        sheetId: link.sheet_id,
        rowId: link.row_id,
        columnId: link.column_id,
        role: link.role,
      })),
    })
    refreshBatchMediaCount(batchId)
  })

  return batchId
}
