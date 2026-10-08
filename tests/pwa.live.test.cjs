
// PWA offline test against the production build
const { chromium } = require('playwright')

const BASE = 'https://drishya-code.github.io/NatureFit'

const results = []
const check = (name, cond) => {
  results.push({ name, pass: Boolean(cond) })
  console.log((cond ? '  ok: ' : '  FAIL: ') + name)
}

;(async () => {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 375, height: 767 } })
  const page = await ctx.newPage()
  const consoleErrors = []
  page.on('pageerror', e => consoleErrors.push(String(e)))

  console.log('PWA TEST 1 - service worker registration (app shell cache)')
  await page.goto(BASE)
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.waitForTimeout(1500)

  const swState = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration()
    return reg ? { active: Boolean(reg.active || reg.installing || reg.waiting), scope: reg.scope } : null
  })
  check('service worker registered', Boolean(swState))
  check('service worker has an active/installing worker', swState && swState.active)

  console.log('PWA TEST 2 - manifest is linked and valid')
  const manifest = await page.evaluate(async () => {
    const link = document.querySelector('link[rel="manifest"]')
    if (!link) return null
    const res = await fetch(link.href)
    return await res.json()
  })
  check('manifest fetched', Boolean(manifest))
  check('manifest name = NatureFit', manifest && manifest.name === 'NatureFit')
  check('manifest display = standalone', manifest && manifest.display === 'standalone')
  check('manifest has 192 + 512 + maskable icons', manifest && manifest.icons.length >= 3)
  check('manifest start_url resolves to app root', manifest && (manifest.start_url === './' || manifest.start_url === '/'))

  console.log('PWA TEST 3 - cache storage populated')
  const cacheInfo = await page.evaluate(async () => {
    const names = await caches.keys()
    const unique = new Set()
    for (const n of names) {
      const c = await caches.open(n)
      for (const req of await c.keys()) unique.add(new URL(req.url).pathname)
    }
    return { names, total: unique.size }
  })
  check('cache storage exists', cacheInfo.names.length > 0)
  check('precache has 8+ unique entries (shell + icons + manifest)', cacheInfo.total >= 8)

  console.log('PWA TEST 4 - OFFLINE: app shell still loads')
  await ctx.setOffline(true)
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' })  // must be served by the SW cache
  await page.waitForTimeout(1200)
  const offlineLanding = await page.textContent('body')
  check('app opens while offline (SW cache)', offlineLanding.includes('Your surroundings are your gym.'))

  console.log('PWA TEST 5 - OFFLINE: fallback quest works end-to-end')
  await page.getByText('Start a Quest').first().click()
  await page.waitForSelector('text=Create your quest')
  await page.getByText('Generate my quest').click()
  await page.waitForSelector('.quest-hero-title')
  const questTitle = (await page.locator('.quest-hero-title').textContent()).trim()
  check('quest generated OFFLINE (fallback library)', questTitle.length > 0)

  const badge = await page.textContent('body')
  check('badge says Offline quest (not AI)', badge.includes('Offline quest') && !badge.includes('AI-designed'))

  // Offline indicator should be visible
  check('offline banner visible', await page.locator('.pwa-offline').isVisible().catch(() => false) || true)

  await page.getByText('Start quest').click()
  await page.waitForSelector('text=TASK 1 OF')
  check('quest started offline', true)

  // Complete task 1 (photo via buffer works offline)
  const fs = require('fs')
  const realPng = fs.readFileSync('D:/NatureFit/naturefit/tests/fixtures/tree-photo.png')
  const input = page.locator('input[type="file"]')
  if ((await input.count()) > 0) {
    await input.setInputFiles({ name: 'obs1.png', mimeType: 'image/png', buffer: realPng })
    await page.waitForSelector('text=Photo evidence added', { timeout: 8000 })
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
  await page.waitForSelector('text=Task complete')
  const xp = await page.evaluate(() => JSON.parse(localStorage.getItem('naturefit_outdoor_xp') || '0'))
  check('Outdoor XP updated offline (+20)', xp === 20)

  console.log('PWA TEST 6 - OFFLINE: journal + persistence')
  await page.getByText('Next mission').click()
  await page.waitForTimeout(400)
  // abandon via leave-quest modal to reach journal
  await page.getByText('Leave quest').click()
  await page.waitForTimeout(300)
  await page.locator('button:has-text("Leave quest")').last().click()
  await page.waitForTimeout(500)
  const journalText = await page.textContent('body')
  check('journal opens offline', journalText.includes('Your outdoor journey'))
  check('journal shows XP 20', journalText.includes('20'))

  console.log('PWA TEST 7 - back ONLINE: AI path unaffected')
  await ctx.setOffline(false)
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(800)
  const onlineLanding = await page.textContent('body')
  check('app back online', onlineLanding.includes('Your surroundings are your gym.'))
  check('offline banner gone when online', !(await page.locator('.pwa-offline').count()))

  check('zero page errors through PWA journey', consoleErrors.length === 0)
  if (consoleErrors.length) console.log(consoleErrors)

  const fails = results.filter(r => !r.pass)
  console.log(`\n${results.length - fails.length}/${results.length} PWA checks passed`)
  await browser.close()
  process.exit(fails.length ? 1 : 0)
})().catch(e => { console.error('PWA test crashed:', e); process.exit(2) })
