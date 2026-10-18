import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import * as Y from 'yjs'

const db = new DatabaseSync(path.resolve('data/app.db'))
const uploadsRoot = path.resolve('data/uploads')

function safeFolderName(value) {
  const cleaned = String(value ?? '')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .trim()
  return cleaned || '未命名'
}

function absolutePath(key) {
  return path.join(uploadsRoot, ...key.split('/'))
}

function loadDoc(sheetId) {
  const row = db
    .prepare('SELECT state FROM sheet_docs WHERE sheet_id = ?')
    .get(sheetId)
  if (!row?.state) return null
  const doc = new Y.Doc()
  Y.applyUpdate(doc, new Uint8Array(row.state))
  return doc
}

function rowAt(doc, rowId) {
  const rows = doc.getMap('rows')
  const entries = []
  rows.forEach((row, id) => {
    if (row instanceof Y.Map && row.get('deleted') !== true) {
      entries.push({ id, row })
    }
  })
  entries.sort((a, b) => {
    const ap = String(a.row.get('position') ?? '')
    const bp = String(b.row.get('position') ?? '')
    if (ap < bp) return -1
    if (ap > bp) return 1
    return a.id.localeCompare(b.id)
  })
  const index = entries.findIndex((entry) => entry.id === rowId)
  if (index < 0) return null
  return { row: entries[index].row, index }
}

function folderForAsset(asset) {
  const links = db
    .prepare(
      `SELECT * FROM media_links
       WHERE asset_id = ? AND deleted_at IS NULL
       ORDER BY created_at, id`,
    )
    .all(asset.id)

  for (const link of links) {
    const sheet = db
      .prepare(
        `SELECT s.kind, s.episode_id, e.number AS episode_number
         FROM sheets s LEFT JOIN episodes e ON e.id = s.episode_id
         WHERE s.id = ?`,
      )
      .get(link.sheet_id)
    if (!sheet) continue
    const doc = loadDoc(link.sheet_id)
    if (!doc) continue
    const found = rowAt(doc, link.row_id)
    if (!found) {
      doc.destroy()
      continue
    }

    if (link.role === 'video' && sheet.kind === 'beat') {
      const episode = `第${sheet.episode_number ?? '?'}集`
      const beat = `第${found.index + 1}拍`
      doc.destroy()
      return `节拍表/${episode}/${beat}`
    }

    if (
      (link.role === 'selected' || link.role === 'alternate') &&
      sheet.kind === 'asset'
    ) {
      const cells = found.row.get('cells')
      const category = safeFolderName(
        cells instanceof Y.Map ? cells.get('asset.category') : '',
      )
      const name = safeFolderName(
        cells instanceof Y.Map ? cells.get('asset.name') : '',
      )
      doc.destroy()
      return `资产表/${category}/${name}`
    }
    doc.destroy()
  }

  return '文件库'
}

const assets = db
  .prepare(
    `SELECT * FROM media_assets
     WHERE deleted_at IS NULL
       AND storage_key LIKE 'projects/%/media/%'`,
  )
  .all()

console.log('legacy assets:', assets.length)

for (const asset of assets) {
  const oldKey = asset.storage_key
  const filename = path.basename(oldKey)
  const folder = folderForAsset(asset)
  const baseDir = `projects/${asset.project_id}/${folder}`
  let newKey = `${baseDir}/${filename}`

  if (newKey === oldKey) continue
  if (fs.existsSync(absolutePath(newKey))) {
    const extension = path.extname(filename)
    const stem = path.basename(filename, extension)
    newKey = `${baseDir}/${stem}-${asset.id.slice(0, 8)}${extension}`
  }

  const oldAbs = absolutePath(oldKey)
  const newAbs = absolutePath(newKey)
  if (!fs.existsSync(oldAbs)) {
    console.log('missing file, skipped:', oldKey)
    continue
  }

  fs.mkdirSync(path.dirname(newAbs), { recursive: true })
  fs.renameSync(oldAbs, newAbs)
  db.prepare(
    'UPDATE media_assets SET storage_key = ?, updated_at = ? WHERE id = ?',
  ).run(newKey, new Date().toISOString(), asset.id)
  console.log(`${asset.display_name}: ${oldKey} -> ${newKey}`)
}

db.close()
console.log('migration complete')
