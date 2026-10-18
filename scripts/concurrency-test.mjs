import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'

const browser = await chromium.launch({
  executablePath:
    process.env.BROWSER_PATH ||
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: true,
})

const contextA = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
})
const contextB = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
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
  await page.waitForTimeout(1000)
}

await openProject(pageA)
await openProject(pageB)

const storyA = pageA
  .locator('.sheet-row')
  .nth(3)
  .locator('textarea.cell-textarea')
  .nth(0)
const storyB = pageB
  .locator('.sheet-row')
  .nth(3)
  .locator('textarea.cell-textarea')
  .nth(0)
await storyA.fill('')
await pageA.waitForTimeout(500)
await storyA.click()
await storyB.click()
await storyA.evaluate((element) => {
  element.focus()
  element.setSelectionRange(element.value.length, element.value.length)
})
await storyB.evaluate((element) => {
  element.focus()
  element.setSelectionRange(element.value.length, element.value.length)
})

await Promise.all([
  storyA.pressSequentially('A端输入', { delay: 30 }),
  storyB.pressSequentially('B端输入', { delay: 30 }),
])
await pageA.waitForTimeout(1200)
const valueA = await storyA.inputValue()
const valueB = await storyB.inputValue()
console.log({ valueA, valueB })
assert.equal(valueA, valueB)
const expectedChars = Array.from('A端输入B端输入').sort().join('')
const actualChars = Array.from(valueA).sort().join('')
assert.equal(actualChars, expectedChars)

// Clear the scratch row.
await storyA.fill('')
await pageA.waitForTimeout(700)
assert.equal(await storyA.inputValue(), '')
assert.equal(await storyB.inputValue(), '')
console.log('same-cell concurrent merge passed')

// Re-test selected/alternate swap after the projection fix.
await pageA.locator('.asset-nav').click()
await pageA.waitForSelector('.asset-table', { timeout: 15000 })
await pageA.waitForTimeout(900)
const firstRow = pageA.locator('.sheet-row').nth(0)
const selectedAltBefore = await firstRow
  .locator('.selected-thumb img')
  .getAttribute('alt')
const alternateAltBefore = await firstRow
  .locator('.alternate-thumb img')
  .getAttribute('alt')
console.log({ selectedAltBefore, alternateAltBefore })

await firstRow.locator('.alternate-thumb').first().click()
const viewer = pageA.getByRole('dialog')
await viewer.waitFor({ state: 'visible' })
const setSelected = viewer.getByRole('button', { name: '设为选定' })
assert.equal(await setSelected.count(), 1)
await setSelected.click()
await pageA.waitForTimeout(1400)

const selectedAltAfter = await firstRow
  .locator('.selected-thumb img')
  .getAttribute('alt')
const alternateAltAfter = await firstRow
  .locator('.alternate-thumb img')
  .getAttribute('alt')
console.log({ selectedAltAfter, alternateAltAfter })
assert.equal(selectedAltAfter, alternateAltBefore)
assert.equal(alternateAltAfter, selectedAltBefore)

await pageA.screenshot({
  path: 'screenshots/04d-asset-selected.png',
  fullPage: false,
})

const projectId = new URL(pageA.url()).pathname.split('/')[2]
const media = await fetch(
  `http://localhost:3001/api/projects/${projectId}/media?kind=image`,
).then((response) => response.json())
const shenlan = media.items
  .filter((item) => item.displayName.includes('shenlan'))
  .map((item) => ({ name: item.displayName, usage: item.usageCount }))
console.log('shenlan usage:', shenlan)

await browser.close()
