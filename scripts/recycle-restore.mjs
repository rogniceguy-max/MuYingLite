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
await page.getByRole('button', { name: /回收站/ }).first().click()
await page.waitForSelector('.recycle-card, .library-empty', { timeout: 15000 })
await wait(900)
console.log('batches:', await page.locator('.recycle-card').count())
console.log(
  'recycle:',
  (await page.locator('.recycle-page').innerText()).slice(0, 1400),
)
await page.screenshot({
  path: 'screenshots/08-recycle-bin.png',
  fullPage: false,
})

const restoreButton = page
  .locator('.recycle-card .recycle-actions button')
  .filter({ hasText: '恢复' })
  .first()
if ((await restoreButton.count()) > 0) {
  await restoreButton.click()
  await wait(2000)
  console.log('restored via recycle card')
}

await page.locator('.asset-nav').click()
await page.waitForSelector('.asset-table', { timeout: 15000 })
await wait(900)
console.log('asset rows after restore:', await page.locator('.sheet-row').count())
await page.screenshot({
  path: 'screenshots/04c-asset-restored.png',
  fullPage: false,
})
await browser.close()
