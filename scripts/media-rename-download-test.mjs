import assert from 'node:assert/strict'
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

async function openMediaLibrary() {
  await page.goto('http://localhost:3001/', { waitUntil: 'networkidle' })
  await page.locator('.project-card').first().click()
  await page.waitForSelector('.sheet-table', { timeout: 15000 })
  await page.getByRole('button', { name: /文件库/ }).first().click()
  await page.waitForSelector('.media-grid', { timeout: 15000 })
  await wait(900)
}

await openMediaLibrary()

const originalCard = page
  .locator('.media-card')
  .filter({ hasText: 'flower.mp4' })
  .first()
await originalCard.click({ button: 'right' })
await page.getByRole('menuitem', { name: '重命名' }).click()
const dialog = page.getByRole('dialog')
await dialog.getByLabel('文件名').fill('flower-renamed.mp4')
await dialog.getByRole('button', { name: '保存' }).click()
await wait(1400)
const renamedCard = page
  .locator('.media-card')
  .filter({ hasText: 'flower-renamed.mp4' })
  .first()
assert.equal(await renamedCard.count(), 1)
console.log('rename passed')

await renamedCard.click({ button: 'right' })
const downloadPromise = page.waitForEvent('download', { timeout: 15000 })
await page.getByRole('menuitem', { name: '下载' }).click()
const download = await downloadPromise
console.log('download filename:', download.suggestedFilename())
assert.match(download.suggestedFilename(), /flower-renamed\.mp4/)
await download.delete()
console.log('download passed')

await renamedCard.click({ button: 'right' })
await page.getByRole('menuitem', { name: '重命名' }).click()
const dialog2 = page.getByRole('dialog')
await dialog2.getByLabel('文件名').fill('flower.mp4')
await dialog2.getByRole('button', { name: '保存' }).click()
await wait(1400)
assert.equal(
  await page.locator('.media-card').filter({ hasText: 'flower.mp4' }).count(),
  2,
)
console.log('rename back passed')
await browser.close()
