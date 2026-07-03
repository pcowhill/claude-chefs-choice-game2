import { chromium } from 'playwright'
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
const measure = () => page.evaluate(() => new Promise((res) => {
  let frames = 0
  const t0 = performance.now()
  const tick = () => { frames++; if (performance.now() - t0 < 3000) requestAnimationFrame(tick); else res(Math.round(frames / 3)) }
  requestAnimationFrame(tick)
}))
await page.goto('about:blank')
console.log('blank rAF FPS:', await measure())
await page.goto('http://localhost:5173/?debug=1')
await page.waitForTimeout(2500)
console.log('title FPS:', await measure())
await page.mouse.click(960, 540)
await page.waitForTimeout(600)
await page.keyboard.press('Space')
await page.waitForTimeout(1000)
console.log('gameplay quiet FPS:', await measure())
await browser.close()
