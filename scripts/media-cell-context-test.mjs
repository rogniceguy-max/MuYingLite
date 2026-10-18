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
    videoCardPlay: document.querySelectorAll('.video-card-play').length,
    videoTriangle: document.querySelectorAll('.video-play-triangle').length,
    mediaItemActions: document.querySelectorAll('.media-item-actions').length,
    alternateActions: document.querySelectorAll('.alternate-actions').length,
    cellPlaceholder: document.querySelectorAll('.cell-placeholder').length,
    imageCaption: document.querySelectorAll('.image-caption').length,
    episodeIndex: document.querySelectorAll('.episode-index').length,
    episodeSheet: document.querySelectorAll('.episode-sheet').length,
    muiSvg: document.querySelectorAll('.MuiSvgIcon-root').length,
    lucide: document.querySelectorAll('svg.lucide').length,
  }))
}

await page.goto('http://localhost:3001/', { waitUntil: 'networkidle' })
await page.locator('.project-card').first().click()
await page.waitForSelector('.sheet-table', { timeout: 15000 })
await wait(900)
console.log('beat counts:', await counts())

const firstVideo = page.locator('.video-card').first()
await firstVideo.click({ button: 'right' })
await wait(300)
console.log(
  'video context remove:',
  await page.getByRole('menuitem', { name: '移除' }).count(),
)
await page.screenshot({
  path: 'screenshots/30-video-right-click.png',
  fullPage: false,
})
await page.keyboard.press('Escape')
await wait(500)

await page.locator('.asset-nav').click()
await page.waitForSelector('.asset-table', { timeout: 15000 })
await wait(800)
console.log('asset counts:', await counts())

const firstAlternate = page.locator('.alternate-thumb').first()
await firstAlternate.click({ button: 'right' })
await wait(300)
console.log(
  'alternate context remove:',
  await page.getByRole('menuitem', { name: '移除' }).count(),
)
await page.screenshot({
  path: 'screenshots/31-image-right-click.png',
  fullPage: false,
})
await page.keyboard.press('Escape')
await wait(500)

const selected = page.locator('.selected-thumb').first()
await selected.click({ button: 'right' })
await wait(300)
console.log(
  'selected context remove:',
  await page.getByRole('menuitem', { name: '移除' }).count(),
)
await page.keyboard.press('Escape')
await wait(500)

await page.getByRole('button', { name: /文件库/ }).first().click()
await page.waitForSelector('.media-folder-list', { timeout: 15000 })
await wait(900)
await page.screenshot({
  path: 'screenshots/32-nested-folders.png',
  fullPage: false,
})
console.log('errors:', errors.slice(0, 8))
await browser.close()
