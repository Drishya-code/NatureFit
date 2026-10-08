
const { chromium } = require('playwright')
;(async () => {
  const browser = await chromium.launch()
  const viewports = [
    [375, 767, 'mobile-375'],
    [390, 844, 'mobile-390'],
    [768, 1024, 'tablet-768'],
    [1440, 900, 'desktop-1440']
  ]
  const problems = []
  for (const [w, h, label] of viewports) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } })
    const page = await ctx.newPage()
    await page.goto('http://localhost:4590')
    await page.evaluate(() => localStorage.clear())
    await page.reload()

    // check every screen for horizontal overflow
    const screens = [
      ['landing', async () => {}],
      ['create', async () => { await page.getByText('Start a Quest').first().click() }],
      ['briefing', async () => {
        await page.getByText('Start a Quest').first().click()
        await page.getByText('Generate my quest').click()
      }],
      ['active', async () => {
        await page.getByText('Start a Quest').first().click()
        await page.getByText('Generate my quest').click()
        await page.getByText('Start quest').click()
      }],
      ['phone-away', async () => {
        await page.getByText('Start a Quest').first().click()
        await page.getByText('Generate my quest').click()
        await page.getByText('Start quest').click()
        await page.getByText('Put phone away').click()
      }]
    ]
    for (const [screen, drive] of screens) {
      // reset to landing before driving each screen (quest state redirects otherwise)
      await page.evaluate(() => localStorage.clear())
      await page.goto('http://localhost:4590')
      await page.waitForTimeout(400)
      await drive()
      await page.waitForTimeout(600)
      const metrics = await page.evaluate(() => ({
        scrollW: document.documentElement.scrollWidth,
        clientW: document.documentElement.clientWidth,
        // clipped buttons: any button extending past viewport
        clipped: [...document.querySelectorAll('button, .btn')].filter(b => {
          const r = b.getBoundingClientRect()
          return r.width > 0 && (r.right > window.innerWidth + 1 || r.left < -1)
        }).length,
        // overlapping visible text blocks
        bodyH: document.body.scrollHeight
      }))
      const overflow = metrics.scrollW - metrics.clientW
      if (overflow > 1) problems.push(`${label}/${screen}: horizontal overflow ${overflow}px`)
      if (metrics.clipped > 0) problems.push(`${label}/${screen}: ${metrics.clipped} clipped buttons`)
    }
    await page.screenshot({ path: `D:/NatureFit/naturefit/tests/qa-${label}-landing.png`, fullPage: true })
    await ctx.close()
  }
  console.log(problems.length ? 'PROBLEMS:\n' + problems.join('\n') : 'ALL VIEWPORTS CLEAN — no overflow, no clipped buttons')
  await browser.close()
  process.exit(problems.length ? 1 : 0)
})().catch(e => { console.error(e); process.exit(2) })
