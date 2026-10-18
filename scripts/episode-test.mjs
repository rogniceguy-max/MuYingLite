import path from 'node:path'
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

async function api(pathname, options) {
  const response = await fetch(`http://localhost:3001${pathname}`, options)
  return response.json()
}

await page.goto('http://localhost:3001/', { waitUntil: 'networkidle' })
await page.locator('.project-card').first().click()
await page.waitForSelector('.sheet-table', { timeout: 15000 })
await wait(700)

// Open Episode 2.
await page.locator('.nav-episode').nth(1).locator('.episode-main').click()
await page.waitForSelector('.sheet-table', { timeout: 15000 })
await wait(900)
console.log('episode2 rows:', await page.locator('.sheet-row').count())

// Upload a fresh video into Episode 2 row 1.
const firstRow = page.locator('.sheet-row').nth(0)
await firstRow.locator('.add-media-button').click()
const picker = page.getByRole('dialog')
await picker.waitFor({ state: 'visible' })
await picker
  .locator('input[type=file]')
  .setInputFiles(path.resolve('data/samples/flower.mp4'))
await wait(2200)
console.log('episode2 videos:', await page.locator('.video-card').count())

const projectId = new URL(page.url()).pathname.split('/')[2]
console.log(
  'media before delete:',
  (await api(`/api/projects/${projectId}/media?kind=video`)).items.map(
    (item) => ({ name: item.displayName, usage: item.usageCount }),
  ),
)

// Delete Episode 2.
const episode2 = page.locator('.nav-episode').nth(1)
await episode2.hover()
await episode2.locator('.episode-more').click()
await page.getByRole('menuitem', { name: '删除整集' }).click()
await page.getByRole('dialog').getByRole('button', { name: '删除整集' }).click()
await wait(2500)
console.log('episodes after delete:', await page.locator('.nav-episode').count())

await page.getByRole('button', { name: /回收站/ }).first().click()
await page.waitForSelector('.recycle-card, .library-empty', { timeout: 15000 })
await wait(900)
console.log(
  'recycle:',
  (await page.locator('.recycle-page').innerText()).slice(0, 1400),
)
await page.screenshot({
  path: 'screenshots/10-recycle-episode.png',
  fullPage: false,
})

const sheetBatch = page
  .locator('.recycle-card')
  .filter({ hasText: '整集' })
  .first()
const restore = sheetBatch.locator('.recycle-actions button').filter({
  hasText: '恢复',
})
if ((await restore.count()) > 0) {
  await restore.click()
  await wait(2200)
}
console.log('episodes after restore:', await page.locator('.nav-episode').count())
console.log(
  'media after restore:',
  (await api(`/api/projects/${projectId}/media?kind=video`)).items.map(
    (item) => ({ name: item.displayName, usage: item.usageCount }),
  ),
)

await browser.close()
