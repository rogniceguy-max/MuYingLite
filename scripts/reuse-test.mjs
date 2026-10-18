import { chromium } from 'playwright-core'

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

async function mediaUsage() {
  const url = new URL(page.url())
  const projectId = url.pathname.split('/')[2]
  const response = await fetch(
    `http://localhost:3001/api/projects/${projectId}/media?kind=video`,
  )
  const data = await response.json()
  return data.items.map((item) => ({
    name: item.displayName,
    usageCount: item.usageCount,
  }))
}

await page.goto('http://localhost:3001/', { waitUntil: 'networkidle' })
await page.locator('.project-card').first().click()
await page.waitForSelector('.sheet-table', { timeout: 15000 })
await page.waitForTimeout(900)
console.log('usage before:', await mediaUsage())

// Add existing video to beat row 2.
const secondRow = page.locator('.sheet-row').nth(1)
await secondRow.locator('.add-media-button').click()
const picker = page.getByRole('dialog')
await picker.waitFor({ state: 'visible' })
const card = picker.locator('.media-picker-card').filter({ hasText: 'flower.mp4' }).first()
console.log('picker cards:', await picker.locator('.media-picker-card').count())
if ((await card.count()) > 0) {
  await card.click()
  await wait(1200)
}
console.log('row2 videos:', await secondRow.locator('.video-card').count())
console.log('usage after reuse:', await mediaUsage())

// Delete beat row 1, which contains the same video.
const firstRow = page.locator('.sheet-row').nth(0)
await firstRow.hover()
await firstRow.locator('.row-actions-cell button').click({ force: true })
await page.getByRole('dialog').getByRole('button', { name: '删除' }).click()
await wait(2200)
console.log('usage after deleting row1:', await mediaUsage())

const projectId = new URL(page.url()).pathname.split('/')[2]
const recycle = await fetch(
  `http://localhost:3001/api/projects/${projectId}/recycle-bin`,
).then((r) => r.json())
console.log('recycle batches:', JSON.stringify(recycle, null, 1).slice(0, 1800))

const batch = recycle.batches.find((item) => item.kind === 'row')
if (batch) {
  await fetch(
    `http://localhost:3001/api/projects/${projectId}/recycle-bin/${batch.id}/restore`,
    { method: 'POST' },
  )
  await wait(1800)
  console.log('restored row batch')
}
console.log('usage after restore:', await mediaUsage())
await browser.close()
