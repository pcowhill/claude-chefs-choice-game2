import { chromium } from 'playwright'
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
await page.goto('http://localhost:4173/')
await page.waitForTimeout(3000)
await page.screenshot({ path: 'shots/prod-title.png' })
const px = await page.evaluate(() => {
  const c = document.getElementById('game')
  const g = c.getContext('2d')
  const d = g.getImageData(0, 0, c.width, c.height).data
  let lit = 0
  for (let i = 0; i < d.length; i += 40) { if (d[i] + d[i+1] + d[i+2] > 30) lit++ }
  return lit
})
console.log('non-black samples:', px, px > 500 ? 'SCREEN NOT BLANK' : 'POSSIBLY BLANK')
await browser.close()
