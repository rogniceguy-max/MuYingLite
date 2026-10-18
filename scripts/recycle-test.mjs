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
await page.locator('.asset-nav').click()
await page.waitForSelector('.asset-table', { timeout: 15000 })
await wait(800)

console.log('rows before:', await page.locator('.sheet-row').count())
const targetRow = page.locator('.sheet-row').nth(4)
await targetRow.hover()
await targetRow.locator('.row-actions-cell button').click({ force: true })
await page.getByRole('dialog').getByRole('button', { name: '删除' }).click()
await wait(2200)
console.log('rows after delete:', await page.locator('.sheet-row').count())

await page.getByRole('button', { name: /回收站/ }).first().click()
await page.waitForSelector('.recycle-card, .library-empty', { timeout: 15000 })
await wait(1000)
console.log('batches:', await page.locator('.recycle-card').count())
console.log(
  'recycle body:',
  (await page.locator('.recycle-page').innerText()).slice(0, 1200),
)
await page.screenshot({
  path: 'screenshots/08-recycle-bin.png',
  fullPage: false,
})

const restore = page.getByRole('button', { name: '恢复' }).first()
if ((await restore.count()) > 0) {
  await restore.click()
  await wait(1800)
  console.log('restored')
}

await page.locator('.asset-nav').click()
await page.waitForSelector('.asset-table', { timeout: 15000 })
await wait(800)
console.log('rows after restore:', await page.locator('.sheet-row').count())
await browser.close()
