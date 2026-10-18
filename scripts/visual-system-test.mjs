import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'

const base = 'http://localhost:3001'
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
await page.addInitScript(() => localStorage.setItem('frame-theme', 'dark'))

const errors = []
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text())
})
page.on('pageerror', (error) => errors.push(error.message))

const wait = (ms) => page.waitForTimeout(ms)

async function metrics(label) {
  const result = await page.evaluate(() => {
    const rect = (selector) => {
      const element = document.querySelector(selector)
      if (!element) return null
      const box = element.getBoundingClientRect()
      return {
        x: Math.round(box.x),
        y: Math.round(box.y),
        width: Math.round(box.width),
        height: Math.round(box.height),
        bottom: Math.round(box.bottom),
        right: Math.round(box.right),
      }
    }
    const content = document.querySelector('.workspace-content')
    const style = content ? getComputedStyle(content) : null
    return {
      viewport: { width: innerWidth, height: innerHeight },
      scroll: {
        width: document.documentElement.scrollWidth,
        height: document.documentElement.scrollHeight,
      },
      topbar: rect('.topbar'),
      content: rect('.workspace-content'),
      table: rect('.table-shell'),
      fileManager: rect('.file-manager'),
      contentPadding: style
        ? {
            top: style.paddingTop,
            right: style.paddingRight,
            bottom: style.paddingBottom,
            left: style.paddingLeft,
          }
        : null,
      theme: document.documentElement.dataset.theme,
      favicon: document.querySelector('link[rel="icon"]')?.getAttribute('href'),
    }
  })
  console.log(label, JSON.stringify(result))
  assert.ok(
    result.scroll.width <= result.viewport.width + 1,
    `${label}: horizontal overflow ${result.scroll.width} > ${result.viewport.width}`,
  )
  return result
}

async function screenshot(name) {
  await wait(350)
  await page.screenshot({ path: `screenshots/${name}.png` })
}

async function toggleTheme() {
  const button = page.locator(
    'button[aria-label="切换浅色主题"], button[aria-label="切换深色主题"]',
  )
  await button.first().click()
  await wait(250)
}

await page.goto(base + '/', { waitUntil: 'networkidle' })
await page.waitForSelector('.project-card')
const rootMetrics = await metrics('root-dark-1440')
assert.equal(rootMetrics.topbar, null)
assert.equal(rootMetrics.favicon, '/favicon.svg')
await screenshot('80-root-dark-1440')

await toggleTheme()
assert.equal(
  await page.evaluate(() => document.documentElement.dataset.theme),
  'light',
)
await screenshot('81-root-light-1440')
await toggleTheme()

await page.locator('.project-card').first().click()
await page.waitForSelector('.sheet-table', { timeout: 15000 })
await wait(800)
const beatMetrics = await metrics('beat-dark-1440')
assert.equal(beatMetrics.topbar.height, 56)
assert.equal(beatMetrics.contentPadding.left, '24px')
assert.ok(beatMetrics.table.height > 500, 'beat table should fill the viewport')
assert.ok(
  beatMetrics.table.bottom <= beatMetrics.viewport.height,
  'beat table should not extend below the viewport',
)
await screenshot('82-beat-dark-1440')

await toggleTheme()
await screenshot('83-beat-light-1440')
await toggleTheme()

await page.locator('.asset-nav').click()
await page.waitForSelector('.asset-table', { timeout: 15000 })
await wait(700)
await screenshot('84-asset-dark-1440')

await page
  .locator('.sidebar')
  .getByRole('button', { name: '文件库' })
  .click()
await page.waitForSelector('.file-manager', { timeout: 15000 })
await wait(700)
const libraryMetrics = await metrics('library-dark-1440')
assert.ok(
  libraryMetrics.fileManager.height > 650,
  'file manager should fill the viewport',
)
assert.ok(libraryMetrics.fileManager.bottom <= libraryMetrics.viewport.height)
await screenshot('85-library-dark-1440')

await page
  .locator('.sidebar')
  .getByRole('button', { name: '回收站' })
  .click()
await page.waitForSelector('.file-manager', { timeout: 15000 })
await wait(700)
await metrics('recycle-dark-1440')
await screenshot('86-recycle-dark-1440')

await page
  .locator('.sidebar')
  .getByRole('button', { name: '项目设置' })
  .click()
await page.waitForSelector('.settings-page', { timeout: 15000 })
await wait(500)
await metrics('settings-dark-1440')
await screenshot('87-settings-dark-1440')

await page.setViewportSize({ width: 1280, height: 800 })
await page.goto(base + '/', { waitUntil: 'networkidle' })
await page.locator('.project-card').first().click()
await page.waitForSelector('.sheet-table', { timeout: 15000 })
await wait(700)
const beatSmall = await metrics('beat-dark-1280')
assert.ok(beatSmall.table.height > 420)
await screenshot('88-beat-dark-1280')

await page.setViewportSize({ width: 1920, height: 1080 })
await page
  .locator('.sidebar')
  .getByRole('button', { name: '文件库' })
  .click()
await page.waitForSelector('.file-manager', { timeout: 15000 })
await wait(700)
const libraryLarge = await metrics('library-dark-1920')
assert.ok(libraryLarge.fileManager.height > 800)
await screenshot('89-library-dark-1920')

assert.deepEqual(errors, [], `console errors: ${errors.join('\n')}`)
console.log('visual-system-test passed')
await browser.close()
