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

const errors = []
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text())
})
page.on('pageerror', (error) => errors.push(error.message))

async function wait(ms) {
  await page.waitForTimeout(ms)
}

async function counts() {
  return page.evaluate(() => ({
    muiTextField: document.querySelectorAll('.MuiTextField-root').length,
    muiFormControl: document.querySelectorAll('.MuiFormControl-root').length,
    cssGh: document.querySelectorAll('[class*="css-ghwvnd"]').length,
    muiSvg: document.querySelectorAll('.MuiSvgIcon-root').length,
    lucide: document.querySelectorAll('svg.lucide').length,
    eyebrow: document.querySelectorAll('.eyebrow').length,
    statusPill: document.querySelectorAll('.status-pill').length,
    presenceHint: document.querySelectorAll('.presence-hint').length,
    anonymous: document.querySelectorAll('.anonymous-chip').length,
    rowActions: document.querySelectorAll('.row-actions-cell').length,
    theme: document.documentElement.dataset.theme || 'dark(default)',
  }))
}

await page.goto('http://localhost:3001/', { waitUntil: 'networkidle' })
await wait(800)
console.log('project list counts:', await counts())
await page.screenshot({
  path: 'screenshots/20-dark-project-list.png',
  fullPage: false,
})

await page.locator('.project-card').first().click()
await page.waitForSelector('.sheet-table', { timeout: 15000 })
await wait(1000)
console.log('sheet counts:', await counts())

// Right-click a row: context menu should contain delete.
await page.locator('.sheet-row').nth(2).click({ button: 'right' })
await wait(300)
console.log(
  'row context delete item:',
  await page.getByRole('menuitem', { name: '删除行' }).count(),
)
await page.screenshot({
  path: 'screenshots/21-dark-row-context.png',
  fullPage: false,
})
await page.keyboard.press('Escape')
await wait(300)

// Toggle light theme.
await page.getByRole('button', { name: '切换浅色主题' }).click()
await wait(700)
await page.mouse.move(120, 840)
await wait(300)
console.log('after light toggle:', await counts())
await page.screenshot({
  path: 'screenshots/22-light-beat-sheet.png',
  fullPage: false,
})

await page.locator('.asset-nav').click()
await page.waitForSelector('.asset-table', { timeout: 15000 })
await wait(900)
await page.screenshot({
  path: 'screenshots/23-light-asset.png',
  fullPage: false,
})

await page.getByRole('button', { name: /文件库/ }).first().click()
await page.waitForSelector('.media-grid', { timeout: 15000 })
await wait(900)
const card = page.locator('.media-card').first()
await card.click({ button: 'right' })
await wait(300)
const downloadItem = page.getByRole('menuitem', { name: '下载' })
const renameItem = page.getByRole('menuitem', { name: '重命名' })
const deleteItem = page.getByRole('menuitem', { name: '删除' })
console.log('media context:', {
  download: await downloadItem.count(),
  rename: await renameItem.count(),
  delete: await deleteItem.count(),
})
await page.screenshot({
  path: 'screenshots/24-light-media-context.png',
  fullPage: false,
})

await renameItem.click()
await wait(400)
const renameDialog = page.getByRole('dialog')
console.log('rename dialog:', await renameDialog.isVisible())
await page.screenshot({
  path: 'screenshots/25-light-rename-dialog.png',
  fullPage: false,
})
await renameDialog.getByRole('button', { name: '取消' }).click()
await wait(300)

// Back to dark for the media library.
await page.getByRole('button', { name: '切换深色主题' }).click()
await wait(700)
await page.mouse.move(120, 840)
await wait(300)
await page.screenshot({
  path: 'screenshots/26-dark-media-library.png',
  fullPage: false,
})
console.log('final counts:', await counts())
console.log('errors:', errors.slice(0, 8))
await browser.close()
