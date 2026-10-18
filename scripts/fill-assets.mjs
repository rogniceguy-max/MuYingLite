import path from 'node:path'
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

async function addRow() {
  await page
    .locator('.sheet-toolbar-actions button')
    .filter({ hasText: '添加行' })
    .click()
  await wait(250)
}

async function fillRow(index, data) {
  const row = page.locator('.sheet-row').nth(index)
  const inputs = row.locator('input.cell-input')
  await inputs.nth(0).fill(data.category)
  await inputs.nth(1).fill(data.name)

  if (data.episodes?.length) {
    await row.locator('.episode-add').click()
    await wait(200)
    for (const number of data.episodes) {
      const item = page
        .getByRole('menuitem')
        .filter({ hasText: new RegExp(`第${number}集`) })
      await item.first().click()
      await wait(120)
    }
    await page.keyboard.press('Escape')
    await wait(200)
  }

  if (data.selected) {
    const choose = row
      .locator('.selected-image-cell button')
      .filter({ hasText: /选择图片|更换/ })
    await choose.first().click()
    const dialog = page.getByRole('dialog')
    await dialog.waitFor({ state: 'visible' })
    await dialog
      .locator('input[type=file]')
      .setInputFiles(path.resolve('data/samples', data.selected))
    await wait(1800)
    await dialog.waitFor({ state: 'hidden' }).catch(() => {})
  }

  if (data.alternate) {
    await row.locator('.alternate-add').click()
    const dialog = page.getByRole('dialog')
    await dialog.waitFor({ state: 'visible' })
    await dialog
      .locator('input[type=file]')
      .setInputFiles(path.resolve('data/samples', data.alternate))
    await wait(1800)
    await dialog.waitFor({ state: 'hidden' }).catch(() => {})
  }
}

await page.goto('http://localhost:3001/', { waitUntil: 'networkidle' })
await page.locator('.project-card').first().click()
await page.waitForSelector('.sheet-table', { timeout: 15000 })
await wait(700)
await page.locator('.asset-nav').click()
await page.waitForSelector('.asset-table', { timeout: 15000 })
await wait(900)

const assets = [
  {
    category: '角色',
    name: '沈岚',
    episodes: [1, 2],
    selected: 'concept-shenlan-a.png',
    alternate: 'concept-shenlan-b.png',
  },
  {
    category: '场景',
    name: '雾港码头',
    episodes: [1],
    selected: 'concept-harbor.png',
  },
  {
    category: '道具',
    name: '铜制罗盘',
    episodes: [1, 2],
    selected: 'concept-compass.png',
  },
  {
    category: '服装',
    name: '海员大衣',
    episodes: [2],
    selected: 'concept-coat.png',
  },
  {
    category: '场景',
    name: '旧仓库',
    episodes: [2],
    selected: 'concept-warehouse.png',
  },
]

for (let index = 0; index < assets.length; index += 1) {
  await addRow()
  await fillRow(index, assets[index])
  console.log('filled asset row', index + 1)
}

await wait(1200)
console.log('rows:', await page.locator('.sheet-row').count())
await page.screenshot({
  path: 'screenshots/04-asset-filled.png',
  fullPage: false,
})

// Open the alternate image and verify the "set selected" flow.
const firstRow = page.locator('.sheet-row').nth(0)
await firstRow.locator('.alternate-thumb').first().click()
const viewer = page.getByRole('dialog')
await viewer.waitFor({ state: 'visible' })
await wait(500)
await page.screenshot({
  path: 'screenshots/05-image-viewer.png',
  fullPage: false,
})
const setSelectedButton = viewer.getByRole('button', { name: '设为选定' })
console.log('set selected button:', await setSelectedButton.count())
if ((await setSelectedButton.count()) > 0) {
  await setSelectedButton.click()
  await wait(800)
}
await page.screenshot({
  path: 'screenshots/04b-asset-after-select.png',
  fullPage: false,
})

await browser.close()
