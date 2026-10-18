import fs from 'node:fs'
import path from 'node:path'
import { v7 as uuidv7 } from 'uuid'
import { chromium } from 'playwright-core'

const base = 'http://localhost:3001'
const projectId = '01a14e37-8548-75b4-bcf6-010dd9763341'
const beatSample = path.resolve('data/samples/flower.mp4')
const beatUnique = path.resolve('data/samples/beat-path-test.mp4')
const assetSample = path.resolve('data/samples/concept-warehouse.png')
const assetUnique = path.resolve('data/samples/asset-path-test.png')
fs.copyFileSync(beatSample, beatUnique)
fs.copyFileSync(assetSample, assetUnique)

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
page.on('console', (message) => {
  if (message.type() === 'error') console.log('CONSOLE ERROR:', message.text())
})
page.on('pageerror', (error) => console.log('PAGE ERROR:', error.message))

async function wait(ms) {
  await page.waitForTimeout(ms)
}

await page.goto(base + '/', { waitUntil: 'networkidle' })
await page.locator('.project-card').first().click()
await page.waitForSelector('.sheet-table', { timeout: 15000 })
await wait(900)

// Upload a video from beat row 3 (beat 03).
const beatRow = page.locator('.sheet-row').nth(2)
await beatRow.locator('.add-media-button').click()
const picker = page.getByRole('dialog')
await picker.waitFor({ state: 'visible' })
await picker.locator('input[type=file]').setInputFiles(beatUnique)
await wait(2200)
const expectedBeatPath = path.resolve(
  'data/uploads/projects',
  projectId,
  '节拍表',
  '第1集',
  '第3拍',
  'beat-path-test.mp4',
)
console.log('beat path exists:', fs.existsSync(expectedBeatPath), expectedBeatPath)

// Remove the uploaded video from the row so it becomes orphaned.
const videoCard = beatRow.locator('.video-card').last()
await videoCard.hover()
await videoCard.locator('.media-item-actions button.danger').click()
await wait(2200)

// Upload an image through the API with asset-table context.
const assetId = uuidv7()
const form = new FormData()
form.append('file', new Blob([fs.readFileSync(assetUnique)]), 'asset-path-test.png')
const uploadResponse = await fetch(
  `${base}/api/projects/${projectId}/media?kind=image&assetId=${assetId}&columnId=asset.selected&category=${encodeURIComponent('测试类别')}&assetName=${encodeURIComponent('测试资产')}`,
  { method: 'POST', body: form },
)
const uploadJson = await uploadResponse.json()
console.log('asset upload status:', uploadResponse.status)
const expectedAssetPath = path.resolve(
  'data/uploads/projects',
  projectId,
  '资产表',
  '测试类别',
  '测试资产',
  'asset-path-test.png',
)
console.log(
  'asset path exists:',
  fs.existsSync(expectedAssetPath),
  expectedAssetPath,
)

// Clean up the orphaned video: find the media batch and purge it.
const recycle = await fetch(`${base}/api/projects/${projectId}/recycle-bin`).then(
  (response) => response.json(),
)
const videoBatch = recycle.batches.find((batch) =>
  batch.media.some((media) => media.displayName === 'beat-path-test.mp4'),
)
if (videoBatch) {
  await fetch(
    `${base}/api/projects/${projectId}/recycle-bin/${videoBatch.id}`,
    {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm: 'DELETE' }),
    },
  )
  console.log('purged orphaned beat video')
}

// Clean up the test image.
await fetch(`${base}/api/media/${assetId}`, { method: 'DELETE' })
await wait(500)
const recycleAfterImage = await fetch(
  `${base}/api/projects/${projectId}/recycle-bin`,
).then((response) => response.json())
const imageBatch = recycleAfterImage.batches.find((batch) =>
  batch.media.some((media) => media.displayName === 'asset-path-test.png'),
)
if (imageBatch) {
  await fetch(
    `${base}/api/projects/${projectId}/recycle-bin/${imageBatch.id}`,
    {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm: 'DELETE' }),
    },
  )
  console.log('purged test image')
}

fs.rmSync(beatUnique, { force: true })
fs.rmSync(assetUnique, { force: true })
await browser.close()
