// Deep-zone soak: drop the autopilot into zone 3, let it fight to the finale.
// Separately verify the leviathan pipeline (ping -> beacon -> hunt -> ascent).
import { chromium } from 'playwright'
import fs from 'node:fs'

const SHOTS = '/home/user/claude-chefs-choice-game2/shots'
fs.mkdirSync(SHOTS, { recursive: true })

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
page.on('pageerror', (e) => console.log('[pageerror]', e.message))

await page.goto('http://localhost:5173/?debug=1')
await page.waitForTimeout(1500)
await page.mouse.click(960, 540)
await page.waitForTimeout(800)
await page.keyboard.press('Space')       // through briefing into zone 0
await page.waitForTimeout(500)
await page.evaluate(() => { window.__earshot.zone(3); window.__earshot.setAuto(true) })

console.log('--- deep soak from zone 3 ---')
for (let i = 0; i < 24; i++) {
  await page.waitForTimeout(10000)
  const s = await page.evaluate(() => window.__earshot.state())
  console.log(JSON.stringify(s))
  if (i === 8) await page.screenshot({ path: `${SHOTS}/soak-deep-a.png` })
  if (s.state === 'won') break
}
await page.screenshot({ path: `${SHOTS}/soak-deep-final.png` })

console.log('--- finale pipeline (fresh, zone 5, god for observation) ---')
await page.evaluate(() => {
  window.__earshot.setAuto(false)
  window.__earshot.app.run = null
})
await page.reload()
await page.waitForTimeout(1500)
await page.mouse.click(960, 540)
await page.waitForTimeout(800)
await page.keyboard.press('Space')
await page.waitForTimeout(500)
await page.evaluate(() => { window.__earshot.zone(5); window.__earshot.god(); window.__earshot.setAuto(true) })
for (let i = 0; i < 18; i++) {
  await page.waitForTimeout(10000)
  const s = await page.evaluate(() => ({
    ...window.__earshot.state(),
    beacon: window.__earshot.app.run?.beaconKnown ?? null
  }))
  console.log(JSON.stringify(s))
  if (i === 3) await page.screenshot({ path: `${SHOTS}/soak-finale.png` })
  if (s.state === 'won') { console.log('FINALE WON NATURALLY'); break }
}
await page.screenshot({ path: `${SHOTS}/soak-finale-final.png` })
await browser.close()
console.log('DONE')
