// Unattended soak test: autopilot plays the real game; we sample progress.
import { chromium } from 'playwright'
import fs from 'node:fs'

const SHOTS = '/home/user/claude-chefs-choice-game2/shots'
fs.mkdirSync(SHOTS, { recursive: true })

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
page.on('pageerror', (e) => console.log('[pageerror]', e.message))

await page.goto('http://localhost:5173/?debug=1')
await page.waitForTimeout(1500)
await page.mouse.click(960, 540)   // gesture so audio ctx can init
await page.waitForTimeout(300)
await page.evaluate(() => window.__earshot.setAuto(true))

const MINUTES = Number(process.env.SOAK_MIN ?? 5)
const samples = []
let lastShotZone = -1
for (let i = 0; i < MINUTES * 6; i++) {
  await page.waitForTimeout(10000)
  const s = await page.evaluate(() => ({
    ...window.__earshot.state(),
    stats: window.__earshot.app.run ? {
      kills: window.__earshot.app.run.stats.kills,
      fired: window.__earshot.app.run.stats.torpsFired,
      hit: window.__earshot.app.run.stats.torpsHit,
      detected: window.__earshot.app.run.stats.timesDetected,
      dmg: Math.round(window.__earshot.app.run.stats.damageTaken)
    } : null
  }))
  samples.push(s)
  console.log(JSON.stringify(s))
  if (s.state === 'playing' && s.zone !== lastShotZone) {
    lastShotZone = s.zone
    await page.screenshot({ path: `${SHOTS}/soak-z${s.zone}.png` })
  }
}
await page.screenshot({ path: `${SHOTS}/soak-final.png` })
await browser.close()

const zones = new Set(samples.map((s) => s.zone))
const maxKills = Math.max(...samples.map((s) => s.stats?.kills ?? 0))
console.log('SUMMARY zones-seen:', [...zones].join(','), 'max-kills-in-a-run:', maxKills)
console.log('DONE')
