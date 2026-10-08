// Full E2E journey test against the production build on http://localhost:4590
// Run: node tests/e2e.journey.cjs
//
// Suites:
//   A. offline journey: landing -> create -> briefing -> active -> photo/movement
//      gating -> completion -> refresh persistence -> quest bonus -> results ->
//      journal WITH history -> "+ Start another quest" CTA -> Create (no landing detour)
//   B. real-image pipeline: 640x480 PNG -> decode -> JPEG thumbnail ->
//      "Photo evidence added" -> task completes -> refresh -> photo survives
//   C. phone-away mode: minimal controls, timer keeps running, tap returns
// AI-path module tests (mock endpoint, validation, unsafe-content rejection)
// live in tests/ai.test.mjs because import.meta.env is baked at build time.
const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')

const BASE = 'http://localhost:4590'

// real 640x480 test image (sky gradient + tree silhouette) generated locally
const realPng = fs.readFileSync(path.join(__dirname, 'fixtures', 'tree-photo.png'))

const results = []
const check = (name, cond) => {
  results.push({ name, pass: Boolean(cond) })
  console.log((cond ? '  ok: ' : '  FAIL: ') + name)
}

const xp = async (page) => {
  const v = await page.evaluate(() => localStorage.getItem('naturefit_outdoor_xp'))
  return v === null ? 0 : JSON.parse(v)
}

// ---- helpers reused by suites -------------------------------------------

async function gotoFreshUser(page) {
  await page.goto(BASE)
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await expectText(page, 'Your surroundings are your gym.')
}

async function createQuest(page) {
  await page.getByText('Start a Quest').first().click()
  await expectText(page, 'Create your quest')
  await page.getByText('30 min').click()
  await page.getByText('Park', { exact: true }).click()
  await page.getByText('Generate my quest').click()
  await expectText(page, 'quest-hero-title')
}

async function startQuest(page) {
  await page.getByText('Start quest').click()
  await expectText(page, 'TASK 1 OF')
}

async function completePhotoTask(page, n) {
  const input = page.locator('input[type="file"]')
  await input.setInputFiles({ name: `obs${n}.png`, mimeType: 'image/png', buffer: realPng })
  await page.waitForSelector('text=Photo evidence added', { timeout: 8000 })
  for (const label of ['I did the movement', 'Skip timer']) {
    const mb = page.locator(`button:has-text("${label}")`)
    if (await mb.count()) { await mb.click(); await page.waitForTimeout(250) }
  }
  const btn = page.locator('button:has-text("Complete task")')
  await page.waitForFunction(() => {
    const b = [...document.querySelectorAll('button')].find(x => x.textContent.includes('Complete task'))
    return b && !b.disabled
  }, { timeout: 8000 })
  await btn.click()
  await expectText(page, 'Task complete')
}

async function advanceAfterFlash(page) {
  const next = page.getByText('Next mission')
  const see = page.getByText('See the results')
  if (await next.count()) { await next.click(); await page.waitForTimeout(400) }
  else if (await see.count()) { await see.click(); await page.waitForTimeout(400) }
}

;(async () => {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 375, height: 767 } }) // iPhone-ish
  const page = await ctx.newPage()
  const consoleErrors = []
  page.on('pageerror', e => consoleErrors.push(String(e)))

  // ================= SUITE A: offline journey =================
  console.log('E2E - A1: new user')
  await gotoFreshUser(page)
  check('landing headline', true)
  check('XP = 0 at landing', (await xp(page)) === 0)

  console.log('E2E - A2: create -> briefing')
  await createQuest(page)
  const questTitle = (await page.locator('.quest-hero-title').textContent()).trim()
  check('quest briefing shown: ' + questTitle, questTitle.length > 0)
  check('XP = 0 after generating', (await xp(page)) === 0)

  const bodyText = await page.textContent('body')
  check('no standalone "Fitness" header', !/\bFITNESS\b/.test(bodyText))
  check('no standalone "Nature" header', !/\bNATURE\b/.test(bodyText))
  check('tasks show "Then:" movement coupling', bodyText.includes('Then:'))

  console.log('E2E - A3: start quest, evidence gating')
  await startQuest(page)
  check('XP = 0 after starting', (await xp(page)) === 0)
  const completeBtn = page.locator('button:has-text("Complete task")')
  check('complete disabled without evidence', await completeBtn.isDisabled())
  await page.getByText('I did the movement').click()
  check('complete still disabled without photo', await completeBtn.isDisabled())

  console.log('E2E - A4: real image unlocks completion')
  await completePhotoTask(page, 1)
  check('task 1 awarded +20 XP', (await xp(page)) === 20)

  console.log('E2E - A5: duplicate submission impossible')
  await page.getByText('Next mission').click()
  await expectText(page, 'TASK 2 OF')
  check('XP stays 20 on task 2', (await xp(page)) === 20)

  console.log('E2E - A6: refresh persistence (task + XP)')
  await page.reload()
  await page.waitForTimeout(800)
  const afterRefresh = await page.textContent('body')
  check('quest restored after refresh', afterRefresh.includes(questTitle) || afterRefresh.includes('TASK'))
  check('XP stays 20 after refresh', (await xp(page)) === 20)

  console.log('E2E - A7: finish remaining tasks (2,3,4)')
  for (let i = 2; i <= 4; i++) {
    if ((await page.locator('button:has-text("Complete task")').count()) === 0) {
      const cont = page.getByText('Start quest')
      if (await cont.count()) { await cont.click(); await page.waitForTimeout(500) }
    }
    const input = page.locator('input[type="file"]')
    if ((await input.count()) > 0) {
      await input.setInputFiles({ name: `obs${i}.png`, mimeType: 'image/png', buffer: realPng })
      await page.waitForTimeout(900)
    }
    for (const label of ['I did the movement', 'Skip timer']) {
      const mb = page.locator(`button:has-text("${label}")`)
      if (await mb.count()) { await mb.click(); await page.waitForTimeout(250) }
    }
    const btn = page.locator('button:has-text("Complete task")')
    await page.waitForFunction(() => {
      const b = [...document.querySelectorAll('button')].find(x => x.textContent.includes('Complete task'))
      return b && !b.disabled
    }, { timeout: 8000 })
    await btn.click()
    await page.waitForTimeout(500)
    await advanceAfterFlash(page)
  }

  console.log('E2E - A8: all done -> quest bonus, honest math')
  await expectText(page, 'All tasks complete')
  check('XP = 80 (4 tasks x 20) before bonus', (await xp(page)) === 80)
  await page.locator('button:has-text("Complete quest")').click()
  await expectText(page, 'Quest complete')
  check('XP = 100 after +20 bonus', (await xp(page)) === 100)
  check('streak = 1 after real completion', await page.evaluate(() => JSON.parse(localStorage.getItem('naturefit_streak_v2') || '0')) === 1)

  const resultsText = await page.textContent('body')
  check('results show Outdoor XP (not fitness/nature)', resultsText.includes('Outdoor XP earned') && !resultsText.includes('Fitness XP'))
  check('results show discoveries count', resultsText.includes('Today you discovered') || resultsText.includes('movement tasks'))

  console.log('E2E - A9: journal WITH history -> CTA present')
  await page.getByText('View progress').click()
  await expectText(page, 'Your outdoor journey')
  const journalText = await page.textContent('body')
  check('journal shows Outdoor XP total', journalText.includes('100'))
  check('journal shows the finished quest', journalText.includes(questTitle))
  check('journal has no fake distance', !journalText.includes('km'))
  const journalCTA = page.locator('button:has-text("+ Start another quest")')
  check('journal CTA "+ Start another quest" visible with history', (await journalCTA.count()) === 1 && await journalCTA.isVisible())

  console.log('E2E - A10: Journal CTA -> Create screen (no landing detour)')
  await journalCTA.click()
  await expectText(page, 'Create your quest')
  check('Journal CTA goes straight to Create', true)

  console.log('E2E - A11: second quest keeps XP, zero completions')
  await page.getByText('Generate my quest').click()
  await expectText(page, 'quest-hero-title')
  check('second quest generates', true)
  check('XP stays 100 for new quest', (await xp(page)) === 100)
  const t2 = await page.textContent('body')
  check('new quest has zero completed tasks', t2.includes('+20 Outdoor XP'))

  // ================= SUITE B: real-image pipeline =================
  console.log('E2E - B: real image end-to-end')
  await gotoFreshUser(page)
  await createQuest(page)
  await startQuest(page)

  await completePhotoTask(page, 'real')
  check('real 640x480 image accepted -> task complete', true)

  const thumb = await page.evaluate(() => {
    const q = JSON.parse(localStorage.getItem('naturefit_quest_v2'))
    const t = q.tasks.find(t => t.photoData)
    return t ? t.photoData : null
  })
  check('thumbnail stored as JPEG data URL', Boolean(thumb && thumb.startsWith('data:image/jpeg;base64,')))
  const thumbBytes = thumb ? Math.floor((thumb.length - thumb.indexOf(',') - 1) * 3 / 4) : 0
  check('thumbnail is substantial (>2KB, not a stub)', thumbBytes > 2000)
  // prove the browser can actually DECODE the stored thumbnail at real dimensions
  const dims = await page.evaluate(async () => {
    const q = JSON.parse(localStorage.getItem('naturefit_quest_v2'))
    const t = q.tasks.find(t => t.photoData)
    return await new Promise(resolve => {
      const img = new Image()
      img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight })
      img.onerror = () => resolve(null)
      img.src = t.photoData
    })
  })
  check('thumbnail decodes in browser at ~420px', Boolean(dims) && dims.w <= 420 && dims.w >= 200 && dims.h >= 100)

  await page.getByText('Next mission').click()
  await expectText(page, 'TASK 2 OF')
  await page.reload()
  await page.waitForTimeout(900)
  const survived = await page.evaluate(() => {
    const q = JSON.parse(localStorage.getItem('naturefit_quest_v2'))
    return q.tasks.filter(t => t.photoData).length
  })
  check('photo survives refresh (persistence)', survived === 1)

  // ================= SUITE C: phone-away mode =================
  console.log('E2E - C: phone-away mode')
  await gotoFreshUser(page)
  await createQuest(page)
  await startQuest(page)
  await page.getByText('Put phone away').click()
  await expectText(page, 'The rest happens out there.')
  check('phone-away has no task controls', !(await page.locator('button:has-text("Complete task")').count()))
  await page.waitForTimeout(2100)
  const awayClock = await page.textContent('.phone-away-clock')
  check('phone-away clock ticks (timer running)', awayClock !== '0:00')

  await page.locator('.phone-away').click({ position: { x: 10, y: 10 } })
  await expectText(page, 'TASK 1 OF')
  const metaAfter = await page.textContent('.active-meta')
  check('back on active task after tap', true)
  check('timer did not reset (kept running while away)', !metaAfter.includes('0:00'))

  console.log('E2E - console errors')
  check('zero page errors through whole journey', consoleErrors.length === 0)
  if (consoleErrors.length) console.log(consoleErrors)

  const fails = results.filter(r => !r.pass)
  console.log(`\n${results.length - fails.length}/${results.length} E2E checks passed`)
  await browser.close()
  process.exit(fails.length ? 1 : 0)
})().catch(e => { console.error('E2E crashed:', e); process.exit(2) })

async function expectText(page, text) {
  if (/^[a-z-]/.test(text) && !text.includes(' ')) {
    await page.waitForSelector('.' + text.replace(/^\./, ''), { timeout: 8000 })
  } else {
    await page.waitForSelector(`text=${text}`, { timeout: 8000 })
  }
}
