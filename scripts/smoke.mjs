import { chromium } from 'playwright-core'

const browserPath =
  process.env.BROWSER_PATH ||
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'

const browser = await chromium.launch({
  executablePath: browserPath,
  headless: true,
})
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
})

page.on('console', (message) => {
  if (message.type() === 'error') {
    console.log('CONSOLE ERROR:', message.text())
  }
})
page.on('pageerror', (error) => {
  console.log('PAGE ERROR:', error.message)
})

await page.goto('http://localhost:3001/', { waitUntil: 'networkidle' })
console.log('TITLE:', await page.title())
console.log('BODY:', (await page.locator('body').innerText()).slice(0, 1200))
await page.screenshot({
  path: 'screenshots/01-project-list.png',
  fullPage: true,
})
await browser.close()
