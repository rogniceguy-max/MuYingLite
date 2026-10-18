import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'

const base = 'http://localhost:3001'
const viewports = [
  { width: 1280, height: 800 },
  { width: 1440, height: 900 },
  { width: 2560, height: 1392 },
]

const browser = await chromium.launch({
  executablePath:
    process.env.BROWSER_PATH ||
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: true,
})

for (const viewport of viewports) {
  const page = await browser.newPage({ viewport })
  await page.addInitScript(() => localStorage.setItem('frame-theme', 'light'))
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })

  await page.goto(base + '/', { waitUntil: 'networkidle' })
  await page.waitForSelector('.project-card')
  await page.evaluate(() => document.fonts.ready)
  const root = await page.evaluate(() => {
    const style = (selector) => {
      const element = document.querySelector(selector)
      return element ? getComputedStyle(element) : null
    }
    return {
      body: style('body')?.fontSize,
      fontFamily: style('body')?.fontFamily,
      miSans: document.fonts.check('16px MiSans'),
      brand: style('.brand-name')?.fontSize,
      projectName: style('.project-card-name')?.fontSize,
      section: style('.section-heading')?.fontSize,
      documentOverflow:
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth + 1,
    }
  })
  console.log(viewport.width, 'root', root)
  assert.equal(root.body, '16px')
  assert.ok(root.fontFamily.includes('MiSans'))
  assert.equal(root.miSans, true)
  assert.equal(root.brand, '18px')
  assert.equal(root.projectName, '18px')
  assert.equal(root.section, '14px')
  assert.equal(root.documentOverflow, false)

  await page.locator('.project-card').first().click()
  await page.waitForSelector('.sheet-table', { timeout: 15000 })
  await page.waitForTimeout(500)
  const beat = await page.evaluate(() => {
    const scroll = document.querySelector('.table-scroll')
    const shell = document.querySelector('.table-shell')
    const th = document.querySelector('.beat-table thead th')
    const td = document.querySelector('.beat-table tbody td')
    return {
      tableScrollWidth: scroll?.scrollWidth ?? 0,
      tableClientWidth: scroll?.clientWidth ?? 0,
      shellWidth: shell?.getBoundingClientRect().width ?? 0,
      thFont: th ? getComputedStyle(th).fontSize : null,
      thAlign: th ? getComputedStyle(th).textAlign : null,
      tdFont: td ? getComputedStyle(td).fontSize : null,
      contentWidth:
        document.querySelector('.workspace-content')?.getBoundingClientRect()
          .width ?? 0,
      documentOverflow:
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth + 1,
    }
  })
  console.log(viewport.width, 'beat', beat)
  assert.equal(beat.thFont, '14px')
  assert.equal(beat.thAlign, 'center')
  assert.equal(beat.tdFont, '16px')
  assert.ok(beat.tableScrollWidth <= beat.tableClientWidth + 1)
  assert.equal(beat.documentOverflow, false)
  if (viewport.width === 2560) {
    assert.ok(beat.contentWidth > 2200, 'content should fill 2560 workspace')
    assert.ok(beat.shellWidth > 2100, 'table should fill 2560 workspace')
  }

  await page.locator('.asset-nav').click()
  await page.waitForSelector('.asset-table', { timeout: 15000 })
  await page.waitForTimeout(400)
  const assetScroll = await page.evaluate(() => {
    const scroll = document.querySelector('.table-scroll')
    return {
      width: scroll?.scrollWidth ?? 0,
      client: scroll?.clientWidth ?? 0,
    }
  })
  assert.ok(assetScroll.width <= assetScroll.client + 1)

  await page
    .locator('.sidebar')
    .getByRole('button', { name: '文件库' })
    .click()
  await page.waitForSelector('.file-manager', { timeout: 15000 })
  await page.waitForTimeout(400)
  const library = await page.evaluate(() => {
    const grid = document.querySelector('.file-grid')
    const name = document.querySelector('.file-card-name')
    const meta = document.querySelector('.file-card-meta')
    return {
      width: grid?.scrollWidth ?? 0,
      client: grid?.clientWidth ?? 0,
      nameFont: name ? getComputedStyle(name).fontSize : null,
      metaFont: meta ? getComputedStyle(meta).fontSize : null,
    }
  })
  console.log(viewport.width, 'library', library)
  assert.ok(library.width <= library.client + 1)
  assert.equal(library.nameFont, '16px')
  assert.equal(library.metaFont, '14px')

  await page.locator('.folder-card').first().click({ button: 'right' })
  await page.getByRole('menu').waitFor()
  const menuFont = await page
    .locator('.MuiMenuItem-root')
    .first()
    .evaluate((element) => getComputedStyle(element).fontSize)
  assert.equal(menuFont, '18px')
  await page.keyboard.press('Escape')

  await page
    .locator('.sidebar')
    .getByRole('button', { name: '回收站' })
    .click()
  await page.waitForSelector('.file-manager', { timeout: 15000 })
  await page.waitForTimeout(400)
  const recycle = await page.evaluate(() => {
    const grid = document.querySelector('.file-grid')
    return {
      width: grid?.scrollWidth ?? 0,
      client: grid?.clientWidth ?? 0,
      documentOverflow:
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth + 1,
    }
  })
  assert.ok(recycle.width <= recycle.client + 1)
  assert.equal(recycle.documentOverflow, false)
  assert.deepEqual(errors, [])
  await page.close()
}

await browser.close()
console.log('typography-layout-test passed')
