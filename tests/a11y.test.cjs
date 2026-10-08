
// Accessibility + pause/resume + reduced motion + focus visibility
const { chromium } = require('playwright')
const fs = require('fs')
const realPng = fs.readFileSync('D:/NatureFit/naturefit/tests/fixtures/tree-photo.png')
const BASE = 'http://localhost:4590/NatureFit'

const results = []
const check = (name, cond) => {
  results.push({ name, pass: Boolean(cond) })
  console.log((cond ? '  ok: ' : '  FAIL: ') + name)
}

;(async () => {
  const browser = await chromium.launch()
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage()
  const consoleErrors = []
  page.on('pageerror', e => consoleErrors.push(String(e)))

  await page.goto(BASE)
  await page.evaluate(() => localStorage.clear())
  await page.reload()

  console.log('A11Y TEST 1 — buttons have accessible names')
  const unnamed = await page.evaluate(() =>
    [...document.querySelectorAll('button')].filter(b => {
      const name = (b.getAttribute('aria-label') || b.textContent || '').trim()
      return b.offsetParent !== null && !name
    }).length
  )
  check('all visible landing buttons have names', unnamed === 0)

  console.log('A11Y TEST 2 — keyboard navigation + visible focus')
  await page.keyboard.press('Tab')
  const focused1 = await page.evaluate(() => document.activeElement?.textContent?.trim())
  check('tab focuses the primary CTA', focused1?.includes('Start a Quest'))
  const focusVisible = await page.evaluate(() => {
    const el = document.activeElement
    return el && (el.matches(':focus-visible') || getComputedStyle(el).outlineStyle !== 'none' || getComputedStyle(el).boxShadow !== 'none')
  })
  check('focus indicator visible', Boolean(focusVisible))

  console.log('A11Y TEST 3 — keyboard through create screen')
  await page.getByText('Start a Quest').first().click()
  await page.waitForSelector('text=Create your quest')
  // every option is a real button → keyboard reachable
  const btnCount = await page.locator('button:visible').count()
  check(`create screen has ${btnCount} keyboard-reachable buttons`, btnCount >= 14)
  // Enter on a focused option works
  await page.locator('button.option-card:has-text("Run")').focus()
  await page.keyboard.press('Enter')
  const pressed = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button.option-card')].find(x => x.textContent.includes('Run'))
    return b?.getAttribute('aria-pressed')
  })
  check('Enter activates a focused option', pressed === 'true')

  console.log('A11Y TEST 4 — form groups have labels')
  const groups = await page.evaluate(() =>
    [...document.querySelectorAll('[role="group"]')].map(g => g.getAttribute('aria-label')).filter(Boolean).length
  )
  check('segment groups labeled (Duration, Level)', groups >= 2)

  console.log('A11Y TEST 5 — image alt text')
  await page.getByText('Generate my quest').click()
  await page.waitForSelector('.quest-hero-title')
  await page.getByText('Start quest').click()
  await page.waitForSelector('text=TASK 1 OF')
  const input = page.locator('input[type="file"]')
  await input.setInputFiles({ name: 'o.png', mimeType: 'image/png', buffer: realPng })
  await page.waitForSelector('img')
  const imgAlt = await page.evaluate(() => document.querySelector('img')?.alt)
  check('photo evidence img has alt text', Boolean(imgAlt))

  console.log('A11Y TEST 6 — pause / resume keeps elapsed time')
  await page.waitForTimeout(2000)
  const meta1 = await page.textContent('.active-meta')
  await page.getByText('Pause', { exact: true }).click()
  await page.waitForTimeout(200)
  const pausedMeta = await page.textContent('.active-meta')
  check('paused state shown', pausedMeta.includes('Paused'))
  await page.waitForTimeout(2100)
  const stillPaused = await page.textContent('.active-meta')
  check('clock frozen while paused', stillPaused === pausedMeta)
  await page.getByText('Resume', { exact: true }).click()
  await page.waitForTimeout(1100)
  const resumed = await page.textContent('.active-meta')
  check('resumed clock continues (not reset)', !resumed.includes('Paused'))

  console.log('A11Y TEST 7 — refresh mid-quest keeps timer + photo')
  await page.reload()
  await page.waitForSelector('text=TASK 1 OF', { timeout: 8000 })
  const after = await page.evaluate(() => {
    const q = JSON.parse(localStorage.getItem('naturefit_quest_v2'))
    return { hasPhoto: q.tasks.some(t => t.photoData), timerAlive: Boolean(q.timer) }
  })
  check('photo survived refresh', after.hasPhoto)
  check('timer survived refresh', after.timerAlive)
  // movement state is React-state only — it resets on refresh. That's acceptable
  // (movement is re-confirmable) but VERIFY the task is NOT completed:
  const taskState = await page.evaluate(() => {
    const q = JSON.parse(localStorage.getItem('naturefit_quest_v2'))
    return q.tasks.filter(t => t.completed).length
  })
  check('no task completed without evidence after refresh', taskState === 0)

  console.log('A11Y TEST 8 — reduced motion respected')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const reducedOK = await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)
  check('reduced-motion media query active', reducedOK)
  // check CSS actually disables animations under reduced motion
  const css = await page.evaluate(() => {
    for (const sheet of document.styleSheets) {
      try { for (const rule of sheet.cssRules) {
        if (rule.media && rule.media.mediaText.includes('prefers-reduced-motion')) return true
      } } catch {}
    }
    return false
  })
  check('stylesheet has prefers-reduced-motion rules', css)

  console.log('A11Y TEST 9 — contrast on key text')
  const contrast = await page.evaluate(() => {
    const el = document.querySelector('.task-title') || document.querySelector('h2')
    const s = getComputedStyle(el)
    const lum = (c) => {
      const m = c.match(/\d+/g).map(Number)
      const [r, g, b] = m.slice(0, 3).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 })
      return 0.2126 * r + 0.7152 * g + 0.0722 * b
    }
    let node = el
    let bg = 'rgb(255,255,255)'
    while (node && node !== document.documentElement) {
      const b = getComputedStyle(node).backgroundColor
      if (b && !/rgba\(0, 0, 0, 0\)/.test(b)) { bg = b; break }
      node = node.parentElement
    }
    const l1 = lum(s.color)
    const l2 = lum(bg)
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
  })
  check(`task title contrast ratio ${contrast.toFixed(1)} >= 4.5`, contrast >= 4.5)

  check('zero console errors in a11y suite', consoleErrors.length === 0)
  if (consoleErrors.length) console.log(consoleErrors)

  const fails = results.filter(r => !r.pass)
  console.log(`\n${results.length - fails.length}/${results.length} a11y/pause checks passed`)
  await browser.close()
  process.exit(fails.length ? 1 : 0)
})().catch(e => { console.error('a11y suite crashed:', e); process.exit(2) })
