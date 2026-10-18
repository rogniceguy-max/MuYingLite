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

async function cleanupTemporaryRow() {
  const recycle = await fetch(
    `${base}/api/projects/${projectId}/recycle-bin`,
  ).then((response) => response.json())
  const batch = recycle.batches.find((item) =>
    String(item.metadata?.rowSummary ?? '').includes('移到备选测试'),
  )
  if (!batch) return null
  await fetch(
    `${base}/api/projects/${projectId}/recycle-bin/${batch.id}`,
    {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm: 'DELETE' }),
    },
  )
  return batch.id
}

await page.goto(base + '/', { waitUntil: 'networkidle' })
await page.locator('.project-card').first().click()
await page.waitForSelector('.sheet-table', { timeout: 15000 })
await wait(700)
await page.locator('.asset-nav').click()
await page.waitForSelector('.asset-table', { timeout: 15000 })
await wait(700)

await page.locator('.table-add-row').click()
await wait(700)
const tempRow = page.locator('.sheet-row').last()
await tempRow.locator('.cell-asset-category input').fill('临时')
await tempRow.locator('.cell-asset-name input').fill('移到备选测试')
await wait(400)

// Add an existing image to alternates.
await tempRow.locator('.alternates-cell').click({ button: 'right' })
await wait(300)
await page.getByRole('menuitem', { name: '从文件库添加' }).click()
const picker = page.getByRole('dialog')
await picker.waitFor({ state: 'visible' })
await wait(500)
await picker
  .locator('.media-picker-card')
  .filter({ hasText: 'concept-harbor.png' })
  .first()
  .click()
await wait(1000)
const beforeAlternates = await tempRow.locator('.alternate-thumb').count()
console.log('alternates before select:', beforeAlternates)
assert.ok(beforeAlternates > 0)

// Pick it as the selected image.
await tempRow
  .locator('.selected-image-cell .image-cell-actions button')
  .click()
const chooser = page.getByRole('dialog')
await chooser.waitFor({ state: 'visible' })
await wait(400)
await chooser.locator('.media-picker-card').first().click()
await wait(1000)
const selectedBefore = await tempRow.locator('.selected-thumb').count()
const alternatesBeforeMove = await tempRow.locator('.alternate-thumb').count()
console.log({ selectedBefore, alternatesBeforeMove })
assert.equal(selectedBefore, 1)
assert.equal(alternatesBeforeMove, 0)

// Move selected back to alternates via right-click.
await tempRow.locator('.selected-thumb').click({ button: 'right' })
await wait(350)
const menu = await page
  .locator('.MuiMenu-paper:visible [role="menuitem"]')
  .allInnerTexts()
console.log('selected menu:', menu)
assert.deepEqual(menu, ['更换', '移到备选'])
await page.getByRole('menuitem', { name: '移到备选' }).click()
await wait(1000)
const selectedAfter = await tempRow.locator('.selected-thumb').count()
const alternatesAfter = await tempRow.locator('.alternate-thumb').count()
console.log({ selectedAfter, alternatesAfter })
assert.equal(selectedAfter, 0)
assert.equal(alternatesAfter, 1)
await page.screenshot({
  path: 'screenshots/68-selected-move-to-alternates.png',
  fullPage: false,
})

// Media should not have moved to recycle.
const media = await fetch(
  `${base}/api/projects/${projectId}/media?limit=500&q=concept-harbor`,
).then((response) => response.json())
const originalUsage = media.items.find(
  (item) => item.displayName === 'concept-harbor.png',
)?.usageCount
console.log('concept-harbor usage:', originalUsage)
assert.ok(Number(originalUsage) >= 2)

// Remove the temporary row and purge its batch.
await tempRow.locator('.drag-handle').click({ button: 'right' })
await wait(300)
await page.getByRole('menuitem', { name: '删除行' }).click()
const deleteDialog = page.getByRole('dialog')
await deleteDialog.waitFor({ state: 'visible' })
await deleteDialog.getByRole('button', { name: '删除', exact: true }).click()
await wait(1800)
const purged = await cleanupTemporaryRow()
console.log('temporary batch purged:', purged)
assert.ok(purged)

console.log('errors:', errors.slice(0, 10))
assert.equal(errors.length, 0)
await browser.close()
