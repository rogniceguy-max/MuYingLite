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
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
})
await page.addInitScript(() => localStorage.setItem('frame-theme', 'dark'))
const errors = []
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text())
})
page.on('pageerror', (error) => errors.push(error.message))
const wait = (ms) => page.waitForTimeout(ms)

await page.goto(base + '/', { waitUntil: 'networkidle' })
await page.waitForSelector('.project-card-new')
await page.locator('.project-card-new').click()
await page.getByRole('dialog').waitFor()
await wait(400)
await page.screenshot({ path: 'screenshots/90-dialog-dark-1440.png' })
await page.keyboard.press('Escape')
await wait(400)

await page.locator('.project-card').first().click()
await page.waitForSelector('.sheet-table', { timeout: 15000 })
await wait(700)
await page.locator('.asset-nav').click()
await page.waitForSelector('.asset-table', { timeout: 15000 })
await wait(700)
await page.locator('.selected-thumb').first().click()
await page.getByRole('dialog').waitFor()
await wait(600)
await page.screenshot({ path: 'screenshots/91-viewer-dark-1440.png' })
await page.keyboard.press('Escape')
await wait(400)

await page
  .locator('.sidebar')
  .getByRole('button', { name: '回收站' })
  .click()
await page.waitForSelector('.recycle-batch-card', { timeout: 15000 })
await wait(700)
await page.locator('.recycle-batch-card').first().click({ button: 'right' })
await page.getByRole('menu').waitFor()
await wait(300)
await page.screenshot({ path: 'screenshots/92-menu-dark-1440.png' })

assert.deepEqual(errors, [], `console errors: ${errors.join('\n')}`)
console.log('visual-overlay-check passed')
await browser.close()
