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
  const recycle = await fetch(`${base}/api/projects/${projectId}/recycle-bin`).then(
    (response) => response.json(),
  )
  const batch = recycle.batches.find((item) =>
    String(item.metadata?.rowSummary ?? '').includes('临时'),
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
await wait(900)

const removedAffordances = await page.evaluate(() => ({
  navSub: document.querySelectorAll('.nav-sub').length,
  episodeMore: document.querySelectorAll('.episode-more').length,
  navMore: document.querySelectorAll('.nav-more').length,
  sheetToolbar: document.querySelectorAll('.sheet-toolbar').length,
  presenceInline: document.querySelectorAll('.presence-inline').length,
}))
console.log('removed affordances:', removedAffordances)
assert.deepEqual(removedAffordances, {
  navSub: 0,
  episodeMore: 0,
  navMore: 0,
  sheetToolbar: 0,
  presenceInline: 0,
})

// Episode actions moved to right-click; sheet rename is no longer exposed.
await page.locator('.nav-episode').first().click({ button: 'right' })
await wait(350)
const episodeMenuItems = await page
  .locator('.MuiMenu-paper:visible [role="menuitem"]')
  .allInnerTexts()
console.log('episode context menu:', episodeMenuItems)
assert.deepEqual(episodeMenuItems, ['编辑集', '删除整集'])
await page.screenshot({
  path: 'screenshots/45-episode-right-click.png',
  fullPage: false,
})
await page.keyboard.press('Escape')
await wait(250)

// Asset nav no longer has a sheet rename context menu.
await page.locator('.asset-nav').click({ button: 'right' })
await wait(300)
const assetMenuCount = await page.locator('.MuiMenu-paper:visible').count()
console.log('asset nav context menu count:', assetMenuCount)
assert.equal(assetMenuCount, 0)

await page.locator('.asset-nav').click()
await page.waitForSelector('.asset-table', { timeout: 15000 })
await wait(800)

const assetPageCounts = await page.evaluate(() => ({
  sheetToolbar: document.querySelectorAll('.sheet-toolbar').length,
  presentSheetName: document.querySelectorAll('.sheet-toolbar-title').length,
}))
console.log('asset page:', assetPageCounts)
assert.equal(assetPageCounts.sheetToolbar, 0)

const rows = page.locator('.sheet-row')
const rowCount = await rows.count()
let alternateRow = null
let alternateCount = 0
let selectedOnlyRow = null
for (let index = 0; index < rowCount; index += 1) {
  const row = rows.nth(index)
  const alternates = await row.locator('.alternate-thumb').count()
  const selected = await row.locator('.selected-thumb img').count()
  if (alternates > 0 && !alternateRow) {
    alternateRow = row
    alternateCount = alternates
  }
  if (selected > 0 && alternates === 0 && !selectedOnlyRow) {
    selectedOnlyRow = row
  }
}
console.log({ rowCount, alternateCount, hasSelectedOnlyRow: Boolean(selectedOnlyRow) })
assert.ok(alternateRow)
assert.ok(alternateCount > 0)
assert.ok(selectedOnlyRow)

// 选择图片 only opens the current row's alternates, with no upload/library entry.
await alternateRow
  .locator('.selected-image-cell .image-cell-actions button')
  .click()
const chooser = page.getByRole('dialog')
await chooser.waitFor({ state: 'visible' })
await wait(400)
const chooserTitle = await chooser
  .locator('.MuiDialogTitle-root')
  .innerText()
const chooserCards = chooser.locator('.media-picker-card')
const chooserCardCount = await chooserCards.count()
const chooserUploadButtons = await chooser
  .getByRole('button', { name: /上传/ })
  .count()
console.log({
  chooserTitle,
  chooserCardCount,
  alternateCount,
  chooserUploadButtons,
})
assert.match(chooserTitle, /从本行备选选择/)
assert.equal(chooserCardCount, alternateCount)
assert.equal(chooserUploadButtons, 0)
await page.screenshot({
  path: 'screenshots/46-selected-from-alternates.png',
  fullPage: false,
})
await page.keyboard.press('Escape')
await wait(350)

// A row with a selected image but no alternates gets an explicit empty state.
await selectedOnlyRow
  .locator('.selected-image-cell .image-cell-actions button')
  .click()
const emptyChooser = page.getByRole('dialog')
await emptyChooser.waitFor({ state: 'visible' })
await wait(350)
const emptyText = await emptyChooser.innerText()
const emptyCards = await emptyChooser.locator('.media-picker-card').count()
const emptyUploads = await emptyChooser
  .getByRole('button', { name: /上传/ })
  .count()
console.log({ emptyText: emptyText.slice(0, 120), emptyCards, emptyUploads })
assert.match(emptyText, /当前行还没有备选图片/)
assert.equal(emptyCards, 0)
assert.equal(emptyUploads, 0)
await page.keyboard.press('Escape')
await wait(350)

// Episode menu: scrolls inside a capped popover, row layout unchanged.
const episodeRow = rows.last()
const rowHeightBeforeMenu = (await episodeRow.boundingBox()).height
await episodeRow.locator('.episode-add').click()
await wait(500)
const menuPaper = page.locator('.MuiMenu-paper:visible').last()
const menuMetrics = await menuPaper.evaluate((element) => ({
  height: element.getBoundingClientRect().height,
  clientHeight: element.clientHeight,
  scrollHeight: element.scrollHeight,
  itemCount: element.querySelectorAll('[role="menuitem"]').length,
}))
const rowHeightWithMenu = (await episodeRow.boundingBox()).height
console.log({ menuMetrics, rowHeightBeforeMenu, rowHeightWithMenu })
assert.ok(menuMetrics.height <= 322)
assert.ok(menuMetrics.scrollHeight > menuMetrics.clientHeight)
assert.ok(menuMetrics.itemCount >= 20)
assert.equal(rowHeightWithMenu, rowHeightBeforeMenu)
await page.screenshot({
  path: 'screenshots/47-episode-menu-capped.png',
  fullPage: false,
})
await page.keyboard.press('Escape')
await wait(250)

// Temporary row: many selected episodes stay on one line and do not grow the row.
await page.locator('.table-add-row').click()
await wait(800)
const tempRow = rows.last()
await tempRow.locator('.cell-asset-category input').fill('临时')
await tempRow.locator('.cell-asset-name input').fill('测试行')
await wait(400)
const emptyRowHeight = (await tempRow.boundingBox()).height
await tempRow.locator('.episode-add').click()
await wait(300)
const unchecked = page
  .locator('.MuiMenu-paper:visible [role="menuitem"]')
  .filter({ hasNot: page.locator('.menu-check.checked') })
for (let index = 0; index < 3; index += 1) {
  await unchecked.first().click()
  await wait(180)
}
await page.keyboard.press('Escape')
await wait(500)
const chipCounts = await tempRow.evaluate((element) => ({
  visible: element.querySelectorAll('.episode-chip:not(.episode-chip-more)').length,
  overflow: element.querySelectorAll('.episode-chip-more').length,
  overflowText: element.querySelector('.episode-chip-more')?.textContent ?? null,
  cellHeight: element.querySelector('.episodes-cell')?.getBoundingClientRect().height,
}))
const filledRowHeight = (await tempRow.boundingBox()).height
console.log({ emptyRowHeight, filledRowHeight, chipCounts })
assert.equal(chipCounts.visible, 2)
assert.equal(chipCounts.overflow, 1)
assert.equal(chipCounts.overflowText, '+1')
assert.equal(filledRowHeight, emptyRowHeight)
await page.screenshot({
  path: 'screenshots/48-episode-chips-capped.png',
  fullPage: false,
})

// Add an existing image to the temp row's alternates, then pick it as selected.
await tempRow.locator('.alternates-cell').click({ button: 'right' })
await wait(300)
await page.getByRole('menuitem', { name: '从文件库添加' }).click()
const picker = page.getByRole('dialog')
await picker.waitFor({ state: 'visible' })
await wait(500)
await picker
  .locator('.media-picker-card')
  .filter({ hasText: 'concept-shenlan-b.png' })
  .first()
  .click()
await wait(900)
const tempAlternateCount = await tempRow.locator('.alternate-thumb').count()
assert.ok(tempAlternateCount > 0)
await tempRow
  .locator('.selected-image-cell .image-cell-actions button')
  .click()
const tempChooser = page.getByRole('dialog')
await tempChooser.waitFor({ state: 'visible' })
await wait(400)
const tempPick = tempChooser.locator('.media-picker-card').first()
const tempPickName = await tempPick.getAttribute('title')
await tempPick.click()
await wait(900)
const tempSelected = await tempRow
  .locator('.selected-thumb img')
  .getAttribute('alt')
console.log({ tempAlternateCount, tempPickName, tempSelected })
assert.equal(tempSelected, tempPickName)
await page.screenshot({
  path: 'screenshots/48b-temp-row-selected-from-alternate.png',
  fullPage: false,
})

// Remove the temporary row and purge its recycle batch.
await tempRow.locator('.drag-handle').click({ button: 'right' })
await wait(300)
await page.getByRole('menuitem', { name: '删除行' }).click()
const deleteDialog = page.getByRole('dialog')
await deleteDialog.waitFor({ state: 'visible' })
await deleteDialog.getByRole('button', { name: '删除', exact: true }).click()
await wait(1600)
let purgedBatch = await cleanupTemporaryRow()
if (!purgedBatch) {
  await wait(1000)
  purgedBatch = await cleanupTemporaryRow()
}
console.log('temporary row batch purged:', purgedBatch)
assert.ok(purgedBatch)

// File library: no tree, large icon grid.
await page.locator('.sidebar').getByRole('button', { name: '文件库' }).click()
await page.waitForSelector('.file-grid', { timeout: 15000 })
await wait(800)
const fileLibrary = await page.evaluate(() => {
  const folderCard = document.querySelector(
    '.file-card.folder-card .file-card-thumb',
  )
  const rect = folderCard?.getBoundingClientRect()
  return {
    fileTree: document.querySelectorAll('.file-tree').length,
    fileListHead: document.querySelectorAll('.file-list-head').length,
    fileRow: document.querySelectorAll('.file-row').length,
    grid: document.querySelectorAll('.file-grid').length,
    folderCards: document.querySelectorAll('.file-card.folder-card').length,
    fileCards: document.querySelectorAll('.file-card:not(.folder-card)').length,
    folderThumbWidth: rect?.width ?? 0,
    folderThumbHeight: rect?.height ?? 0,
  }
})
console.log('file library:', fileLibrary)
assert.equal(fileLibrary.fileTree, 0)
assert.equal(fileLibrary.fileListHead, 0)
assert.equal(fileLibrary.fileRow, 0)
assert.equal(fileLibrary.grid, 1)
assert.ok(fileLibrary.folderCards >= 3)
assert.ok(fileLibrary.folderThumbWidth >= 120)
assert.ok(fileLibrary.folderThumbHeight >= 80)
await page.screenshot({
  path: 'screenshots/43-file-library-large-icons.png',
  fullPage: false,
})

// Large icon folder navigation.
await page
  .locator('.file-card.folder-card')
  .filter({ hasText: '第1集' })
  .first()
  .dblclick()
await wait(500)
await page
  .locator('.file-card.folder-card')
  .filter({ hasText: '第1拍' })
  .first()
  .dblclick()
await wait(500)
const flowerCard = page
  .locator('.file-card:not(.folder-card)')
  .filter({ hasText: 'flower.mp4' })
  .first()
console.log('flower card:', await flowerCard.count())
assert.ok((await flowerCard.count()) > 0)

// Double-click opens the viewer.
await flowerCard.dblclick()
await page.getByRole('dialog').waitFor({ state: 'visible' })
await wait(400)
await page.getByRole('dialog').getByRole('button').first().click()
await wait(300)

// Right-click actions.
await flowerCard.click({ button: 'right' })
await wait(350)
const fileMenuItems = await page
  .locator('.MuiMenu-paper:visible [role="menuitem"]')
  .allInnerTexts()
console.log('file card context menu:', fileMenuItems)
assert.deepEqual(fileMenuItems, ['下载', '重命名', '删除'])
await page.screenshot({
  path: 'screenshots/49-file-card-context.png',
  fullPage: false,
})
await page.keyboard.press('Escape')
await wait(250)

// Search across folders.
const searchInput = page.locator('.file-search .field-input')
await searchInput.fill('flower')
await wait(800)
const searchCount = await page
  .locator('.file-card:not(.folder-card)')
  .count()
console.log('search result cards:', searchCount)
assert.ok(searchCount >= 2)
await searchInput.fill('')
await wait(500)

// Back to root, light theme screenshot.
await page
  .locator('.file-breadcrumb')
  .getByRole('button', { name: '文件库', exact: true })
  .click()
await wait(600)
await page.getByRole('button', { name: '切换浅色主题' }).click()
await wait(650)
await page.screenshot({
  path: 'screenshots/44-file-library-large-icons-light.png',
  fullPage: false,
})
await page.getByRole('button', { name: '切换深色主题' }).click()
await wait(400)

console.log('errors:', errors.slice(0, 10))
assert.equal(errors.length, 0)
await browser.close()
