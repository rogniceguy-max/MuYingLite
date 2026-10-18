import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'

const base = 'http://localhost:3001'
const projectId = '01a14e37-8548-75b4-bcf6-010dd9763341'
const stamp = Date.now()
const names = [`drag-test-a-${stamp}.mp4`, `drag-test-b-${stamp}.mp4`]

const browser = await chromium.launch({
  executablePath:
    process.env.BROWSER_PATH ||
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: true,
})
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
await page.addInitScript(() => localStorage.setItem('frame-theme', 'dark'))
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text())
})

async function cleanup() {
  const media = await fetch(
    `${base}/api/projects/${projectId}/media?limit=500&q=${encodeURIComponent('drag-test-')}`,
  ).then((response) => response.json())
  for (const item of media.items) {
    if (!item.displayName.startsWith('drag-test-')) continue
    const deleted = await fetch(`${base}/api/media/${item.id}?force=true`, {
      method: 'DELETE',
    }).then((response) => response.json())
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
  }
}

try {
  await page.goto(base + '/', { waitUntil: 'networkidle' })
  await page.locator('.project-card').first().click()
  await page.waitForSelector('.sheet-table', { timeout: 15000 })
  await page
    .locator('.sidebar')
    .getByRole('button', { name: '文件库' })
    .click()
  await page.waitForSelector('.file-manager', { timeout: 15000 })
  await page.waitForTimeout(500)

  const dataTransfer = await page.evaluateHandle(() => new DataTransfer())
  await dataTransfer.evaluate((transfer, fileNames) => {
    const bytes = new Uint8Array(1024)
    for (const name of fileNames) {
      transfer.items.add(new File([bytes], name, { type: 'video/mp4' }))
    }
  }, names)

  const target = page.locator('.file-manager')
  await target.dispatchEvent('dragenter', { dataTransfer })
  await target.dispatchEvent('dragover', { dataTransfer })
  await page.waitForSelector('.file-drop-overlay')
  const overlay = await page.locator('.file-drop-overlay').innerText()
  assert.match(overlay, /文件库/)
  assert.match(overlay, /多个文件/)
  await page.screenshot({ path: 'screenshots/115-file-library-drop.png' })

  await target.dispatchEvent('drop', { dataTransfer })
  await page.waitForSelector('.MuiSnackbar-root', { timeout: 20000 })
  const toast = await page.locator('.MuiSnackbar-root').innerText()
  assert.match(toast, /已上传 2 个文件/)
  await page.waitForFunction(
    (fileNames) =>
      fileNames.every((name) => document.body.innerText.includes(name)),
    names,
    { timeout: 15000 },
  )
  assert.equal(await page.locator('.file-drop-overlay').count(), 0)

  const media = await fetch(
    `${base}/api/projects/${projectId}/media?limit=500&q=${encodeURIComponent('drag-test-')}`,
  ).then((response) => response.json())
  const uploaded = media.items.filter((item) => names.includes(item.displayName))
  assert.equal(uploaded.length, 2)
  for (const item of uploaded) {
    assert.equal(item.folderPath, '文件库')
    assert.equal(item.usageCount, 0)
  }
  assert.deepEqual(errors, [])
  console.log('file-library-drop-test passed')
} finally {
  await cleanup()
  await browser.close()
}
