import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'

const sample = path.resolve('data/samples/concept-warehouse.png')
const uniqueSample = path.resolve('data/samples/delete-test.png')
fs.copyFileSync(sample, uniqueSample)

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

await page.goto('http://localhost:3001/', { waitUntil: 'networkidle' })
await page.locator('.project-card').first().click()
await page.waitForSelector('.sheet-table', { timeout: 15000 })
await page.getByRole('button', { name: /文件库/ }).first().click()
await page.waitForSelector('.media-grid', { timeout: 15000 })
await wait(900)

// In-use protection dialog.
const inUseCard = page
  .locator('.media-card')
  .filter({ hasText: 'concept-harbor.png' })
  .first()
await inUseCard.hover()
await inUseCard.locator('.media-card-delete').click()
const inUseDialog = page.getByRole('dialog')
await inUseDialog.waitFor({ state: 'visible' })
const inUseText = await inUseDialog.innerText()
console.log('in-use dialog:', inUseText.slice(0, 500))
assert.match(inUseText, /媒体仍在使用/)
assert.match(inUseText, /仍要删除/)
await page.screenshot({
  path: 'screenshots/13-media-in-use.png',
  fullPage: false,
})
await inUseDialog.getByRole('button', { name: '取消' }).click()
await wait(400)

// Upload an unused file, delete it, restore it, delete it again, purge it.
await page.locator('input[type=file]').first().setInputFiles(uniqueSample)
await wait(2200)
const newCard = page
  .locator('.media-card')
  .filter({ hasText: 'delete-test.png' })
  .first()
assert.equal(await newCard.count(), 1)
console.log('uploaded unused file')

await newCard.hover()
await newCard.locator('.media-card-delete').click()
await wait(1200)
assert.equal(
  await page.locator('.media-card').filter({ hasText: 'delete-test.png' }).count(),
  0,
)
console.log('deleted unused file')

await page.getByRole('button', { name: /回收站/ }).first().click()
await page.waitForSelector('.recycle-card', { timeout: 15000 })
await wait(800)
const mediaBatch = page
  .locator('.recycle-card')
  .filter({ hasText: 'delete-test.png' })
  .first()
assert.equal(await mediaBatch.count(), 1)
console.log('media batch found')
await mediaBatch
  .locator('.recycle-actions button')
  .filter({ hasText: '恢复' })
  .click()
await wait(1500)

await page.getByRole('button', { name: /文件库/ }).first().click()
await page.waitForSelector('.media-grid', { timeout: 15000 })
await wait(900)
const restoredCard = page
  .locator('.media-card')
  .filter({ hasText: 'delete-test.png' })
  .first()
assert.equal(await restoredCard.count(), 1)
console.log('media batch restored to library')

await restoredCard.hover()
await restoredCard.locator('.media-card-delete').click()
await wait(1200)
await page.getByRole('button', { name: /回收站/ }).first().click()
await page.waitForSelector('.recycle-card', { timeout: 15000 })
await wait(800)
const purgeBatch = page
  .locator('.recycle-card')
  .filter({ hasText: 'delete-test.png' })
  .first()
await purgeBatch
  .locator('.recycle-actions button')
  .filter({ hasText: '彻底删除' })
  .click()
const purgeDialog = page.getByRole('dialog')
await purgeDialog.getByRole('button', { name: '彻底删除' }).click()
await wait(1600)
console.log(
  'delete-test cards after purge:',
  await page.locator('.media-card').filter({ hasText: 'delete-test.png' }).count(),
)
console.log('media delete lifecycle passed')
await browser.close()
