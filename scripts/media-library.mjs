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

page.on('console', (message) => {
  if (message.type() === 'error') console.log('CONSOLE ERROR:', message.text())
})
page.on('pageerror', (error) => console.log('PAGE ERROR:', error.message))

await page.goto('http://localhost:3001/', { waitUntil: 'networkidle' })
await page.locator('.project-card').first().click()
await page.waitForSelector('.sheet-table', { timeout: 15000 })
await page.getByRole('button', { name: /文件库/ }).first().click()
await page.waitForSelector('.media-grid', { timeout: 15000 })
await page.waitForTimeout(1200)
console.log('media cards:', await page.locator('.media-card').count())
await page.screenshot({
  path: 'screenshots/06-media-library.png',
  fullPage: false,
})

// Open the video.
const videoCard = page.locator('.media-card').filter({ hasText: 'flower.mp4' }).first()
if ((await videoCard.count()) > 0) {
  await videoCard.click()
  await page.waitForTimeout(900)
  await page.screenshot({
    path: 'screenshots/07-video-viewer.png',
    fullPage: false,
  })
  console.log('video controls:', await page.locator('video').count())
}

await browser.close()
