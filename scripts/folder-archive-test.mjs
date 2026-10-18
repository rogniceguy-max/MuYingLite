import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright-core'

function readZipEntries(buffer) {
  let eocd = -1
  const stop = Math.max(0, buffer.length - 65557)
  for (let index = buffer.length - 22; index >= stop; index -= 1) {
    if (buffer.readUInt32LE(index) === 0x06054b50) {
      eocd = index
      break
    }
  }
  if (eocd < 0) throw new Error('ZIP end of central directory not found')

  const count = buffer.readUInt16LE(eocd + 10)
  let offset = buffer.readUInt32LE(eocd + 16)
  const entries = []
  for (let index = 0; index < count; index += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error('Invalid ZIP central directory entry')
    }
    const flags = buffer.readUInt16LE(offset + 8)
    const nameLength = buffer.readUInt16LE(offset + 28)
    const extraLength = buffer.readUInt16LE(offset + 30)
    const commentLength = buffer.readUInt16LE(offset + 32)
    const name = buffer
      .subarray(offset + 46, offset + 46 + nameLength)
      .toString('utf8')
    entries.push({ name, flags })
    offset += 46 + nameLength + extraLength + commentLength
  }
  return entries
}

const browser = await chromium.launch({
  executablePath:
    process.env.BROWSER_PATH ||
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: true,
})
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  acceptDownloads: true,
})
await page.addInitScript(() => localStorage.setItem('frame-theme', 'dark'))
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text())
})

await page.goto('http://localhost:3001/', { waitUntil: 'networkidle' })
await page.locator('.project-card').first().click()
await page.waitForSelector('.sheet-table', { timeout: 15000 })
await page
  .locator('.sidebar')
  .getByRole('button', { name: '文件库' })
  .click()
await page.waitForSelector('.file-manager', { timeout: 15000 })
await page.waitForTimeout(600)

const folder = page.locator('.folder-card').filter({ hasText: '第1集' }).first()
assert.equal(await folder.count(), 1)
await folder.click({ button: 'right' })
await page.getByRole('menu').waitFor()
const menuText = await page.getByRole('menu').innerText()
assert.match(menuText, /下载文件夹/)
assert.match(menuText, /1 个文件/)

const downloadPromise = page.waitForEvent('download', { timeout: 30000 })
await page.getByRole('menuitem', { name: /下载文件夹/ }).click()
const download = await downloadPromise
assert.equal(download.suggestedFilename(), '第1集.zip')
const zipPath = path.join(os.tmpdir(), 'muying-folder-archive-test.zip')
await download.saveAs(zipPath)

await page.waitForSelector('.archive-progress', { timeout: 15000 })
const panelText = await page.locator('.archive-progress').innerText()
assert.match(panelText, /第1集/)

const entries = readZipEntries(fs.readFileSync(zipPath))
assert.deepEqual(
  entries.map((entry) => entry.name),
  ['第1集/第1拍/flower.mp4'],
)
assert.ok(entries.every((entry) => entry.flags & 0x800), 'entry names must be UTF-8')
assert.deepEqual(errors, [])
await page.screenshot({ path: 'screenshots/112-folder-archive-test.png' })
console.log('folder archive entries:', entries.map((entry) => entry.name))
console.log('folder-archive-test passed')
await browser.close()
