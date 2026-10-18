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

await page.goto('http://localhost:3001/', { waitUntil: 'networkidle' })
await page.locator('.project-card').first().click()
await page.waitForSelector('.sheet-table', { timeout: 15000 })
await wait(800)

// Add Episode 2.
await page.getByRole('button', { name: /新增一集/ }).click()
await page.getByLabel('集号').fill('2')
await page.getByLabel('集标题（可选）').fill('暗流')
await page.getByRole('dialog').getByRole('button', { name: '保存' }).click()
await page.waitForSelector('.sheet-row', { timeout: 15000 })
await wait(1000)
console.log('episode2 rows:', await page.locator('.sheet-row').count())

// Back to Episode 1.
await page.locator('.nav-episode').first().locator('.episode-main').click()
await page.waitForSelector('.sheet-table', { timeout: 15000 })
await wait(800)

const rows = page.locator('.sheet-row')
const content = [
  {
    scene: '01 雾港 · 码头',
    story: '沈岚在雾中抵达码头。罗盘第一次指向错误的方向，她却像早就知道一样没有回头。',
    plan: '开场用环境声压住对白，保留潮汐和铁链的声音。',
    mark: '红色',
    note: '罗盘方向不对，先记下。',
  },
  {
    scene: '02 旧仓库',
    story: '她找到父亲的航海日志，发现被撕去的一页，只剩一枚生锈的订书钉。',
    plan: '闪回控制在一分钟内，不给父亲正脸。',
    mark: '黄色',
    note: '',
  },
  {
    scene: '03 船坞',
    story: '守夜人认出罗盘，沉默了很久，只说了一句：这东西不该还在你手里。',
    plan: '保留沉默，不解释。把答案留到第三集。',
    mark: '绿色',
    note: '',
  },
]

for (let index = 0; index < content.length; index += 1) {
  const row = rows.nth(index)
  const data = content[index]
  await row.locator('input.cell-input').first().fill(data.scene)
  const textareas = row.locator('textarea.cell-textarea')
  await textareas.nth(0).fill(data.story)
  await textareas.nth(1).fill(data.plan)
  await row.locator('.mark-cell').click()
  await page.getByRole('menuitem', { name: new RegExp(data.mark) }).click()
  if (data.note) {
    await row.locator('.note-display').click()
    const note = row.locator('.note-textarea')
    await note.fill(data.note)
    await note.blur()
  }
  await wait(150)
}

await wait(800)

// Add a video to beat 1.
const firstRow = rows.nth(0)
await firstRow.locator('.add-media-button').click()
const picker = page.getByRole('dialog')
await picker.waitFor({ state: 'visible' })
await picker
  .locator('input[type=file]')
  .setInputFiles(path.resolve('data/samples/flower.mp4'))
await wait(2200)
console.log('video cards:', await page.locator('.video-card').count())
console.log('picker visible:', await picker.isVisible().catch(() => false))

// Add a media mention in the note.
await firstRow.locator('.note-display').click()
const note = firstRow.locator('.note-textarea')
await note.fill('罗盘方向不对，参考 @')
await wait(300)
console.log('mention options:', await page.locator('.mention-option').count())
if ((await page.locator('.mention-option').count()) > 0) {
  await page.locator('.mention-option').first().click()
}
await note.blur()
await wait(500)

await page.screenshot({
  path: 'screenshots/03-beat-filled.png',
  fullPage: false,
})
console.log('saved beat screenshot')

await browser.close()
