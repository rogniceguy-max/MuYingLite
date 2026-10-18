import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'

const base = 'http://localhost:3001'
const projectId = '01a14e37-8548-75b4-bcf6-010dd9763341'
const imageBuffer = fs.readFileSync(
  path.resolve('data/samples/concept-warehouse.png'),
)
const selectedName = 'asset-selected-test.png'
const alternateName = 'asset-alternate-test.png'

const browser = await chromium.launch({
  executablePath:
    process.env.BROWSER_PATH ||
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: true,
})
const page = await browser.newPage({
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 1,
})
const errors = []
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text())
})
page.on('pageerror', (error) => errors.push(error.message))
const wait = (ms) => page.waitForTimeout(ms)

async function openFileLibrary() {
  await page.locator('.sidebar').getByRole('button', { name: '文件库' }).click()
  await page.waitForSelector('.file-grid', { timeout: 15000 })
  await wait(700)
}

async function enterFolder(name) {
  const folder = page
    .locator('.file-card.folder-card')
    .filter({ hasText: name })
    .first()
  await folder.waitFor({ state: 'visible', timeout: 10000 })
  await folder.dblclick()
  await wait(500)
}

async function findTempRow() {
  const rows = page.locator('.sheet-row')
  const count = await rows.count()
  for (let index = 0; index < count; index += 1) {
    const row = rows.nth(index)
    const values = await row
      .locator('input')
      .evaluateAll((list) => list.map((input) => input.value))
    if (values.includes('测试') || values.includes('自动挂表')) {
      return row
    }
  }
  return null
}

async function waitForSnackbar(pattern) {
  const snackbar = page.locator('.MuiSnackbar-root')
  await snackbar.waitFor({ state: 'visible', timeout: 15000 })
  const text = await snackbar.innerText()
  console.log('toast:', text)
  assert.match(text, pattern)
}

async function cleanup() {
  const recycle = await fetch(
    `${base}/api/projects/${projectId}/recycle-bin`,
  ).then((response) => response.json())
  const batches = recycle.batches.filter(
    (batch) =>
      String(batch.metadata?.rowSummary ?? '').includes('自动挂表') ||
      batch.media.some((media) =>
        [selectedName, alternateName].includes(media.displayName),
      ),
  )
  for (const batch of batches) {
    await fetch(
      `${base}/api/projects/${projectId}/recycle-bin/${batch.id}`,
      {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: 'DELETE' }),
      },
    )
  }
  return batches.length
}

await page.goto(base + '/', { waitUntil: 'networkidle' })
await page.locator('.project-card').first().click()
await page.waitForSelector('.sheet-table', { timeout: 15000 })
await wait(800)
await page.locator('.asset-nav').click()
await page.waitForSelector('.asset-table', { timeout: 15000 })
await wait(700)

await page.locator('.table-add-row').click()
await wait(700)
let tempRow = page.locator('.sheet-row').last()
await tempRow.locator('.cell-asset-category input').fill('测试')
await tempRow.locator('.cell-asset-name input').fill('自动挂表')
await wait(2000)

// Virtual folders: both 选定 and 备选 should exist for the row.
await openFileLibrary()
await enterFolder('资产表')
console.log(
  'asset categories:',
  await page.locator('.file-card.folder-card').allInnerTexts(),
)
await enterFolder('测试')
await enterFolder('自动挂表')
const roleFolders = await page
  .locator('.file-card.folder-card')
  .allInnerTexts()
console.log('role folders:', roleFolders)
assert.ok(roleFolders.some((text) => text.includes('选定')))
assert.ok(roleFolders.some((text) => text.includes('备选')))
await page.screenshot({
  path: 'screenshots/70-asset-role-folders.png',
  fullPage: false,
})

await enterFolder('选定')
assert.equal(
  await page.locator('.page-header-actions button').first().innerText(),
  '上传图片',
)
await page.locator('input[type="file"]').setInputFiles({
  name: selectedName,
  mimeType: 'image/png',
  buffer: imageBuffer,
})
await waitForSnackbar(/已添加到资产表 \/ 测试 \/ 自动挂表 \/ 选定/)
await page.waitForFunction(
  (name) => document.body.innerText.includes(name),
  selectedName,
  { timeout: 15000 },
)

// Verify selected on the temp row.
await page.locator('.asset-nav').click()
await page.waitForSelector('.asset-table', { timeout: 15000 })
await wait(800)
tempRow = await findTempRow()
assert.ok(tempRow)
const selectedAlt = await tempRow
  .locator('.selected-thumb img')
  .getAttribute('alt')
console.log('selected after folder upload:', selectedAlt)
assert.equal(selectedAlt, selectedName)

// Upload to 备选 folder and verify alternate.
await openFileLibrary()
await enterFolder('资产表')
await enterFolder('测试')
await enterFolder('自动挂表')
await enterFolder('备选')
await page.locator('input[type="file"]').setInputFiles({
  name: alternateName,
  mimeType: 'image/png',
  buffer: imageBuffer,
})
await waitForSnackbar(/已添加到资产表 \/ 测试 \/ 自动挂表 \/ 备选/)
await page.waitForFunction(
  (name) => document.body.innerText.includes(name),
  alternateName,
  { timeout: 15000 },
)

await page.locator('.asset-nav').click()
await page.waitForSelector('.asset-table', { timeout: 15000 })
await wait(800)
tempRow = await findTempRow()
assert.ok(tempRow)
const finalSelected = await tempRow
  .locator('.selected-thumb img')
  .getAttribute('alt')
const alternateAlts = await tempRow
  .locator('.alternate-thumb img')
  .evaluateAll((list) => list.map((img) => img.getAttribute('alt')))
console.log({ finalSelected, alternateAlts })
assert.equal(finalSelected, selectedName)
assert.ok(alternateAlts.includes(alternateName))
await page.screenshot({
  path: 'screenshots/71-asset-autolink-row.png',
  fullPage: false,
})

// Remove the temporary row and purge its test media.
await tempRow.locator('.drag-handle').click({ button: 'right' })
await wait(300)
await page.getByRole('menuitem', { name: '删除行' }).click()
const dialog = page.getByRole('dialog')
await dialog.waitFor({ state: 'visible' })
await dialog.getByRole('button', { name: '删除', exact: true }).click()
await wait(2000)
const purged = await cleanup()
console.log('purged test batches:', purged)
assert.ok(purged > 0)

const media = await fetch(
  `${base}/api/projects/${projectId}/media?limit=500`,
).then((response) => response.json())
assert.equal(
  media.items.some((item) =>
    [selectedName, alternateName].includes(item.displayName),
  ),
  false,
)

console.log('errors:', errors.slice(0, 10))
assert.equal(errors.length, 0)
await browser.close()
