import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'

const browser = await chromium.launch({
  executablePath:
    process.env.BROWSER_PATH ||
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: true,
})

const contextA = await browser.newContext({
  viewport: { width: 1440, height: 900 },
})
const contextB = await browser.newContext({
  viewport: { width: 1440, height: 900 },
})
const pageA = await contextA.newPage()
const pageB = await contextB.newPage()

for (const [name, page] of [
  ['A', pageA],
  ['B', pageB],
]) {
  page.on('console', (message) => {
    if (message.type() === 'error') console.log(`CONSOLE ${name}:`, message.text())
  })
  page.on('pageerror', (error) => console.log(`PAGE ${name}:`, error.message))
}

async function openProject(page) {
  await page.goto('http://localhost:3001/', { waitUntil: 'networkidle' })
  await page.locator('.project-card').first().click()
  await page.waitForSelector('.sheet-table', { timeout: 15000 })
  await page.waitForTimeout(1200)
}

await openProject(pageA)
await openProject(pageB)
await pageB.waitForTimeout(800)

assert.equal(await pageA.locator('.sheet-row').count(), 8)
assert.equal(await pageB.locator('.sheet-row').count(), 8)
console.log('peers on A:', await pageA.locator('.presence-dot').count())
console.log('peers on B:', await pageB.locator('.presence-dot').count())

const storyB = pageB
  .locator('.sheet-row')
  .nth(0)
  .locator('textarea.cell-textarea')
  .nth(0)
await storyB.click()
await storyB.evaluate((element) => {
  const textarea = element
  textarea.focus()
  textarea.setSelectionRange(4, 4)
})
const storyBefore = await storyB.inputValue()
const urlB = pageB.url()
const scrollBefore = await pageB
  .locator('.table-shell')
  .evaluate((element) => {
    element.scrollLeft = 140
    return element.scrollLeft
  })
await pageB.waitForTimeout(300)

// Rename from A.
const firstEpisode = pageA.locator('.nav-episode').first()
await firstEpisode.hover()
await firstEpisode.locator('.episode-more').click()
await pageA.getByRole('menuitem', { name: '重命名节拍表' }).click()
const renameDialog = pageA.getByRole('dialog')
await renameDialog.getByLabel('表名').fill('第1集 节拍表 · 定稿')
await renameDialog.getByRole('button', { name: '保存' }).click()
await pageA.waitForTimeout(1500)

const activeAfter = await pageB.evaluate(() => ({
  tag: document.activeElement?.tagName,
  className: document.activeElement?.className,
}))
const scrollAfter = await pageB
  .locator('.table-shell')
  .evaluate((element) => element.scrollLeft)
const titleB = await pageB.locator('.sheet-title-line h2').innerText()
const statusB = await pageB.locator('.status-pill').innerText()
const storyAfter = await storyB.inputValue()

console.log({
  activeAfter,
  scrollBefore,
  scrollAfter,
  titleB,
  statusB,
  storyUnchanged: storyBefore === storyAfter,
  urlUnchanged: urlB === pageB.url(),
})

assert.match(titleB, /定稿/)
assert.equal(activeAfter.tag, 'TEXTAREA')
assert.match(String(activeAfter.className), /cell-textarea/)
assert.equal(scrollAfter, scrollBefore)
assert.equal(storyAfter, storyBefore)
assert.equal(urlB, pageB.url())
assert.match(statusB, /已连接/)

await pageA.screenshot({
  path: 'screenshots/09-rename-isolation.png',
  fullPage: false,
})

// Rename back.
await firstEpisode.hover()
await firstEpisode.locator('.episode-more').click()
await pageA.getByRole('menuitem', { name: '重命名节拍表' }).click()
const renameBack = pageA.getByRole('dialog')
await renameBack.getByLabel('表名').fill('第1集 节拍表')
await renameBack.getByRole('button', { name: '保存' }).click()
await pageA.waitForTimeout(1200)

console.log('rename isolation passed')
await browser.close()
