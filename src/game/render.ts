// World rendering: phosphor echoes, wavefront rings, contact ghosts, the sub.
// Everything luminous draws with 'lighter' over near-black.

import { VIEW_W, VIEW_H, COLORS, ECHO, PLAYER, type CreatureKind } from '../config'
import { clamp, TAU, dist, angleTo } from '../engine/math'
import { glowSprite, drawGlow, drawText } from '../engine/gfx'
import type { Run } from './types'

const phosGlow = (): HTMLCanvasElement => glowSprite('#3dd68c', 26)
const brightGlow = (): HTMLCanvasElement => glowSprite('#b4ffd9', 32)
const amberGlow = (): HTMLCanvasElement => glowSprite('#ffb454', 30)
const whiteGlow = (): HTMLCanvasElement => glowSprite('#eafff4', 40)

function alertColor(alert: number): string {
  return alert >= 2 ? COLORS.red : alert === 1 ? COLORS.amber : COLORS.phos
}

export function drawWorld(run: Run, ctx: CanvasRenderingContext2D): void {
  const cam = run.camera
  const p = run.player

  ctx.fillStyle = COLORS.bg
  ctx.fillRect(0, 0, VIEW_W, VIEW_H)

  ctx.save()
  cam.apply(ctx)

  // ---- silt motes: cheap parallax so motion reads even in blackness -----
  ctx.globalCompositeOperation = 'lighter'
  const MOTE_CELL = 170
  const mx0 = Math.floor(cam.left / MOTE_CELL) - 1
  const my0 = Math.floor(cam.top / MOTE_CELL) - 1
  ctx.fillStyle = COLORS.phos
  for (let gy = my0; gy < my0 + Math.ceil(VIEW_H / MOTE_CELL) + 2; gy++) {
    for (let gx = mx0; gx < mx0 + Math.ceil(VIEW_W / MOTE_CELL) + 2; gx++) {
      let h = (gx * 374761393 + gy * 668265263) | 0
      h = (h ^ (h >> 13)) * 1274126177
      h = (h ^ (h >> 16)) >>> 0
      for (let i = 0; i < 3; i++) {
        const ox = ((h >> (i * 5)) & 31) / 31
        const oy = ((h >> (i * 5 + 8)) & 31) / 31
        const wx = (gx + ox) * MOTE_CELL
        const wy = (gy + oy) * MOTE_CELL + Math.sin(run.time * 0.4 + h + i) * 6
        const d = dist(wx, wy, p.x, p.y)
        if (d > 340) continue
        const a = (1 - d / 340) * 0.16
        ctx.globalAlpha = a
        ctx.fillRect(wx, wy, 1.6, 1.6)
      }
    }
  }
  ctx.globalAlpha = 1

  // ---- terrain echo dots -------------------------------------------------
  const fade = ECHO.dotFade * run.d.echoFadeMult
  const dots = run.world.dots
  ctx.fillStyle = COLORS.phos
  const pg = phosGlow()
  for (let i = 0; i < dots.length; i++) {
    const d = dots[i]
    if (d.lit < 0) continue
    const age = run.time - d.lit
    if (age > fade) continue
    if (!cam.onScreen(d.x, d.y, 20)) continue
    const k = 1 - age / fade
    const a = d.glow * k * Math.sqrt(k)
    if (a < 0.012) continue
    const size = 1.4 + a * 2.1
    ctx.globalAlpha = Math.min(a * 1.35, 1)
    ctx.fillRect(d.x - size / 2, d.y - size / 2, size, size)
    if (a > 0.55) drawGlow(ctx, pg, d.x, d.y, 0.42, (a - 0.55) * 0.5)
  }
  ctx.globalAlpha = 1

  // ---- wavefront rings ---------------------------------------------------
  for (const wf of run.wavefronts) {
    const prog = wf.r / wf.maxR
    const a = (1 - prog) * 0.55 * (wf.strength + 0.3)
    if (a < 0.02 || !cam.onScreen(wf.x, wf.y, wf.r + 40)) continue
    const col = wf.fromKind === 'creature' ? COLORS.amber : wf.fromKind === 'player' ? COLORS.phosBright : COLORS.phos
    ctx.strokeStyle = col
    ctx.globalAlpha = a
    ctx.lineWidth = 2.2
    ctx.beginPath()
    ctx.arc(wf.x, wf.y, wf.r, 0, TAU)
    ctx.stroke()
    if (wf.r > 18) {
      ctx.globalAlpha = a * 0.35
      ctx.lineWidth = 1.2
      ctx.beginPath()
      ctx.arc(wf.x, wf.y, wf.r - 12, 0, TAU)
      ctx.stroke()
    }
  }
  ctx.globalAlpha = 1

  // ---- hardware markers --------------------------------------------------
  drawMines(run, ctx)
  drawPickups(run, ctx)
  drawVents(run, ctx)
  drawHatch(run, ctx)

  // ---- contact ghosts ----------------------------------------------------
  for (const g of run.ghosts) {
    const age = run.time - g.t
    const a = g.strength * clamp(1 - age / g.fade, 0, 1)
    if (a < 0.02 || !cam.onScreen(g.x, g.y, 120)) continue
    drawCreatureShape(ctx, g.kind, g.x, g.y, g.heading, a, alertColor(g.alert), g.segs)
  }
  // live flash for creatures that just got hit (feedback without a ping)
  for (const c of run.creatures) {
    if (c.dead || c.hitFlash <= 0) continue
    drawCreatureShape(ctx, c.kind, c.x, c.y, c.heading, clamp(c.hitFlash * 3.2, 0, 1), COLORS.white,
      c.segs ? c.segs.map((s) => ({ x: s.x, y: s.y })) : null)
  }

  // ---- torpedoes ---------------------------------------------------------
  const bg = brightGlow()
  for (const t of run.torpedoes) {
    if (t.trail.length > 1) {
      ctx.strokeStyle = COLORS.phosBright
      ctx.lineWidth = 1.6
      ctx.beginPath()
      ctx.moveTo(t.trail[0].x, t.trail[0].y)
      for (let i = 1; i < t.trail.length; i++) ctx.lineTo(t.trail[i].x, t.trail[i].y)
      ctx.globalAlpha = 0.3
      ctx.stroke()
      ctx.globalAlpha = 1
    }
    drawGlow(ctx, bg, t.x, t.y, 0.5, 0.9)
    ctx.fillStyle = COLORS.white
    ctx.fillRect(t.x - 2, t.y - 2, 4, 4)
  }

  // ---- decoys -------------------------------------------------------------
  const ag = amberGlow()
  for (const d of run.decoys) {
    const blink = 0.55 + 0.45 * Math.sin(run.time * 11)
    ctx.strokeStyle = COLORS.amber
    ctx.globalAlpha = blink
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(d.x - 7, d.y); ctx.lineTo(d.x + 7, d.y)
    ctx.moveTo(d.x, d.y - 7); ctx.lineTo(d.x, d.y + 7)
    ctx.stroke()
    drawGlow(ctx, ag, d.x, d.y, 0.6, blink * 0.5)
    ctx.globalAlpha = 1
  }

  // ---- particles ----------------------------------------------------------
  for (const pt of run.particles) {
    const k = clamp(pt.life / pt.maxLife, 0, 1)
    switch (pt.kind) {
      case 'spark': {
        ctx.strokeStyle = COLORS.phosBright
        ctx.globalAlpha = k * 0.9
        ctx.lineWidth = 1.4
        ctx.beginPath()
        ctx.moveTo(pt.x, pt.y)
        ctx.lineTo(pt.x - pt.vx * 0.03, pt.y - pt.vy * 0.03)
        ctx.stroke()
        break
      }
      case 'debris': {
        ctx.fillStyle = COLORS.amber
        ctx.globalAlpha = k * 0.8
        ctx.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size)
        break
      }
      case 'bubble': {
        ctx.strokeStyle = COLORS.phos
        ctx.globalAlpha = k * 0.3
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.arc(pt.x, pt.y, pt.size, 0, TAU)
        ctx.stroke()
        break
      }
      case 'flash': {
        drawGlow(ctx, whiteGlow(), pt.x, pt.y, pt.size * k, k * 0.8)
        break
      }
    }
  }
  ctx.globalAlpha = 1

  // ---- the sub ------------------------------------------------------------
  if (!p.dead) drawSub(run, ctx)

  // ---- score popups -------------------------------------------------------
  ctx.globalCompositeOperation = 'source-over'
  for (const pop of run.popups) {
    const k = clamp(1 - pop.t / 1.6, 0, 1)
    drawText(ctx, pop.text, pop.x, pop.y - 24 - pop.t * 30, 24, COLORS.phosBright, 'center', k)
  }

  ctx.restore()

  // ---- screen-space vignette + damage flashes -----------------------------
  ctx.fillStyle = vignetteGradient(ctx)
  ctx.fillRect(0, 0, VIEW_W, VIEW_H)

  if (p.hurtFlash > 0) {
    ctx.fillStyle = `rgba(255,60,40,${clamp(p.hurtFlash * 0.5, 0, 0.32)})`
    ctx.fillRect(0, 0, VIEW_W, VIEW_H)
  }
  if (run.detectedFlash > 0) {
    ctx.globalAlpha = clamp(run.detectedFlash, 0, 1) * (0.5 + 0.5 * Math.sin(run.time * 9)) * 0.22
    ctx.fillStyle = dangerGradient(ctx)
    ctx.fillRect(0, 0, VIEW_W, VIEW_H)
    ctx.globalAlpha = 1
  }
}

let vigCache: CanvasGradient | null = null
function vignetteGradient(ctx: CanvasRenderingContext2D): CanvasGradient {
  if (!vigCache) {
    vigCache = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.32, VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.78)
    vigCache.addColorStop(0, 'rgba(0,0,0,0)')
    vigCache.addColorStop(1, 'rgba(1,6,4,0.72)')
  }
  return vigCache
}

let dangerCache: CanvasGradient | null = null
function dangerGradient(ctx: CanvasRenderingContext2D): CanvasGradient {
  if (!dangerCache) {
    dangerCache = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.42, VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.75)
    dangerCache.addColorStop(0, 'rgba(255,80,64,0)')
    dangerCache.addColorStop(1, 'rgba(255,80,64,1)')
  }
  return dangerCache
}

function drawSub(run: Run, ctx: CanvasRenderingContext2D): void {
  const p = run.player
  const blink = p.iframes > 0 ? (Math.sin(run.time * 26) > 0 ? 0.35 : 1) : 1

  // aim line + reticle
  const aa = angleTo(p.x, p.y, p.aimX, p.aimY)
  const ad = Math.min(dist(p.x, p.y, p.aimX, p.aimY), 230)
  ctx.globalCompositeOperation = 'lighter'
  ctx.strokeStyle = COLORS.phos
  ctx.globalAlpha = 0.22
  ctx.setLineDash([4, 9])
  ctx.lineWidth = 1.4
  ctx.beginPath()
  ctx.moveTo(p.x + Math.cos(aa) * 24, p.y + Math.sin(aa) * 24)
  ctx.lineTo(p.x + Math.cos(aa) * ad, p.y + Math.sin(aa) * ad)
  ctx.stroke()
  ctx.setLineDash([])
  // reticle at cursor with reload arc
  const rx = p.aimX, ry = p.aimY
  const reloadFrac = p.reload > 0 ? 1 - p.reload / (PLAYER.torpReload * run.d.reloadMult) : 1
  ctx.globalAlpha = 0.75
  ctx.strokeStyle = p.ammo > 0 ? (reloadFrac >= 1 ? COLORS.phosBright : COLORS.phos) : COLORS.red
  ctx.lineWidth = 1.8
  ctx.beginPath()
  ctx.arc(rx, ry, 11, -Math.PI / 2, -Math.PI / 2 + TAU * reloadFrac)
  ctx.stroke()
  ctx.globalAlpha = 0.5
  ctx.beginPath()
  ctx.moveTo(rx - 16, ry); ctx.lineTo(rx - 6, ry)
  ctx.moveTo(rx + 6, ry); ctx.lineTo(rx + 16, ry)
  ctx.moveTo(rx, ry - 16); ctx.lineTo(rx, ry - 6)
  ctx.moveTo(rx, ry + 6); ctx.lineTo(rx, ry + 16)
  ctx.stroke()
  ctx.globalAlpha = 1

  // ping cooldown ring around the hull
  const pingFrac = 1 - p.pingCd / (PLAYER.pingCooldown * run.d.pingCdMult)
  if (pingFrac < 1) {
    ctx.strokeStyle = COLORS.phos
    ctx.globalAlpha = 0.4
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(p.x, p.y, 23, -Math.PI / 2, -Math.PI / 2 + TAU * pingFrac)
    ctx.stroke()
    ctx.globalAlpha = 1
  } else {
    const pulse = 0.25 + 0.15 * Math.sin(run.time * 4)
    ctx.strokeStyle = COLORS.phosBright
    ctx.globalAlpha = pulse
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.arc(p.x, p.y, 23, 0, TAU)
    ctx.stroke()
    ctx.globalAlpha = 1
  }

  // hull
  ctx.save()
  ctx.translate(p.x, p.y)
  ctx.rotate(p.heading)
  ctx.globalAlpha = blink
  ctx.strokeStyle = COLORS.white
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(16, 0)
  ctx.quadraticCurveTo(6, -8.5, -9, -6.5)
  ctx.quadraticCurveTo(-13.5, 0, -9, 6.5)
  ctx.quadraticCurveTo(6, 8.5, 16, 0)
  ctx.closePath()
  ctx.stroke()
  ctx.fillStyle = 'rgba(180,255,217,0.13)'
  ctx.fill()
  // tail fin + sail
  ctx.beginPath()
  ctx.moveTo(-9, 0); ctx.lineTo(-16, -5)
  ctx.moveTo(-9, 0); ctx.lineTo(-16, 5)
  ctx.moveTo(1, -3); ctx.lineTo(-3, -3)
  ctx.stroke()
  if (p.flanking) {
    ctx.strokeStyle = COLORS.amber
    ctx.globalAlpha = blink * (0.5 + 0.5 * Math.sin(run.time * 22))
    ctx.beginPath()
    ctx.moveTo(-14, -3); ctx.lineTo(-22, 0); ctx.lineTo(-14, 3)
    ctx.stroke()
  }
  ctx.restore()
  drawGlow(ctx, brightGlow(), p.x, p.y, 0.85, 0.2 * blink)
  ctx.globalAlpha = 1
}

export function drawCreatureShape(
  ctx: CanvasRenderingContext2D,
  kind: CreatureKind,
  x: number, y: number, heading: number,
  alpha: number, color: string,
  segs: { x: number; y: number }[] | null
): void {
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.globalAlpha = alpha
  ctx.strokeStyle = color
  ctx.lineWidth = 2

  if (kind === 'leviathan' && segs) {
    // serpent: head + jaw + tapering chain, batched into one stroke
    ctx.beginPath()
    ctx.arc(x, y, 30, 0, TAU)
    ctx.moveTo(x + Math.cos(heading - 0.5) * 30, y + Math.sin(heading - 0.5) * 30)
    ctx.lineTo(x + Math.cos(heading) * 48, y + Math.sin(heading) * 48)
    ctx.lineTo(x + Math.cos(heading + 0.5) * 30, y + Math.sin(heading + 0.5) * 30)
    for (let i = 0; i < segs.length; i++) {
      const r = 26 * (1 - i / segs.length) + 5
      ctx.moveTo(segs[i].x + r, segs[i].y)
      ctx.arc(segs[i].x, segs[i].y, r, 0, TAU)
    }
    ctx.stroke()
    ctx.restore()
    return
  }

  ctx.translate(x, y)
  ctx.rotate(heading)
  switch (kind) {
    case 'drifter': {
      ctx.beginPath()
      ctx.ellipse(0, 0, 15, 10, 0, 0, TAU)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(-13, 0); ctx.lineTo(-22, -7)
      ctx.moveTo(-13, 0); ctx.lineTo(-22, 7)
      ctx.stroke()
      break
    }
    case 'stalker': {
      ctx.beginPath()
      ctx.moveTo(18, 0)
      ctx.lineTo(-10, -9)
      ctx.lineTo(-4, 0)
      ctx.lineTo(-10, 9)
      ctx.closePath()
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(-8, -13); ctx.lineTo(-15, -18)
      ctx.moveTo(-8, 13); ctx.lineTo(-15, 18)
      ctx.stroke()
      break
    }
    case 'screecher': {
      ctx.beginPath()
      ctx.arc(0, 0, 12, 0, TAU)
      ctx.stroke()
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * TAU
        ctx.beginPath()
        ctx.moveTo(Math.cos(a) * 13, Math.sin(a) * 13)
        ctx.lineTo(Math.cos(a) * 20, Math.sin(a) * 20)
        ctx.stroke()
      }
      break
    }
    case 'mauler': {
      ctx.beginPath()
      ctx.moveTo(26, -8)
      ctx.lineTo(26, 8)
      ctx.lineTo(2, 22)
      ctx.lineTo(-22, 12)
      ctx.lineTo(-22, -12)
      ctx.lineTo(2, -22)
      ctx.closePath()
      ctx.stroke()
      // tusks
      ctx.beginPath()
      ctx.moveTo(26, -8); ctx.lineTo(36, -3)
      ctx.moveTo(26, 8); ctx.lineTo(36, 3)
      ctx.stroke()
      break
    }
    default: break
  }
  // heading tick
  ctx.globalAlpha = alpha * 0.7
  ctx.beginPath()
  ctx.moveTo(22, 0)
  ctx.lineTo(30, 0)
  ctx.stroke()
  ctx.restore()
}

function drawMines(run: Run, ctx: CanvasRenderingContext2D): void {
  for (const m of run.mines) {
    if (m.dead) continue
    const armed = m.fuse >= 0
    const age = run.time - m.seenT
    if (!armed && (m.seenT < 0 || age > ECHO.markerFade)) continue
    const a = armed ? 1 : clamp(1 - age / ECHO.markerFade, 0, 1) * 0.8
    if (!run.camera.onScreen(m.x, m.y, 40)) continue
    const col = armed ? COLORS.red : COLORS.amber
    ctx.strokeStyle = col
    ctx.globalAlpha = armed ? (Math.sin(run.time * 30) > 0 ? 1 : 0.3) : a
    ctx.setLineDash([3, 4])
    ctx.lineWidth = 1.6
    ctx.beginPath()
    ctx.arc(m.x, m.y, 13, 0, TAU)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = col
    ctx.beginPath()
    ctx.arc(m.x, m.y, 3.4, 0, TAU)
    ctx.fill()
    // spikes
    for (let i = 0; i < 6; i++) {
      const sa = (i / 6) * TAU + 0.3
      ctx.beginPath()
      ctx.moveTo(m.x + Math.cos(sa) * 6, m.y + Math.sin(sa) * 6)
      ctx.lineTo(m.x + Math.cos(sa) * 9.5, m.y + Math.sin(sa) * 9.5)
      ctx.stroke()
    }
    ctx.globalAlpha = 1
  }
}

function drawPickups(run: Run, ctx: CanvasRenderingContext2D): void {
  for (const pk of run.pickups) {
    if (pk.dead || pk.seenT < 0) continue
    const age = run.time - pk.seenT
    if (age > ECHO.markerFade) continue
    if (!run.camera.onScreen(pk.x, pk.y, 40)) continue
    const a = clamp(1 - age / ECHO.markerFade, 0.15, 1) * (0.65 + 0.35 * Math.sin(run.time * 3 + pk.bob))
    const y = pk.y + Math.sin(run.time * 1.7 + pk.bob) * 3
    ctx.globalAlpha = a
    ctx.lineWidth = 2
    switch (pk.kind) {
      case 'torp':
      case 'salvage': {
        ctx.strokeStyle = COLORS.phosBright
        ctx.beginPath()
        ctx.moveTo(pk.x, y - 9)
        ctx.lineTo(pk.x + 8, y + 7)
        ctx.lineTo(pk.x - 8, y + 7)
        ctx.closePath()
        ctx.stroke()
        break
      }
      case 'repair': {
        ctx.strokeStyle = COLORS.phosBright
        ctx.beginPath()
        ctx.moveTo(pk.x - 8, y); ctx.lineTo(pk.x + 8, y)
        ctx.moveTo(pk.x, y - 8); ctx.lineTo(pk.x, y + 8)
        ctx.stroke()
        ctx.strokeRect(pk.x - 11, y - 11, 22, 22)
        break
      }
      case 'decoy': {
        ctx.strokeStyle = COLORS.amber
        ctx.beginPath()
        ctx.moveTo(pk.x, y - 9)
        ctx.lineTo(pk.x + 9, y)
        ctx.lineTo(pk.x, y + 9)
        ctx.lineTo(pk.x - 9, y)
        ctx.closePath()
        ctx.stroke()
        break
      }
    }
    ctx.globalAlpha = 1
  }
}

function drawVents(run: Run, ctx: CanvasRenderingContext2D): void {
  for (const v of run.vents) {
    if (v.seenT < 0) continue
    const age = run.time - v.seenT
    if (age > ECHO.markerFade) continue
    if (!run.camera.onScreen(v.x, v.y, 40)) continue
    const a = clamp(1 - age / ECHO.markerFade, 0, 1) * 0.5
    ctx.strokeStyle = COLORS.phos
    ctx.globalAlpha = a
    ctx.lineWidth = 1.6
    for (let i = 0; i < 3; i++) {
      const yy = v.y - 4 - i * 7 - ((run.time * 9) % 7)
      ctx.beginPath()
      ctx.moveTo(v.x - 7 + i, yy)
      ctx.quadraticCurveTo(v.x + i - 3, yy - 4, v.x + 7 - i, yy)
      ctx.stroke()
    }
    ctx.globalAlpha = 1
  }
}

function drawHatch(run: Run, ctx: CanvasRenderingContext2D): void {
  const w = run.world
  const finale = run.zoneIdx === 5
  const hx = finale ? run.beaconX : w.hatchX
  const hy = finale ? run.beaconY : w.hatchY
  const known = finale ? run.beaconKnown : (run.hatchOpen || w.hatchSeenT >= 0)
  if (!known) return
  if (!run.camera.onScreen(hx, hy, 80)) return
  const open = finale || run.hatchOpen
  const col = open ? COLORS.phosBright : COLORS.hudDim
  const pulse = open ? 0.55 + 0.45 * Math.sin(run.time * 3.4) : 0.4
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.globalAlpha = pulse
  ctx.strokeStyle = col
  ctx.lineWidth = 2.4
  // diamond
  ctx.beginPath()
  ctx.moveTo(hx, hy - 14)
  ctx.lineTo(hx + 14, hy)
  ctx.lineTo(hx, hy + 14)
  ctx.lineTo(hx - 14, hy)
  ctx.closePath()
  ctx.stroke()
  // rotating ring
  const ra = run.time * (open ? 1.6 : 0.4)
  ctx.setLineDash([10, 14])
  ctx.lineDashOffset = -ra * 20
  ctx.beginPath()
  ctx.arc(hx, hy, 26, 0, TAU)
  ctx.stroke()
  ctx.setLineDash([])
  if (open) {
    const p = run.player
    if (dist(p.x, p.y, hx, hy) < 420) {
      drawText(ctx, finale ? 'ASCENT STATION' : 'DROP SHAFT', hx, hy - 44, 22, col, 'center', pulse, 8)
      if (dist(p.x, p.y, hx, hy) < 90) {
        drawText(ctx, finale ? 'HOLD POSITION TO ASCEND' : 'HOLD POSITION TO DESCEND', hx, hy + 46, 19, COLORS.phos, 'center', 0.9)
      }
    }
    // dwell progress
    if (run.player.dwell > 0) {
      const frac = run.player.dwell / (finale ? 1.4 : 0.9)
      ctx.globalAlpha = 0.9
      ctx.strokeStyle = COLORS.white
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.arc(hx, hy, 34, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(frac, 0, 1))
      ctx.stroke()
    }
  }
  ctx.restore()
}
