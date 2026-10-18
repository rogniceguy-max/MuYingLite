import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'

const base = 'http://localhost:3001'
const projectId = '01a14e37-8548-75b4-bcf6-010dd9763341'
const imageBase64 = fs
  .readFileSync(path.resolve('data/samples/concept-warehouse.png'))
  .toString('base64')

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

async function findRowIndexByInput(value) {
  return page.evaluate((needle) => {
    return [...document.querySelectorAll('.sheet-row')].findIndex((row) =>
      [...row.querySelectorAll('input')].some(
        (input) => input.value === needle,
      ),
    )
  }, value)
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
await tempRow.locator('.cell-asset-category input').fill('备选测试')
await tempRow.locator('.cell-asset-name input').fill('11张')
await wait(400)
const emptyRowHeight = (await tempRow.boundingBox()).height

// Drop 11 image files at once; the row drop handler uploads them to alternates.
await tempRow.evaluate(
  (row, { base64 }) => {
    const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))
    const dataTransfer = new DataTransfer()
    for (let index = 1; index <= 11; index += 1) {
      dataTransfer.items.add(
        new File([bytes], `alt-test-${String(index).padStart(2, '0')}.png`, {
          type: 'image/png',
        }),
      )
    }
    const options = {
      bubbles: true,
      cancelable: true,
      dataTransfer,
    }
    row.dispatchEvent(new DragEvent('dragover', options))
    row.dispatchEvent(new DragEvent('drop', options))
  },
  { base64: imageBase64 },
)

await page.waitForFunction(
  () => {
    const row = [...document.querySelectorAll('.sheet-row')].find((candidate) =>
      [...candidate.querySelectorAll('input')].some(
        (input) => input.value === '11张',
      ),
    )
    return row && row.querySelectorAll('.alternate-thumb').length >= 11
  },
  null,
  { timeout: 60000 },
)
await wait(700)

const rowIndex = await findRowIndexByInput('11张')
tempRow = page.locator('.sheet-row').nth(rowIndex)
const alternateCount = await tempRow.locator('.alternate-thumb').count()
const filledRowHeight = (await tempRow.boundingBox()).height
const cellLayout = await tempRow.locator('.alternates-cell').evaluate((cell) => {
  const rect = cell.getBoundingClientRect()
  return { width: rect.width, height: rect.height }
})
console.log({ alternateCount, emptyRowHeight, filledRowHeight, cellLayout })
assert.equal(alternateCount, 11)
assert.ok(filledRowHeight > emptyRowHeight)

await tempRow.scrollIntoViewIfNeeded()
await wait(300)
await page.screenshot({
  path: 'screenshots/56-asset-row-11-alternates.png',
  fullPage: false,
})
await tempRow.locator('.alternates-cell').screenshot({
  path: 'screenshots/57-alternates-cell-11.png',
})

// Clean up: delete the temporary row and purge all of its test media.
await tempRow.locator('.drag-handle').click({ button: 'right' })
await wait(300)
await page.getByRole('menuitem', { name: '删除行' }).click()
const dialog = page.getByRole('dialog')
await dialog.waitFor({ state: 'visible' })
await dialog.getByRole('button', { name: '删除', exact: true }).click()
await wait(2200)

const recycle = await fetch(
  `${base}/api/projects/${projectId}/recycle-bin`,
).then((response) => response.json())
const testBatches = recycle.batches.filter(
  (batch) =>
    String(batch.metadata?.rowSummary ?? '').includes('备选测试') ||
    batch.media.some((media) => media.displayName.startsWith('alt-test-')),
)
console.log(
  'test batches:',
  testBatches.map((batch) => ({
    id: batch.id,
    kind: batch.kind,
    row: batch.metadata?.rowSummary,
    media: batch.media.length,
  })),
)
for (const batch of testBatches) {
  await fetch(
    `${base}/api/projects/${projectId}/recycle-bin/${batch.id}`,
    {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm: 'DELETE' }),
    },
  )
}
await wait(500)
const leftover = await fetch(
  `${base}/api/projects/${projectId}/recycle-bin`,
).then((response) => response.json())
console.log(
  'remaining batches:',
  leftover.batches.map((batch) => ({
    kind: batch.kind,
    row: batch.metadata?.rowSummary,
    media: batch.media.map((media) => media.displayName),
  })),
)
console.log('errors:', errors.slice(0, 10))
assert.equal(errors.length, 0)
await browser.close()
