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

await page.goto(base + '/', { waitUntil: 'networkidle' })
await page.locator('.project-card').first().click()
await page.waitForSelector('.sheet-table', { timeout: 15000 })
await wait(800)

// Temporary beat-sheet row linked to a video that is also used elsewhere.
await page.locator('.nav-episode').first().locator('.episode-main').click()
await page.waitForSelector('.beat-table', { timeout: 15000 })
await wait(700)
await page.locator('.table-add-row').click()
await wait(700)
let tempRow = page.locator('.sheet-row').last()
await tempRow.locator('.cell-beat-scene input').fill('临时共享测试')
await tempRow.locator('.media-cell').click({ button: 'right' })
await wait(350)
await page.getByRole('menuitem', { name: '从文件库添加' }).click()
const picker = page.getByRole('dialog')
await picker.waitFor({ state: 'visible' })
await wait(500)
await picker
  .locator('.media-picker-card')
  .filter({ hasText: 'flower.mp4' })
  .first()
  .click()
await wait(1200)
const tempVideoCount = await tempRow.locator('.video-card').count()
console.log('temp row video count:', tempVideoCount)
assert.ok(tempVideoCount > 0)

await tempRow.locator('.drag-handle').click({ button: 'right' })
await wait(350)
await page.getByRole('menuitem', { name: '删除行' }).click()
const deleteDialog = page.getByRole('dialog')
await deleteDialog.waitFor({ state: 'visible' })
await deleteDialog.getByRole('button', { name: '删除', exact: true }).click()
await wait(2000)

// Open the recycle bin fresh so the new row batch is visible.
await page.locator('.sidebar').getByRole('button', { name: '回收站' }).click()
await page.waitForURL(/\/recycle-bin$/, { timeout: 15000 })
await page.reload({ waitUntil: 'networkidle' })
await page.waitForSelector('.recycle-batch-card', { timeout: 15000 })
await wait(800)

const sharedCard = page
  .locator('.recycle-batch-card')
  .filter({ hasText: '临时共享测试' })
  .first()
console.log('shared card count:', await sharedCard.count())
assert.equal(await sharedCard.count(), 1)
const cardText = await sharedCard.innerText()
console.log({ cardText })
assert.match(cardText, /仍在使用/)

await sharedCard.dblclick()
await wait(700)
for (let attempt = 0; attempt < 3; attempt += 1) {
  if ((await page.locator('.recycle-media-card').count()) > 0) break
  const folder = page.locator('.recycle-page .folder-card').first()
  if ((await folder.count()) === 0) break
  console.log('enter folder:', await folder.innerText())
  await folder.dblclick()
  await wait(600)
}
const mediaCard = page
  .locator('.recycle-media-card')
  .filter({ hasText: 'flower.mp4' })
  .first()
console.log('media card count:', await mediaCard.count())
assert.equal(await mediaCard.count(), 1)
const mediaCardText = await mediaCard.innerText()
console.log('media card:', mediaCardText)
assert.match(mediaCardText, /仍在使用/)
await page.screenshot({
  path: 'screenshots/64-recycle-shared-media.png',
  fullPage: false,
})

// Back to the recycle root to purge the batch.
await page.locator('.file-breadcrumb').getByRole('button', { name: '回收站', exact: true }).click()
await wait(600)
const sharedCardAgain = page
  .locator('.recycle-batch-card')
  .filter({ hasText: '临时共享测试' })
  .first()
assert.equal(await sharedCardAgain.count(), 1)

// Purging the row batch must keep the shared media body.
await sharedCardAgain.click({ button: 'right' })
await wait(300)
await page.getByRole('menuitem', { name: '彻底删除' }).click()
const purgeDialog = page.getByRole('dialog')
await purgeDialog.waitFor({ state: 'visible' })
const purgeText = await purgeDialog.innerText()
console.log('purge dialog:', purgeText)
assert.match(purgeText, /仍被其他表引用/)
await purgeDialog.getByLabel('输入 DELETE 确认').fill('DELETE')
await purgeDialog
  .getByRole('button', { name: '彻底删除', exact: true })
  .click()
await wait(1800)

const recycle = await fetch(
  `${base}/api/projects/${projectId}/recycle-bin`,
).then((response) => response.json())
assert.equal(
  recycle.batches.some((batch) =>
    String(batch.metadata?.rowSummary ?? '').includes('临时共享测试'),
  ),
  false,
)
const media = await fetch(
  `${base}/api/projects/${projectId}/media?limit=500`,
).then((response) => response.json())
console.log(
  'flower still exists and is still used:',
  media.items.some(
    (item) =>
      item.displayName === 'flower.mp4' && Number(item.usageCount ?? 0) > 0,
  ),
)
assert.ok(
  media.items.some(
    (item) =>
      item.displayName === 'flower.mp4' && Number(item.usageCount ?? 0) > 0,
  ),
)

console.log('errors:', errors.slice(0, 10))
assert.equal(errors.length, 0)
await browser.close()
