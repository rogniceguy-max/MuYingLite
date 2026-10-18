import { chromium } from 'playwright-core'

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

page.on('console', (message) => {
  if (message.type() === 'error') console.log('CONSOLE ERROR:', message.text())
})
page.on('pageerror', (error) => console.log('PAGE ERROR:', error.message))

await page.goto('http://localhost:3001/', { waitUntil: 'networkidle' })
await page.getByRole('button', { name: /创建第一个项目|新建项目/ }).first().click()
await page.getByLabel('项目名称').fill('雾港')
await page.getByLabel('第一集标题（可选）').fill('潮汐')
await page.getByRole('button', { name: '创建项目' }).click()

await page.waitForURL(/\/projects\/[^/]+\/sheets\/[^/]+/, { timeout: 15000 })
await page.waitForSelector('.sheet-table', { timeout: 15000 })
await page.waitForTimeout(1200)

console.log('URL:', page.url())
console.log('ROWS:', await page.locator('.sheet-row').count())
console.log(
  'BODY:',
  (await page.locator('.workspace').innerText()).slice(0, 1800),
)
await page.screenshot({
  path: 'screenshots/02-beat-sheet.png',
  fullPage: false,
})
await browser.close()
