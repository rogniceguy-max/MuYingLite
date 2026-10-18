import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import * as Y from 'yjs'

const root = path.resolve('.')
const dataDir = path.join(root, 'data')
const uploadsDir = path.join(dataDir, 'uploads')
const db = new DatabaseSync(path.join(dataDir, 'app.db'))

function safeFolderName(value) {
  const cleaned = String(value ?? '')
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/\.+$/, '')
  return cleaned || '未命名'
}

function absoluteForKey(key) {
  return path.join(uploadsDir, ...key.split('/'))
}

function removeEmptyParents(startDir) {
  let current = startDir
  while (current.startsWith(uploadsDir) && current !== uploadsDir) {
    try {
      const entries = fs.readdirSync(current)
      if (entries.length > 0) break
      fs.rmdirSync(current)
      current = path.dirname(current)
    } catch {
      break
    }
  }
}

const assets = db
  .prepare(
    `SELECT id, project_id, storage_key, display_name
     FROM media_assets
     WHERE deleted_at IS NULL
       AND storage_key LIKE 'projects/%/资产表/%'`,
  )
  .all()

let moved = 0
let skipped = 0

for (const asset of assets) {
  if (!asset.storage_key) {
    skipped += 1
    continue
  }
  const parts = asset.storage_key.split('/')
  if (parts.includes('选定') || parts.includes('备选')) {
    continue
  }

  const link = db
    .prepare(
      `SELECT l.sheet_id, l.row_id, l.role
       FROM media_links l
       JOIN sheets s ON s.id = l.sheet_id
       WHERE l.asset_id = ?
         AND l.deleted_at IS NULL
         AND s.kind = 'asset'
         AND s.deleted_at IS NULL
       ORDER BY CASE l.role WHEN 'selected' THEN 0 ELSE 1 END,
                l.created_at
       LIMIT 1`,
    )
    .get(asset.id)

  if (!link || (link.role !== 'selected' && link.role !== 'alternate')) {
    skipped += 1
    continue
  }

  const docRow = db
    .prepare('SELECT state FROM sheet_docs WHERE sheet_id = ?')
    .get(link.sheet_id)
  if (!docRow?.state) {
    skipped += 1
    continue
  }

  const doc = new Y.Doc()
  let category = ''
  let assetName = ''
  try {
    Y.applyUpdate(doc, new Uint8Array(docRow.state))
    const rows = doc.getMap('rows')
    const row = rows.get(link.row_id)
    if (row instanceof Y.Map) {
      const cells = row.get('cells')
      if (cells instanceof Y.Map) {
        category = String(cells.get('asset.category') ?? '').trim()
        assetName = String(cells.get('asset.name') ?? '').trim()
      }
    }
  } finally {
    doc.destroy()
  }

  const categoryFolder = safeFolderName(category || '未分类')
  const nameFolder = safeFolderName(assetName || '未命名')
  const roleFolder = link.role === 'selected' ? '选定' : '备选'
  const filename = path.basename(asset.storage_key)
  const targetBase = `projects/${asset.project_id}/资产表/${categoryFolder}/${nameFolder}/${roleFolder}`
  let targetKey = `${targetBase}/${filename}`
  const oldAbsolute = absoluteForKey(asset.storage_key)
  if (!fs.existsSync(oldAbsolute)) {
    skipped += 1
    continue
  }

  let targetAbsolute = absoluteForKey(targetKey)
  if (fs.existsSync(targetAbsolute)) {
    const extension = path.extname(filename)
    const stem = path.basename(filename, extension)
    targetKey = `${targetBase}/${stem}-${asset.id.slice(0, 8)}${extension}`
    targetAbsolute = absoluteForKey(targetKey)
  }

  fs.mkdirSync(path.dirname(targetAbsolute), { recursive: true })
  fs.renameSync(oldAbsolute, targetAbsolute)
  db.prepare(
    'UPDATE media_assets SET storage_key = ?, updated_at = ? WHERE id = ?',
  ).run(targetKey, new Date().toISOString(), asset.id)

  removeEmptyParents(path.dirname(oldAbsolute))
  moved += 1
  console.log(`${asset.display_name}: ${asset.storage_key} -> ${targetKey}`)
}

db.close()
console.log(`moved ${moved}, skipped ${skipped}`)
