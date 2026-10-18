import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'

const base = 'http://localhost:3001'
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
await page.locator('.asset-nav').click()
await page.waitForSelector('.asset-table', { timeout: 15000 })
await wait(800)

// +N opens the hidden-selected-episode navigation menu, not the add menu.
const moreChip = page.locator('.episode-chip-more').first()
const moreCount = Number((await moreChip.innerText()).replace('+', ''))
console.log('more count:', moreCount)
assert.ok(moreCount > 0)
await moreChip.click()
await wait(400)
const moreItems = await page
  .locator('.MuiMenu-paper:visible [role="menuitem"]')
  .allInnerTexts()
console.log('more menu items:', moreItems)
assert.equal(moreItems.length, moreCount)
assert.ok(moreItems.every((item) => item.includes('第')))
await page.screenshot({
  path: 'screenshots/61-episode-more-menu.png',
  fullPage: false,
})
await page
  .locator(
    '.MuiMenu-paper:visible [role="menuitem"]:not([aria-disabled="true"])',
  )
  .first()
  .click()
await wait(1000)
const navigatedBreadcrumb = await page.locator('.breadcrumb-current').innerText()
console.log('navigated breadcrumb:', navigatedBreadcrumb)
assert.match(navigatedBreadcrumb, /^第\d+集(?: · .+)?$/)
assert.match(page.url(), /\/sheets\//)

// Return to the asset sheet.
await page.locator('.asset-nav').click()
await page.waitForSelector('.asset-table', { timeout: 15000 })
await wait(700)

// Selected image no longer has a visible "更换" button.
const selectedRows = page.locator('.sheet-row').filter({
  has: page.locator('.selected-thumb'),
})
const selectedRow = selectedRows.first()
const selectedRowCount = await selectedRows.count()
const visibleChangeButtons = await selectedRow
  .locator('.selected-image-cell .image-cell-actions button', {
    hasText: '更换',
  })
  .count()
console.log({ selectedRowCount, visibleChangeButtons })
assert.ok(selectedRowCount > 0)
assert.equal(visibleChangeButtons, 0)

await selectedRow.locator('.selected-thumb').click({ button: 'right' })
await wait(350)
const imageMenu = await page
  .locator('.MuiMenu-paper:visible [role="menuitem"]')
  .allInnerTexts()
console.log('selected image menu:', imageMenu)
assert.deepEqual(imageMenu, ['更换', '移到备选'])
await page.getByRole('menuitem', { name: '更换' }).click()
const chooser = page.getByRole('dialog')
await chooser.waitFor({ state: 'visible' })
await wait(350)
console.log('chooser title:', await chooser.locator('.MuiDialogTitle-root').innerText())
await page.keyboard.press('Escape')
await wait(300)

// Empty selected cell still offers the choose button.
const emptySelectedRow = page
  .locator('.sheet-row')
  .filter({ has: page.locator('.selected-image-cell .image-cell-actions button') })
  .first()
console.log(
  'empty selected button:',
  await emptySelectedRow
    .locator('.selected-image-cell .image-cell-actions button')
    .innerText(),
)

// Image viewer: no zoom control stack, wheel zoom and drag pan work.
await selectedRow.locator('.selected-thumb').click()
const viewer = page.getByRole('dialog')
await viewer.waitFor({ state: 'visible' })
await wait(500)
const stackCount = await viewer.locator('.MuiStack-root').count()
console.log('viewer stack count:', stackCount)
assert.equal(stackCount, 0)
const stage = viewer.locator('.media-image-stage')
await stage.waitFor({ state: 'visible' })
const stageBox = await stage.boundingBox()
assert.ok(stageBox)
const centerX = stageBox.x + stageBox.width / 2
const centerY = stageBox.y + stageBox.height / 2
await page.mouse.move(centerX, centerY)
await page.mouse.wheel(0, -420)
await wait(500)
const zoomTransform = await stage.locator('img').evaluate((img) => img.style.transform)
console.log('transform after wheel:', zoomTransform)
assert.match(zoomTransform, /scale\(1\.[1-9]/)

await page.mouse.move(centerX, centerY)
await page.mouse.down()
await page.mouse.move(centerX + 55, centerY + 35, { steps: 8 })
await page.mouse.up()
await wait(400)
const dragTransform = await stage.locator('img').evaluate((img) => img.style.transform)
console.log('transform after drag:', dragTransform)
assert.notEqual(dragTransform, zoomTransform)
assert.match(dragTransform, /translate\(/)

await stage.dblclick({ position: { x: 20, y: 20 } })
await wait(400)
const resetTransform = await stage.locator('img').evaluate((img) => img.style.transform)
console.log('transform after reset:', resetTransform)
assert.match(resetTransform, /translate\(0px, 0px\) scale\(1\)/)

console.log('errors:', errors.slice(0, 10))
assert.equal(errors.length, 0)
await browser.close()
