import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'

const base = 'http://localhost:3001'
const projectId = '01a14e37-8548-75b4-bcf6-010dd9763341'
const videoBuffer = fs.readFileSync(path.resolve('data/samples/flower.mp4'))
const imageBuffer = fs.readFileSync(
  path.resolve('data/samples/concept-warehouse.png'),
)
const videoName = 'beat-upload-test.mp4'
const imageName = 'beat-image-test.png'

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

async function openFileLibraryFolder() {
  await page.locator('.sidebar').getByRole('button', { name: '文件库' }).click()
  await page.waitForSelector('.file-grid', { timeout: 15000 })
  await wait(700)
  await page
    .locator('.file-card.folder-card')
    .filter({ hasText: '第2集' })
    .first()
    .dblclick()
  await wait(500)
  await page
    .locator('.file-card.folder-card')
    .filter({ hasText: '第1拍' })
    .first()
    .dblclick()
  await wait(500)
}

await page.goto(base + '/', { waitUntil: 'networkidle' })
await page.locator('.project-card').first().click()
await page.waitForSelector('.sheet-table', { timeout: 15000 })
await wait(800)
await openFileLibraryFolder()

const uploadButtonLabel = await page
  .locator('.page-header-actions button')
  .first()
  .innerText()
console.log('upload button label:', uploadButtonLabel)
assert.equal(uploadButtonLabel, '上传视频')

const fileInput = page.locator('input[type="file"]')
await fileInput.setInputFiles({
  name: videoName,
  mimeType: 'video/mp4',
  buffer: videoBuffer,
})
const snackbar = page.locator('.MuiSnackbar-root')
await snackbar.waitFor({ state: 'visible', timeout: 20000 })
const toast = await snackbar.innerText()
console.log('upload toast:', toast)
assert.match(toast, /已上传 1 个视频/)
assert.match(toast, /已添加到第2集第1拍/)
await page.waitForFunction(
  (name) =>
    [...document.querySelectorAll('.file-card:not(.folder-card)')].some(
      (card) => card.textContent?.includes(name),
    ),
  videoName,
  { timeout: 15000 },
)
const uploadedCard = page
  .locator('.file-card:not(.folder-card)')
  .filter({ hasText: videoName })
  .first()
console.log('uploaded file card count:', await uploadedCard.count())
assert.equal(await uploadedCard.count(), 1)
const breadcrumb = await page.locator('.file-breadcrumb').innerText()
console.log('breadcrumb after upload:', breadcrumb)
assert.match(breadcrumb, /第2集/)
assert.match(breadcrumb, /第1拍/)

// The episode 2 beat sheet row 1 now contains the uploaded video.
await page.locator('.nav-episode').filter({ hasText: '第2集' }).first().locator('.episode-main').click()
await page.waitForSelector('.beat-table', { timeout: 15000 })
await wait(900)
const row1VideoText = await page
  .locator('.sheet-row')
  .nth(0)
  .locator('.media-cell')
  .innerText()
console.log('episode 2 row 1 videos:', row1VideoText)
assert.match(row1VideoText, new RegExp(videoName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))

// Back to the beat folder: wrong file type is skipped and not stored.
await openFileLibraryFolder()
await page
  .locator('.MuiSnackbar-root')
  .waitFor({ state: 'hidden', timeout: 5000 })
  .catch(() => {})
await page.locator('input[type="file"]').setInputFiles({
  name: imageName,
  mimeType: 'image/png',
  buffer: imageBuffer,
})
const skipSnackbar = page.locator('.MuiSnackbar-root')
await skipSnackbar.waitFor({ state: 'visible', timeout: 10000 })
const skipToast = await skipSnackbar.innerText()
console.log('wrong-type toast:', skipToast)
assert.match(skipToast, /只支持视频/)
const wrongCard = page
  .locator('.file-card:not(.folder-card)')
  .filter({ hasText: imageName })
  .first()
assert.equal(await wrongCard.count(), 0)

// Clean up the uploaded test media and its recycle batch.
const media = await fetch(
  `${base}/api/projects/${projectId}/media?limit=500&q=${encodeURIComponent(videoName)}`,
).then((response) => response.json())
const asset = media.items.find((item) => item.displayName === videoName)
console.log('test asset:', asset?.id, asset?.usageCount)
assert.ok(asset)
const deleted = await fetch(`${base}/api/media/${asset.id}?force=true`, {
  method: 'DELETE',
}).then((response) => response.json())
console.log('deleted asset batch:', deleted.batchId)
if (deleted.batchId) {
  await fetch(
    `${base}/api/projects/${projectId}/recycle-bin/${deleted.batchId}`,
    {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm: 'DELETE' }),
    },
  )
}
await wait(500)
const recycle = await fetch(
  `${base}/api/projects/${projectId}/recycle-bin`,
).then((response) => response.json())
assert.equal(
  recycle.batches.some((batch) =>
    batch.media.some((mediaItem) => mediaItem.displayName === videoName),
  ),
  false,
)
const uploadedPath = path.resolve(
  'data/uploads/projects',
  projectId,
  '第2集',
  '第1拍',
  videoName,
)
console.log('test file remains:', fs.existsSync(uploadedPath))
assert.equal(fs.existsSync(uploadedPath), false)

console.log('errors:', errors.slice(0, 10))
assert.equal(errors.length, 0)
await browser.close()
