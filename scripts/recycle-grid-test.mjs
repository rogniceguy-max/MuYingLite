import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'

const base = 'http://localhost:3001'
const projectId = '01a14e37-8548-75b4-bcf6-010dd9763341'
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

async function openProject() {
  await page.goto(base + '/', { waitUntil: 'networkidle' })
  await page.locator('.project-card').first().click()
  await page.waitForSelector('.sheet-table', { timeout: 15000 })
  await wait(800)
}

async function openAssetSheet() {
  await page.locator('.asset-nav').click()
  await page.waitForSelector('.asset-table', { timeout: 15000 })
  await wait(700)
}

async function openRecycleBin() {
  await page.locator('.sidebar').getByRole('button', { name: '回收站' }).click()
  await page.waitForURL(/\/recycle-bin$/, { timeout: 15000 })
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForSelector('.recycle-batch-card', { timeout: 15000 })
  await wait(700)
}

async function createTemporaryRow() {
  await page.locator('.table-add-row').click()
  await wait(700)
  const row = page.locator('.sheet-row').last()
  await row.locator('.cell-asset-category input').fill('临时')
  await row.locator('.cell-asset-name input').fill('回收测试')
  await wait(400)
  return row
}

async function deleteRow(row) {
  await row.locator('.drag-handle').click({ button: 'right' })
  await wait(300)
  await page.getByRole('menuitem', { name: '删除行' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.waitFor({ state: 'visible' })
  await dialog.getByRole('button', { name: '删除', exact: true }).click()
  await wait(1600)
}

await openProject()
await openAssetSheet()
const tempRow = await createTemporaryRow()
console.log('temp row inputs:', await tempRow.locator('input').evaluateAll((list) => list.map((input) => input.value)))
await deleteRow(tempRow)

await openRecycleBin()
const tempCard = page
  .locator('.recycle-batch-card')
  .filter({ hasText: '回收测试' })
  .first()
const beforeRestore = await page.locator('.recycle-batch-card').count()
console.log('cards before restore:', beforeRestore, 'temp card:', await tempCard.count())
assert.equal(await tempCard.count(), 1)
await page.screenshot({
  path: 'screenshots/58-recycle-grid-two-cards.png',
  fullPage: false,
})

// Restore through the right-click menu.
await tempCard.click({ button: 'right' })
await wait(350)
const menuItems = await page
  .locator('.MuiMenu-paper:visible [role="menuitem"]')
  .allInnerTexts()
console.log('recycle menu:', menuItems)
assert.deepEqual(menuItems, ['恢复', '彻底删除'])
await page.getByRole('menuitem', { name: '恢复' }).click()
await wait(1600)
console.log('cards after restore:', await page.locator('.recycle-batch-card').count())

// The row is back in the asset sheet.
await openAssetSheet()
const restoredRows = page.locator('.sheet-row')
const restoredCount = await restoredRows.count()
let restoredRow = null
for (let index = 0; index < restoredCount; index += 1) {
  const row = restoredRows.nth(index)
  const values = await row
    .locator('input')
    .evaluateAll((list) => list.map((input) => input.value))
  if (values.includes('临时') || values.includes('回收测试')) {
    restoredRow = row
    console.log('restored row index:', index, values)
    break
  }
}
console.log('row count after restore:', restoredCount)
assert.ok(restoredRow)

// Delete it again, then purge through the recycle-bin context menu.
await deleteRow(restoredRow)
await openRecycleBin()
const purgedCard = page
  .locator('.recycle-batch-card')
  .filter({ hasText: '回收测试' })
  .first()
assert.equal(await purgedCard.count(), 1)
await purgedCard.click({ button: 'right' })
await wait(300)
await page.getByRole('menuitem', { name: '彻底删除' }).click()
const purgeDialog = page.getByRole('dialog')
await purgeDialog.waitFor({ state: 'visible' })
await purgeDialog.getByLabel('输入 DELETE 确认').fill('DELETE')
await purgeDialog
  .getByRole('button', { name: '彻底删除', exact: true })
  .click()
await wait(1800)
console.log('cards after purge:', await page.locator('.recycle-batch-card').count())
const recycle = await fetch(
  `${base}/api/projects/${projectId}/recycle-bin`,
).then((response) => response.json())
console.log(
  'remaining batches:',
  recycle.batches.map((batch) => ({
    kind: batch.kind,
    row: batch.metadata?.rowSummary,
    media: batch.media.map((media) => media.displayName),
  })),
)
assert.equal(
  recycle.batches.some((batch) =>
    String(batch.metadata?.rowSummary ?? '').includes('回收测试'),
  ),
  false,
)

console.log('errors:', errors.slice(0, 10))
assert.equal(errors.length, 0)
await browser.close()
