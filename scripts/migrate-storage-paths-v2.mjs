import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const db = new DatabaseSync(path.resolve('data/app.db'))
const uploadsRoot = path.resolve('data/uploads')

function absolutePath(key) {
  return path.join(uploadsRoot, ...key.split('/'))
}

const assets = db
  .prepare(
    `SELECT * FROM media_assets
     WHERE deleted_at IS NULL
       AND (storage_key LIKE 'projects/%/节拍表/%'
         OR storage_key LIKE 'projects/%/资产表/%/%/%')`,
  )
  .all()

console.log('assets to migrate:', assets.length)

for (const asset of assets) {
  const parts = asset.storage_key.split('/')
  let nextParts = parts

  if (parts[2] === '节拍表') {
    nextParts = [parts[0], parts[1], ...parts.slice(3)]
  } else if (parts[2] === '资产表' && parts.length >= 5) {
    // projects/{projectId}/资产表/{category}/{assetName}/{filename...}
    nextParts = [...parts.slice(0, 4), ...parts.slice(5)]
  }

  let newKey = nextParts.join('/')
  if (newKey === asset.storage_key) continue

  const baseDir = path.posix.dirname(newKey)
  const filename = path.posix.basename(newKey)
  if (fs.existsSync(absolutePath(newKey))) {
    const extension = path.posix.extname(filename)
    const stem = path.posix.basename(filename, extension)
    newKey = `${baseDir}/${stem}-${asset.id.slice(0, 8)}${extension}`
  }

  const oldAbs = absolutePath(asset.storage_key)
  const newAbs = absolutePath(newKey)
  if (!fs.existsSync(oldAbs)) {
    console.log('missing file, skipped:', asset.storage_key)
    continue
  }

  fs.mkdirSync(path.dirname(newAbs), { recursive: true })
  fs.renameSync(oldAbs, newAbs)
  db.prepare(
    'UPDATE media_assets SET storage_key = ?, updated_at = ? WHERE id = ?',
  ).run(newKey, new Date().toISOString(), asset.id)
  console.log(`${asset.display_name}: ${asset.storage_key} -> ${newKey}`)
}

db.close()
console.log('migration v2 complete')
