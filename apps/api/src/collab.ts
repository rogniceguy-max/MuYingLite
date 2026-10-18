import { Server } from '@hocuspocus/server'
import * as Y from 'yjs'
import { db, nowIso } from './db.js'
import { syncSheet } from './projection.js'
import { parseSheetDocumentName, removeAssetLinksFromDoc } from './yjs-utils.js'

let collabServer: Server | null = null

function saveSheetState(sheetId: string, doc: Y.Doc): void {
  const state = Y.encodeStateAsUpdate(doc)
  db.prepare(
    `INSERT INTO sheet_docs (sheet_id, state, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(sheet_id) DO UPDATE SET
       state = excluded.state,
       updated_at = excluded.updated_at`,
  ).run(sheetId, state, nowIso())
}

export async function startCollab(port = 1234): Promise<Server> {
  if (collabServer) return collabServer

  collabServer = new Server({
    port,
    address: '0.0.0.0',
    debounce: 250,
    maxDebounce: 1200,
    quiet: true,
    onLoadDocument: async ({ document, documentName }) => {
      const sheetId = parseSheetDocumentName(documentName)
      if (!sheetId) throw new Error('无效的文档名')
      const row = db
        .prepare('SELECT state FROM sheet_docs WHERE sheet_id = ?')
        .get(sheetId) as { state: Uint8Array } | undefined
      if (row?.state) {
        Y.applyUpdate(document, new Uint8Array(row.state))
      }
      // Project the loaded state once so existing documents are repaired after
      // a previous projection failure or a server restart.
      try {
        syncSheet(document, sheetId)
      } catch (error) {
        console.error('[collab] projection on load failed', sheetId, error)
      }
    },
    onStoreDocument: async ({ document, documentName }) => {
      const sheetId = parseSheetDocumentName(documentName)
      if (!sheetId) return
      try {
        saveSheetState(sheetId, document)
        syncSheet(document, sheetId)
      } catch (error) {
        console.error('[collab] store/projection failed', sheetId, error)
      }
    },
    onAuthenticate: async ({ documentName }) => {
      const sheetId = parseSheetDocumentName(documentName)
      if (!sheetId) throw new Error('无效的文档名')
      const sheet = db
        .prepare('SELECT deleted_at FROM sheets WHERE id = ?')
        .get(sheetId) as { deleted_at: string | null } | undefined
      if (!sheet) throw new Error('表不存在')
      if (sheet.deleted_at) throw new Error('表已删除')
    },
  })

  await collabServer.listen(port)
  projectAllSheets()
  console.log(`[collab] listening on ws://0.0.0.0:${port}`)
  return collabServer
}

function projectAllSheets(): void {
  const rows = db
    .prepare('SELECT sheet_id, state FROM sheet_docs')
    .all() as Array<{ sheet_id: string; state: Uint8Array }>
  for (const row of rows) {
    const doc = new Y.Doc()
    try {
      Y.applyUpdate(doc, new Uint8Array(row.state))
      syncSheet(doc, row.sheet_id)
    } catch (error) {
      console.error('[collab] startup projection failed', row.sheet_id, error)
    } finally {
      doc.destroy()
    }
  }
}

export async function stopCollab(): Promise<void> {
  if (!collabServer) return
  try {
    collabServer.hocuspocus.flushPendingStores()
  } catch {
    // ignore
  }
  await collabServer.destroy()
  collabServer = null
}

export function closeSheetConnections(sheetId: string): void {
  collabServer?.hocuspocus.closeConnections(`sheet:${sheetId}`)
}

export async function withSheetDoc<T>(
  sheetId: string,
  mutate: (doc: Y.Doc) => T,
): Promise<T> {
  if (!collabServer) throw new Error('协同服务未启动')
  const connection = await collabServer.hocuspocus.openDirectConnection(
    `sheet:${sheetId}`,
    {},
  )
  try {
    let result!: T
    await connection.transact((document) => {
      result = mutate(document)
    })
    const document = connection.document
    if (document) {
      saveSheetState(sheetId, document)
      syncSheet(document, sheetId)
    }
    return result
  } finally {
    await connection.disconnect()
  }
}

export async function removeMediaLinksForAsset(assetId: string): Promise<number> {
  const links = db
    .prepare(
      `SELECT DISTINCT sheet_id FROM media_links
       WHERE asset_id = ? AND deleted_at IS NULL`,
    )
    .all(assetId) as Array<{ sheet_id: string }>

  let removed = 0
  for (const link of links) {
    const count = await withSheetDoc(link.sheet_id, (doc) =>
      removeAssetLinksFromDoc(doc, assetId),
    )
    removed += count
  }
  return removed
}
