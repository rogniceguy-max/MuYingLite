import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'

const base = 'http://localhost:3001'
const projectId = '01a14e37-8548-75b4-bcf6-010dd9763341'
const videoName = `成片测试-${Date.now()}.mp4`
const videoBuffer = fs.readFileSync(path.resolve('data/samples/flower.mp4'))

const browser = await chromium.launch({
  executablePath:
    process.env.BROWSER_PATH ||
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: true,
})
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
})
await page.addInitScript(() => localStorage.setItem('frame-theme', 'dark'))
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text())
})
const wait = (ms) => page.waitForTimeout(ms)

await page.goto(base + '/', { waitUntil: 'networkidle' })
await page.locator('.project-card').first().click()
await page.waitForSelector('.sheet-table', { timeout: 15000 })
await page
  .locator('.sidebar')
  .getByRole('button', { name: '文件库' })
  .click()
await page.waitForSelector('.file-manager', { timeout: 15000 })
await wait(800)

const deliveryFolder = page.locator('.folder-card').filter({ hasText: '成片' }).first()
assert.equal(await deliveryFolder.count(), 1, '成片 folder should be visible by default')
await deliveryFolder.dblclick()
await wait(500)
const episodeFolder = page
  .locator('.folder-card')
  .filter({ hasText: '第1集' })
  .first()
assert.equal(await episodeFolder.count(), 1, '成片 should contain an episode folder')
await episodeFolder.dblclick()
await wait(500)

const uploadButton = page
  .locator('.file-toolbar')
  .getByRole('button', { name: /上传视频/ })
assert.equal(await uploadButton.count(), 1, '成片 folder should use the video upload button')
await page.screenshot({ path: 'screenshots/113-delivery-folder-empty.png' })

await page.locator('input[type="file"]').first().setInputFiles({
  name: videoName,
  mimeType: 'video/mp4',
  buffer: videoBuffer,
})
await page.waitForSelector('.MuiSnackbar-root', { timeout: 20000 })
const toast = await page.locator('.MuiSnackbar-root').innerText()
console.log('upload toast:', toast)
assert.match(toast, /已上传 1 个视频/)
await page.waitForFunction(
  (name) => document.body.innerText.includes(name),
  videoName,
  { timeout: 15000 },
)
await page.screenshot({ path: 'screenshots/114-delivery-folder-uploaded.png' })

const media = await fetch(
  `${base}/api/projects/${projectId}/media?limit=500&q=${encodeURIComponent(videoName)}`,
).then((response) => response.json())
const uploaded = media.items.find((item) => item.displayName === videoName)
assert.ok(uploaded, 'uploaded delivery media should exist')
assert.equal(uploaded.folderPath, '成片 / 第1集')
assert.equal(uploaded.usageCount, 0, 'delivery video must not auto-link to the beat sheet')
assert.deepEqual(uploaded.linkedRows, [])

const storedPath = path.resolve(
  'data/uploads/projects',
  projectId,
  '成片',
  '第1集',
  videoName,
)
assert.equal(fs.existsSync(storedPath), true, 'delivery file should be stored under 成片/第1集')

// Clean up the test media and its recycle batch.
const deleted = await fetch(
  `${base}/api/media/${uploaded.id}?force=true`,
  { method: 'DELETE' },
).then((response) => response.json())
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
assert.equal(fs.existsSync(storedPath), false, 'test file should be purged')
assert.deepEqual(errors, [])
console.log('delivery-folder-test passed')
await browser.close()
