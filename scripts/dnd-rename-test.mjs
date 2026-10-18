import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'

const base = 'http://localhost:3001'
const projectId = '01a14e37-8548-75b4-bcf6-010dd9763341'
const videoPath = path.resolve('data/samples/flower.mp4')
const imagePath = path.resolve('data/samples/concept-warehouse.png')
const videoBase64 = fs.readFileSync(videoPath).toString('base64')
const imageBase64 = fs.readFileSync(imagePath).toString('base64')

async function cleanupMedia(name) {
  const media = await fetch(
    `${base}/api/projects/${projectId}/media?q=${encodeURIComponent(name)}`,
  ).then((response) => response.json())
  const asset = media.items.find((item) => item.displayName === name)
  if (asset) {
    const deleted = await fetch(`${base}/api/media/${asset.id}`, {
      method: 'DELETE',
    }).then((response) => response.json())
    if (deleted.batchId) {
      await fetch(
        `${base}/api/projects/${projectId}/recycle-bin/${deleted.batchId}`,
        {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ confirm: 'DELETE' }),
        },
      )
    }
    return
  }
  const recycle = await fetch(
    `${base}/api/projects/${projectId}/recycle-bin`,
  ).then((response) => response.json())
  const batch = recycle.batches.find((item) =>
    item.media.some((mediaItem) => mediaItem.displayName === name),
  )
  if (batch) {
    await fetch(
      `${base}/api/projects/${projectId}/recycle-bin/${batch.id}`,
      {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: 'DELETE' }),
      },
    )
  }
}

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
const errors = []
for (const [name, page] of [
  ['A', pageA],
  ['B', pageB],
]) {
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`${name}: ${message.text()}`)
  })
  page.on('pageerror', (error) => errors.push(`${name}: ${error.message}`))
}

async function openProject(page) {
  await page.goto(base + '/', { waitUntil: 'networkidle' })
  await page.locator('.project-card').first().click()
  await page.waitForSelector('.sheet-table', { timeout: 15000 })
  await page.waitForTimeout(900)
}

await openProject(pageA)
await openProject(pageB)

// Drag a video file onto beat row 4 (index 3).
const beforeVideos = await pageA
  .locator('.sheet-row')
  .nth(3)
  .locator('.video-card')
  .count()
await pageA.evaluate(
  ({ base64 }) => {
    const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))
    const file = new File([bytes], 'drop-test.mp4', { type: 'video/mp4' })
    const dataTransfer = new DataTransfer()
    dataTransfer.items.add(file)
    const row = document.querySelectorAll('.sheet-row')[3]
    const options = {
      bubbles: true,
      cancelable: true,
      dataTransfer,
    }
    row.dispatchEvent(new DragEvent('dragover', options))
    row.dispatchEvent(new DragEvent('drop', options))
  },
  { base64: videoBase64 },
)
await pageA.waitForTimeout(3200)
const afterVideos = await pageA
  .locator('.sheet-row')
  .nth(3)
  .locator('.video-card')
  .count()
console.log({ beforeVideos, afterVideos })
assert.ok(afterVideos > beforeVideos)
const beatDropPath = path.resolve(
  'data/uploads/projects',
  projectId,
  '第1集',
  '第4拍',
  'drop-test.mp4',
)
console.log('beat drop path exists:', fs.existsSync(beatDropPath))
assert.equal(fs.existsSync(beatDropPath), true)

// Remove the dropped video via right-click.
const newVideo = pageA
  .locator('.sheet-row')
  .nth(3)
  .locator('.video-card')
  .last()
await newVideo.click({ button: 'right' })
await pageA.getByRole('menuitem', { name: '移除' }).click()
await pageA.waitForTimeout(1800)
await cleanupMedia('drop-test.mp4')

// Asset sheet: drop an image onto row 1; it should go to alternates.
await pageA.locator('.asset-nav').click()
await pageA.waitForSelector('.asset-table', { timeout: 15000 })
await pageA.waitForTimeout(700)
const beforeAlternates = await pageA
  .locator('.sheet-row')
  .nth(0)
  .locator('.alternate-thumb')
  .count()
await pageA.evaluate(
  ({ base64 }) => {
    const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))
    const file = new File([bytes], 'asset-drop-test.png', {
      type: 'image/png',
    })
    const dataTransfer = new DataTransfer()
    dataTransfer.items.add(file)
    const row = document.querySelectorAll('.sheet-row')[0]
    const options = {
      bubbles: true,
      cancelable: true,
      dataTransfer,
    }
    row.dispatchEvent(new DragEvent('dragover', options))
    row.dispatchEvent(new DragEvent('drop', options))
  },
  { base64: imageBase64 },
)
await pageA.waitForTimeout(3200)
const afterAlternates = await pageA
  .locator('.sheet-row')
  .nth(0)
  .locator('.alternate-thumb')
  .count()
console.log({ beforeAlternates, afterAlternates })
assert.ok(afterAlternates > beforeAlternates)
const assetDropPath = path.resolve(
  'data/uploads/projects',
  projectId,
  '资产表',
  '角色',
  'asset-drop-test.png',
)
console.log('asset drop path exists:', fs.existsSync(assetDropPath))
assert.equal(fs.existsSync(assetDropPath), true)
const selectedAlt = await pageA
  .locator('.sheet-row')
  .nth(0)
  .locator('.selected-thumb img')
  .getAttribute('alt')
console.log('selected remains:', selectedAlt)
assert.match(String(selectedAlt), /concept-shenlan-a/)

// Remove the dropped alternate via right-click.
const newAlternate = pageA
  .locator('.sheet-row')
  .nth(0)
  .locator('.alternate-thumb')
  .last()
await newAlternate.click({ button: 'right' })
await pageA.getByRole('menuitem', { name: '移除' }).click()
await pageA.waitForTimeout(1800)
await cleanupMedia('asset-drop-test.png')

// No visible add buttons/placeholders.
console.log(
  'removed UI counts:',
  await pageA.evaluate(() => ({
    addMedia: document.querySelectorAll('.add-media-button').length,
    alternateAdd: document.querySelectorAll('.alternate-add').length,
    cellPlaceholder: document.querySelectorAll('.cell-placeholder').length,
  })),
)

// Add-row footer centering relative to the table shell.
await pageA.locator('.nav-episode').first().locator('.episode-main').click()
await pageA.waitForSelector('.sheet-table', { timeout: 15000 })
await pageA.waitForTimeout(700)
const centering = await pageA.evaluate(() => {
  const shell = document.querySelector('.table-shell')?.getBoundingClientRect()
  const button = document.querySelector('.table-add-row')?.getBoundingClientRect()
  if (!shell || !button) return null
  return {
    diff: Math.abs(
      button.left + button.width / 2 - (shell.left + shell.width / 2),
    ),
    shellWidth: shell.width,
    buttonCenter: button.left + button.width / 2,
    shellCenter: shell.left + shell.width / 2,
  }
})
console.log('add row centering:', centering)

// Sidebar scroll stability: brand stays fixed when the nav is scrolled.
const brandBefore = await pageA
  .locator('.sidebar .brand')
  .evaluate((element) => {
    const rect = element.getBoundingClientRect()
    return { top: rect.top, left: rect.left }
  })
await pageA.locator('.nav-episode').last().locator('.episode-main').click()
await pageA.waitForTimeout(900)
const brandAfter = await pageA
  .locator('.sidebar .brand')
  .evaluate((element) => {
    const rect = element.getBoundingClientRect()
    return { top: rect.top, left: rect.left }
  })
console.log({ brandBefore, brandAfter })
assert.deepEqual(brandAfter, brandBefore)

// Project rename with another client editing.
await pageA.locator('.nav-episode').first().locator('.episode-main').click()
await pageA.waitForSelector('.sheet-table', { timeout: 15000 })
await pageA.waitForTimeout(700)
const storyB = pageB
  .locator('.sheet-row')
  .nth(0)
  .locator('textarea.cell-textarea')
  .nth(0)
await storyB.click()
const storyBefore = await storyB.inputValue()
const urlBefore = pageB.url()
await pageA.locator('.sidebar-project-name').dblclick()
const renameDialog = pageA.getByRole('dialog')
await renameDialog.getByLabel('项目名').fill('雾港 · 重命名测试')
await renameDialog.getByRole('button', { name: '保存' }).click()
await pageA.waitForTimeout(1400)
const projectNameB = await pageB.locator('.sidebar-project-name').innerText()
const activeB = await pageB.evaluate(() => ({
  tag: document.activeElement?.tagName,
  className: document.activeElement?.className,
}))
const storyAfter = await storyB.inputValue()
console.log({ projectNameB, activeB, storyUnchanged: storyBefore === storyAfter })
assert.match(projectNameB, /雾港 · 重命名测试/)
assert.equal(activeB.tag, 'TEXTAREA')
assert.equal(storyAfter, storyBefore)
assert.equal(urlBefore, pageB.url())

// Rename back.
await pageA.locator('.sidebar-project-name').dblclick()
const renameBack = pageA.getByRole('dialog')
await renameBack.getByLabel('项目名').fill('雾港')
await renameBack.getByRole('button', { name: '保存' }).click()
await pageA.waitForTimeout(1200)

// Brand goes back to root.
await pageA.locator('.sidebar-brand').click()
await pageA.waitForURL(base + '/', { timeout: 10000 })
console.log('brand back URL:', pageA.url())
assert.equal(pageA.url(), base + '/')

console.log('errors:', errors.slice(0, 8))
await browser.close()
