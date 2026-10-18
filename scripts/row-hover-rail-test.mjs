import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'
import sharp from 'sharp'

const base = 'http://localhost:3001'
const browser = await chromium.launch({
  executablePath:
    process.env.BROWSER_PATH ||
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: true,
})

const errors = []

async function sample(buffer, x, y) {
  const { data, info } = await sharp(buffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const index = (Math.round(y) * info.width + Math.round(x)) * 4
  return [data[index], data[index + 1], data[index + 2]]
}

for (const theme of ['dark', 'light']) {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 600 },
    deviceScaleFactor: 1,
  })
  await page.addInitScript(
    (mode) => localStorage.setItem('frame-theme', mode),
    theme,
  )
  page.on('pageerror', (error) => errors.push(`${theme}: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`${theme}: ${message.text()}`)
  })

  await page.goto(base + '/', { waitUntil: 'networkidle' })
  await page.locator('.project-card').first().click()
  await page.waitForSelector('.sheet-table', { timeout: 15000 })
  await page.waitForTimeout(800)
  await page.evaluate(() => {
    const scroller = document.querySelector('.table-scroll')
    if (scroller) scroller.scrollLeft = scroller.scrollWidth
  })

  // Use an empty row so the last cell background is uniform.
  await page.locator('.sheet-row').nth(3).hover()
  await page.waitForTimeout(300)

  const geometry = await page.evaluate(() => {
    const rail = document.querySelector('.row-hover-rail')
    const row = document.querySelectorAll('.sheet-row')[3]
    const frame = document.querySelector('.table-shell')
    const scroll = document.querySelector('.table-scroll')
    if (!rail || !row || !frame || !scroll) return null
    const railRect = rail.getBoundingClientRect()
    const rowRect = row.getBoundingClientRect()
    const frameRect = frame.getBoundingClientRect()
    const scrollRect = scroll.getBoundingClientRect()
    return {
      display: getComputedStyle(rail).display,
      rail: {
        top: railRect.top,
        left: railRect.left,
        right: railRect.right,
        width: railRect.width,
        height: railRect.height,
      },
      row: { top: rowRect.top, height: rowRect.height },
      frame: { top: frameRect.top, left: frameRect.left },
      scroll: { right: scrollRect.right },
    }
  })

  assert.ok(geometry, `${theme}: expected rail geometry`)
  assert.equal(geometry.display, 'block', `${theme}: rail should be visible`)
  assert.ok(
    Math.abs(geometry.rail.top - geometry.row.top) <= 0.5,
    `${theme}: rail top does not match row`,
  )
  assert.ok(
    Math.abs(geometry.rail.height - geometry.row.height) <= 0.5,
    `${theme}: rail height does not match row`,
  )
  assert.ok(
    Math.abs(geometry.rail.right - geometry.scroll.right) <= 0.5,
    `${theme}: rail does not cover the scrollbar gutter`,
  )

  const tableShot = await page.locator('.table-shell').screenshot()
  const sampleY = geometry.rail.top - geometry.frame.top + geometry.row.height / 2
  const railX = geometry.rail.left - geometry.frame.left + geometry.rail.width / 2
  const rowX = railX - 40
  const [rowR, rowG, rowB] = await sample(tableShot, rowX, sampleY)
  const [railR, railG, railB] = await sample(tableShot, railX, sampleY)
  const distance = Math.max(
    Math.abs(rowR - railR),
    Math.abs(rowG - railG),
    Math.abs(rowB - railB),
  )
  console.log(theme, { row: [rowR, rowG, rowB], rail: [railR, railG, railB], distance })
  assert.ok(distance <= 1, `${theme}: rail color does not match row hover`)

  await page.mouse.move(10, 300)
  await page.waitForTimeout(250)
  assert.equal(
    await page.evaluate(
      () => getComputedStyle(document.querySelector('.row-hover-rail')).display,
    ),
    'none',
    `${theme}: rail should hide when leaving the table`,
  )

  await page.locator('.nav-episode .episode-main').nth(1).click()
  await page.waitForTimeout(900)
  assert.equal(
    await page.evaluate(
      () => getComputedStyle(document.querySelector('.row-hover-rail')).display,
    ),
    'none',
    `${theme}: rail should hide after switching sheets`,
  )

  await page.close()
}

assert.deepEqual(errors, [], `console errors: ${errors.join('\n')}`)
console.log('row-hover-rail-test passed')
await browser.close()
