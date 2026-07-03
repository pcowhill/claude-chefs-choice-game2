import { chromium } from 'playwright'
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
await page.goto('http://localhost:5173/?debug=1')
await page.waitForTimeout(1500)
await page.mouse.click(960, 540)
await page.waitForTimeout(800)
await page.keyboard.press('Space')
await page.waitForTimeout(400)
// zone 5; drive toward the leviathan so its ping catches us on-screen together
await page.evaluate(() => { window.__earshot.zone(5); window.__earshot.god() })
await page.evaluate(() => {
  const r = window.__earshot.app.run
  const lev = r.creatures.find(c => c.kind === 'leviathan')
  r.player.x = lev.x + 320; r.player.y = lev.y + 140
})
await page.keyboard.press('Space') // ping to paint it
await page.waitForTimeout(900)
await page.screenshot({ path: 'shots/leviathan.png' })
// fps measure over 4s while pinging a dense zone
const fps = await page.evaluate(() => new Promise((res) => {
  let frames = 0
  const t0 = performance.now()
  const tick = () => { frames++; if (performance.now() - t0 < 4000) requestAnimationFrame(tick); else res(frames / 4) }
  requestAnimationFrame(tick)
}))
console.log('FPS:', fps)
await browser.close()
