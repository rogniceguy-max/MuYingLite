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
await wait(900)

const beatBreadcrumb = await page.locator('.breadcrumb-current').innerText()
console.log('beat breadcrumb:', beatBreadcrumb)
assert.match(beatBreadcrumb, /^第1集(?: · .+)?$/)

await page.locator('.nav-episode').first().click({ button: 'right' })
await wait(350)
const episodeMenu = await page
  .locator('.MuiMenu-paper:visible [role="menuitem"]')
  .allInnerTexts()
console.log('episode menu:', episodeMenu)
assert.deepEqual(episodeMenu, ['编辑集', '删除整集'])
await page.screenshot({
  path: 'screenshots/51-episode-menu-no-sheet-rename.png',
  fullPage: false,
})
await page.keyboard.press('Escape')
await wait(300)

// Asset nav no longer has a sheet-rename context menu.
await page.locator('.asset-nav').click({ button: 'right' })
await wait(350)
const assetContextMenus = await page.locator('.MuiMenu-paper:visible').count()
console.log('asset nav visible context menus:', assetContextMenus)
assert.equal(assetContextMenus, 0)

await page.locator('.asset-nav').click()
await page.waitForSelector('.asset-table', { timeout: 15000 })
await wait(700)
const assetBreadcrumb = await page.locator('.breadcrumb-current').innerText()
console.log('asset breadcrumb:', assetBreadcrumb)
assert.equal(assetBreadcrumb, '资产表')

// Second episode breadcrumb uses its number/title.
await page.locator('.nav-episode').nth(1).locator('.episode-main').click()
await page.waitForTimeout(800)
const episode2Breadcrumb = await page.locator('.breadcrumb-current').innerText()
console.log('episode 2 breadcrumb:', episode2Breadcrumb)
assert.match(episode2Breadcrumb, /^第2集(?: · .+)?$/)

// Settings no longer exposes table names or the rename pencil buttons.
await page.locator('.sidebar-footer').getByRole('button', { name: '项目设置' }).click()
await page.waitForTimeout(900)
const settingsInfo = await page.evaluate(() => ({
  sectionTitles: [...document.querySelectorAll('.settings-section-title')].map(
    (element) => element.textContent?.trim(),
  ),
  tableRenameButtons: document.querySelectorAll(
    'button[aria-label="重命名表"]',
  ).length,
  sheetBadges: document.querySelectorAll('.sheet-kind-badge').length,
  legacyRowTitles: document.querySelectorAll('.settings-row-title').length,
  rowTitles: [...document.querySelectorAll('.settings-episode-title')].map(
    (element) => element.textContent?.trim(),
  ),
}))
console.log('settings:', {
  sectionTitles: settingsInfo.sectionTitles,
  tableRenameButtons: settingsInfo.tableRenameButtons,
  sheetBadges: settingsInfo.sheetBadges,
  legacyRowTitles: settingsInfo.legacyRowTitles,
  rowTitleCount: settingsInfo.rowTitles.length,
})
assert.ok(!settingsInfo.sectionTitles.includes('表名'))
assert.equal(settingsInfo.tableRenameButtons, 0)
assert.equal(settingsInfo.sheetBadges, 0)
assert.equal(settingsInfo.legacyRowTitles, 0)
assert.ok(settingsInfo.rowTitles.length > 0)
await page.screenshot({
  path: 'screenshots/52-settings-no-table-names.png',
  fullPage: false,
})

// Recycle bin no longer prints a separate table-name line.
await page.locator('.sidebar').getByRole('button', { name: '回收站' }).click()
await page.waitForTimeout(700)
const recycleText = await page.locator('.recycle-page').innerText()
console.log('recycle contains 表：', recycleText.includes('表：'))
assert.equal(recycleText.includes('表：'), false)

console.log('errors:', errors.slice(0, 10))
assert.equal(errors.length, 0)
await browser.close()
