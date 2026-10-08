
// Capture clean screenshots of the full workflow for the repo
const { chromium } = require('playwright')
const fs = require('fs')

const BASE = 'http://localhost:4590/NatureFit'
const OUT = 'D:/NatureFit/naturefit/docs/screenshots'
fs.mkdirSync(OUT, { recursive: true })
const realPng = fs.readFileSync('D:/NatureFit/naturefit/tests/fixtures/tree-photo.png')

;(async () => {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
  const page = await ctx.newPage()
  await page.goto(BASE)
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.waitForTimeout(800)

  // 01 landing
  await page.screenshot({ path: `${OUT}/01-landing.png` })

  // 02 create
  await page.getByText('Start a Quest').first().click()
  await page.waitForSelector('text=Create your quest')
  await page.screenshot({ path: `${OUT}/02-create-quest.png` })

  // 03 briefing
  await page.getByText('Generate my quest').click()
  await page.waitForSelector('.quest-hero-title')
  await page.screenshot({ path: `${OUT}/03-quest-briefing.png` })

  // 04 active task
  await page.getByText('Start quest').click()
  await page.waitForSelector('text=TASK 1 OF')
  await page.screenshot({ path: `${OUT}/04-active-task.png` })

  // 05 photo evidence added
  const input = page.locator('input[type="file"]')
  if ((await input.count()) > 0) {
    await input.setInputFiles({ name: 'tree.png', mimeType: 'image/png', buffer: realPng })
    await page.waitForSelector('text=Photo evidence added')
  }
  await page.screenshot({ path: `${OUT}/05-photo-evidence.png` })

  // 06 task complete flash
  await page.getByText('I did the movement').click()
  const btn = page.locator('button:has-text("Complete task")')
  await btn.click()
  await page.waitForSelector('text=Task complete')
  await page.screenshot({ path: `${OUT}/06-task-complete.png` })

  // 07 phone away
  await page.getByText('Next mission').click()
  await page.waitForTimeout(400)
  await page.getByText('Put phone away').click()
  await page.waitForSelector('text=The rest happens out there.')
  await page.screenshot({ path: `${OUT}/07-phone-away.png` })

  // 08 journal (complete remaining tasks first via restore)
  await page.locator('.phone-away').click({ position: { x: 10, y: 10 } })
  await page.waitForTimeout(400)

  // finish all tasks quickly
  for (let i = 2; i <= 4; i++) {
    const inp = page.locator('input[type="file"]')
    if ((await inp.count()) > 0) {
      await inp.setInputFiles({ name: `o${i}.png`, mimeType: 'image/png', buffer: realPng })
      await page.waitForTimeout(900)
    }
    for (const label of ['I did the movement', 'Skip timer']) {
      const mb = page.locator(`button:has-text("${label}")`)
      if (await mb.count()) { await mb.click(); await page.waitForTimeout(250) }
    }
    const b = page.locator('button:has-text("Complete task")')
    await page.waitForFunction(() => {
      const x = [...document.querySelectorAll('button')].find(y => y.textContent.includes('Complete task'))
      return x && !x.disabled
    }, { timeout: 8000 })
    await b.click()
    await page.waitForTimeout(500)
    const next = page.getByText('Next mission')
    const see = page.getByText('See the results')
    if (await next.count()) { await next.click(); await page.waitForTimeout(400) }
    else if (await see.count()) { await see.click(); await page.waitForTimeout(400) }
  }

  // 08 all-done → complete quest
  await page.waitForSelector('text=All tasks complete', { timeout: 8000 }).catch(() => {})
  const completeQuest = page.locator('button:has-text("Complete quest")')
  if (await completeQuest.count()) {
    await page.screenshot({ path: `${OUT}/07b-all-done.png` })
    await completeQuest.click()
  }
  await page.waitForSelector('text=Quest complete', { timeout: 8000 })
  await page.screenshot({ path: `${OUT}/08-results.png` })

  // 10 journal with history
  await page.getByText('View progress').click()
  await page.waitForSelector('text=Your outdoor journey')
  await page.screenshot({ path: `${OUT}/09-journal.png` })

  // 11 install prompt (simulate by dispatching beforeinstallprompt)
  await page.evaluate(() => {
    const e = new Event('beforeinstallprompt')
    e.prompt = () => Promise.resolve()
    e.userChoice = Promise.resolve({ outcome: 'accepted' })
    window.dispatchEvent(e)
  })
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${OUT}/10-install-prompt.png` })

  console.log('screenshots saved to', OUT)
  await browser.close()
})().catch(e => { console.error(e); process.exit(1) })
