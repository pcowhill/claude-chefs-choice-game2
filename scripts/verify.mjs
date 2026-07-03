// Playwright driver: walks EARSHOT through every state and screenshots each.
import { chromium } from 'playwright'
import fs from 'node:fs'

const SHOTS = process.env.SHOTS ?? '/home/user/claude-chefs-choice-game2/shots'
fs.mkdirSync(SHOTS, { recursive: true })

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
page.on('console', (m) => { if (m.type() === 'error') console.log('[console.error]', m.text()) })
page.on('pageerror', (e) => console.log('[pageerror]', e.message))

const shot = async (name) => {
  await page.screenshot({ path: `${SHOTS}/${name}.png` })
  console.log('shot:', name)
}
const state = async () => page.evaluate(() => window.__earshot?.state())

await page.goto('http://localhost:5173/?debug=1')
await page.waitForTimeout(3200)
await shot('01-title')

// enter game
await page.mouse.click(960, 540)
await page.waitForTimeout(1000)
console.log('after click:', JSON.stringify(await state()))
await shot('02-briefing')
await page.waitForTimeout(3000)
await shot('03-briefing-typed')

// release clamps
await page.keyboard.press('Space')
await page.waitForTimeout(1500)
console.log('gameplay:', JSON.stringify(await state()))
await shot('04-gameplay-start')

// move around, ping
await page.keyboard.down('KeyW')
await page.waitForTimeout(1200)
await page.keyboard.press('Space')
await page.waitForTimeout(700)
await shot('05-ping-mid')
await page.waitForTimeout(1300)
await page.keyboard.up('KeyW')
await shot('06-ping-revealed')

// fire a torpedo toward cursor
await page.mouse.move(1300, 400)
await page.mouse.click(1300, 400)
await page.waitForTimeout(500)
await shot('07-torpedo')
console.log('mid:', JSON.stringify(await state()))

// pause menu
await page.keyboard.press('Escape')
await page.waitForTimeout(400)
await shot('08-pause')
await page.keyboard.press('Escape')
await page.waitForTimeout(300)

// skip to hatch and descend -> upgrade screen
await page.evaluate(() => { window.__earshot.god(); window.__earshot.skipZone() })
await page.waitForTimeout(2200)
console.log('post-skip:', JSON.stringify(await state()))
await shot('09-upgrade')

// pick upgrade 1 -> briefing z2 -> play
await page.keyboard.press('Digit1')
await page.waitForTimeout(800)
await shot('10-briefing-z2')
await page.keyboard.press('Space')
await page.waitForTimeout(1200)
await shot('11-gameplay-z2')
console.log('z2:', JSON.stringify(await state()))

// death screen
await page.evaluate(() => window.__earshot.die())
await page.waitForTimeout(2500)
await shot('12-death')
console.log('dead:', JSON.stringify(await state()))

// restart with R
await page.keyboard.press('KeyR')
await page.waitForTimeout(900)
console.log('restarted:', JSON.stringify(await state()))
await page.keyboard.press('Space')
await page.waitForTimeout(600)

// jump to finale and win
await page.evaluate(() => { window.__earshot.zone(5) })
await page.waitForTimeout(1500)
await shot('13-finale')
console.log('finale:', JSON.stringify(await state()))
await page.evaluate(() => { window.__earshot.god(); window.__earshot.skipZone() })
await page.waitForTimeout(2600)
console.log('post-beacon:', JSON.stringify(await state()))
await shot('14-win')

await browser.close()
console.log('DONE')
