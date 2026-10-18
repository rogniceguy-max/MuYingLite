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

async function wait(ms) {
  await page.waitForTimeout(ms)
}

await page.goto('http://localhost:3001/', { waitUntil: 'networkidle' })
await page.locator('.project-card').first().click()
await page.waitForSelector('.sheet-table', { timeout: 15000 })
await wait(1000)

// Beat sheet final.
await page.locator('.nav-episode').first().locator('.episode-main').click()
await page.waitForSelector('.sheet-table', { timeout: 15000 })
await wait(1000)
await page.screenshot({
  path: 'screenshots/03-beat-final.png',
  fullPage: false,
})

// Asset sheet final.
await page.locator('.asset-nav').click()
await page.waitForSelector('.asset-table', { timeout: 15000 })
await wait(1000)
await page.screenshot({
  path: 'screenshots/04-asset-final.png',
  fullPage: false,
})

// Media library final.
await page.getByRole('button', { name: /文件库/ }).first().click()
await page.waitForSelector('.media-grid', { timeout: 15000 })
await wait(1000)
await page.screenshot({
  path: 'screenshots/06-media-final.png',
  fullPage: false,
})

// Settings.
await page.getByRole('button', { name: /项目设置/ }).first().click()
await page.waitForSelector('.settings-page', { timeout: 15000 })
await wait(900)
await page.screenshot({
  path: 'screenshots/11-project-settings.png',
  fullPage: false,
})
console.log(
  'settings:',
  (await page.locator('.settings-page').innerText()).slice(0, 1200),
)

// Project list final.
await page.locator('.sidebar-project-name').click()
await page.waitForSelector('.project-card', { timeout: 15000 })
await wait(800)
await page.screenshot({
  path: 'screenshots/12-project-list-filled.png',
  fullPage: false,
})

await browser.close()
