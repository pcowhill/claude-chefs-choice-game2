import { chromium } from 'playwright'
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
page.on('pageerror', (e) => console.log('[pageerror]', e.message))
await page.goto('http://localhost:5173/?debug=1')
await page.waitForTimeout(1500)
await page.mouse.click(960, 540)
await page.waitForTimeout(800)
await page.keyboard.press('Space')
await page.waitForTimeout(400)
await page.evaluate(() => { window.__earshot.zone(5); window.__earshot.god(); window.__earshot.setAuto(true) })
let won = false
for (let i = 0; i < 90; i++) {
  await page.waitForTimeout(2000)
  const s = await page.evaluate(() => ({ state: window.__earshot.state().state, zone: window.__earshot.state().zone, beacon: window.__earshot.app.run?.beaconKnown }))
  if (i % 5 === 0 || s.state !== 'playing') console.log(i * 2 + 's', JSON.stringify(s))
  if (s.state === 'won') {
    console.log('FINALE WON NATURALLY - leviathan pipeline verified')
    await page.screenshot({ path: '/home/user/claude-chefs-choice-game2/shots/finale-won.png' })
    won = true
    break
  }
}
if (!won) await page.screenshot({ path: '/home/user/claude-chefs-choice-game2/shots/finale-stuck.png' })
await browser.close()
console.log('DONE won=' + won)
