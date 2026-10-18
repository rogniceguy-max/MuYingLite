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

await page.goto('http://localhost:3001/', { waitUntil: 'networkidle' })
await wait(700)
console.log(
  'project card top/index/date:',
  await page.locator('.project-card-top').count(),
  await page.locator('.project-index').count(),
  await page.locator('.project-date').count(),
)
console.log('project meta:', await page.locator('.project-card-meta').first().innerText())
await page.screenshot({
  path: 'screenshots/35-project-list-many.png',
  fullPage: false,
})

await page.locator('.project-card').first().click()
await page.waitForSelector('.sheet-table', { timeout: 15000 })
await wait(900)
console.log('episodes:', await page.locator('.nav-episode').count())
const sidebarMetrics = await page.locator('.sidebar').evaluate((element) => ({
  clientHeight: element.clientHeight,
  scrollHeight: element.scrollHeight,
  offsetWidth: element.offsetWidth,
  clientWidth: element.clientWidth,
}))
console.log('sidebar metrics:', sidebarMetrics)
await page.screenshot({
  path: 'screenshots/36-many-episodes.png',
  fullPage: false,
})

await page.getByRole('button', { name: /文件库/ }).first().click()
await page.waitForSelector('.file-manager', { timeout: 15000 })
await wait(900)
console.log(
  'file manager:',
  await page.locator('.file-tree-node').count(),
  await page.locator('.file-row').count(),
)
await page.screenshot({
  path: 'screenshots/37-file-manager.png',
  fullPage: false,
})

await page.getByRole('button', { name: '第1集', exact: true }).first().click()
await wait(600)
console.log(
  'after open episode folder:',
  await page.locator('.file-row.folder-row').allInnerTexts(),
)
await page.locator('.file-row.folder-row').filter({ hasText: '第1拍' }).first().click()
await wait(600)
const fileRow = page.locator('.file-row').filter({ hasText: 'flower.mp4' }).first()
console.log('file row count:', await fileRow.count())
await fileRow.dblclick()
await page.getByRole('dialog').waitFor({ state: 'visible' })
await wait(500)
await page.screenshot({
  path: 'screenshots/38-file-manager-viewer.png',
  fullPage: false,
})
await page.getByRole('dialog').getByRole('button').first().click()
await wait(300)

await fileRow.click({ button: 'right' })
await wait(300)
console.log(
  'file context items:',
  await page.getByRole('menuitem', { name: '下载' }).count(),
  await page.getByRole('menuitem', { name: '重命名' }).count(),
  await page.getByRole('menuitem', { name: '删除' }).count(),
)
await page.screenshot({
  path: 'screenshots/39-file-manager-context.png',
  fullPage: false,
})
console.log('errors:', errors.slice(0, 8))
await browser.close()
